import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const code = await readFile(new URL('../capture.js', import.meta.url),'utf8');
function setup() {
  let starts=0;
  class Recorder extends EventTarget {
    mimeType='audio/webm';
    start() { if (this.running) throw Error('Already recording'); this.running=true; starts++; }
    finish(text) { const e=new Event('dataavailable'); e.data=new Blob([text],{type:this.mimeType}); this.dispatchEvent(e);this.running=false;this.dispatchEvent(new Event('stop')); }
  }
  class Reader { async readAsDataURL(blob) { this.result='data:'+blob.type+';base64,'+Buffer.from(await blob.arrayBuffer()).toString('base64');this.onload(); } }
  const root = {dataset:{manifest:'/demo/manifest.json'},querySelector:s=>s==='.dp-clip-num'?{textContent:'2 / 23'}:{textContent:'Demo'}};
  const messages=[];
  const window={MediaRecorder:Recorder,postMessage:m=>messages.push(m)};
  const context=vm.createContext({window,document:{querySelectorAll:()=>[root],addEventListener(){}},
    location:{origin:'https://thechoicervoicergames.com',pathname:'/demo/',href:'https://thechoicervoicergames.com/demo/'},
    FileReader:Reader,Blob,URL,Element:class{},innerHeight:900,console});
  vm.runInContext(code,context);
  return {window,context,Recorder,messages,starts:()=>starts};
}
test('observer never initiates recording and captures stopped audio with correct line', async () => {
  const s=setup(); assert.equal(s.starts(),0);
  const rec=new s.Recorder();rec.start();rec.finish('our voices');
  await new Promise(r=>setImmediate(r));
  assert.equal(s.starts(),1);assert.equal(s.messages.length,1);
  assert.equal(s.messages[0].take.index,1);
  assert.equal(Buffer.from(s.messages[0].take.data.split(',')[1],'base64').toString(),'our voices');
});
test('injection is idempotent and a retake replaces only the matching captured line', async () => {
  const s=setup();vm.runInContext(code,s.context);
  const rec=new s.Recorder();rec.start();rec.finish('first');await new Promise(r=>setImmediate(r));
  rec.start();rec.finish('second');await new Promise(r=>setImmediate(r));
  assert.equal(s.messages.length,2);assert.equal(s.window.__choicerLocalExporterV1.takes.size,1);
  assert.match([...s.window.__choicerLocalExporterV1.takes.values()][0].take.data,/c2Vjb25k$/);
});
test('native recording errors are preserved without adding duplicate listeners', async () => {
  const s=setup(),rec=new s.Recorder();rec.start();assert.throws(()=>rec.start(),/Already recording/);
  rec.finish('audio');await new Promise(r=>setImmediate(r));assert.equal(s.messages.length,1);
});
