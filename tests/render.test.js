import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderDub} from '../render.js';
const manifest = {video:'https://thechoicervoicergames.com/video.mp4',backingTrack:null,lines:[{timestamp:0.025}]};

function environment({hidden=false, failFetch=false}={}) {
  const saved = new Map(), timers=[], scheduled=[], tracks=[];
  const replace=(key,value)=>{saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});};
  class Video extends EventTarget {
    duration=0.1;videoWidth=1280;videoHeight=688;currentTime=0;
    set src(value) {this.url=value;queueMicrotask(()=>this.dispatchEvent(new Event('loadeddata')));}
    async play() {timers.push(setTimeout(()=>{this.currentTime=this.duration;this.dispatchEvent(new Event('ended'));},100));}
    pause(){this.paused=true;}removeAttribute(){}load(){}
  }
  const video=new Video();
  const track=()=>{const t={stopped:false,stop(){this.stopped=true;}};tracks.push(t);return t;};
  const stream={items:[track()],addTrack(t){this.items.push(t)},getTracks(){return this.items}};
  const canvas={getContext:()=>({drawImage(){}}),captureStream:()=>stream};
  class AC {
    state='running';currentTime=0;
    async resume(){}async close(){this.state='closed'}
    createMediaStreamDestination(){return {stream:{getAudioTracks:()=>[track()]}}}
    createDynamicsCompressor(){return {threshold:{},knee:{},ratio:{},attack:{},release:{},connect(){}}}
    async decodeAudioData(){return {duration:1}}
    createBufferSource(){return {connect(){},start(...args){scheduled.push(args)},stop(){}}}
  }
  class Recorder extends EventTarget {
    static isTypeSupported(type){return type==='video/mp4'}
    state='inactive';start(){this.state='recording'}
    stop(){this.state='inactive';const e=new Event('dataavailable');e.data=new Blob(['encoded-video']);this.dispatchEvent(e);queueMicrotask(()=>this.dispatchEvent(new Event('stop')))}
  }
  replace('document',{hidden,createElement:()=>video});replace('AudioContext',AC);replace('MediaRecorder',Recorder);
  replace('fetch',async()=>{if(failFetch)throw Error('Network unavailable');return {ok:true,blob:async()=>new Blob(['audio'])}});
  replace('navigator',{});
  return {canvas,scheduled,tracks,restore(){timers.forEach(clearTimeout);for(const[k,v]of saved){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k]}}};
}
test('render schedules audio at timestamps, trims scene end and closes tracks', async()=>{
  const e=environment();try {
    const result=await renderDub({manifest,takes:[{index:0,data:'data:audio/webm;base64,AQID'}],canvas:e.canvas});
    assert.equal(result.extension,'mp4');assert.ok(result.blob.size);assert.equal(result.duration,0.1);
    assert.deepEqual(e.scheduled,[[0.025,0,0.07500000000000001]]);
    assert.ok(e.tracks.every(t=>t.stopped));
  }finally{e.restore()}
});
test('hidden tab refuses a potentially desynchronized export and cleans up',async()=>{
  const e=environment({hidden:true});try {
    await assert.rejects(renderDub({manifest,takes:[{index:0,data:'data:audio/webm;base64,AQID'}],canvas:e.canvas}),/tab was hidden/);
    assert.ok(e.tracks.every(t=>t.stopped));
  }finally{e.restore()}
});
test('cancelled exports fail before downloading media',async()=>{
  const e=environment();try {
    const c=new AbortController();c.abort();
    await assert.rejects(renderDub({manifest,takes:[],canvas:e.canvas,signal:c.signal}),{name:'AbortError'});
  }finally{e.restore()}
});
test('media download errors are surfaced',async()=>{
  const e=environment({failFetch:true});try {
    await assert.rejects(renderDub({manifest,takes:[],canvas:e.canvas}),/Network unavailable/);
  }finally{e.restore()}
});
