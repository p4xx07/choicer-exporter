import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const code = await readFile(new URL('../preview.js',import.meta.url),'utf8');
function setup(enabled=true) {
  class Media {muted=false;currentTime=7;paused=true;play(){this.paused=false;return Promise.resolve()}pause(){this.paused=true}}
  class Audio extends Media {}
  const video=new Media(),audio=new Audio();
  const nativePlay=Media.prototype.play;
  video.play=function(){return Media.prototype.play.call(this).then(()=>audio.play())};
  const root={querySelector:s=>s==='video'?video:null};
  const window={HTMLMediaElement:Media,__dp:{root,manifest:{lines:[{timestamp:2.5}]}}};
  vm.runInNewContext(code,{window,HTMLAudioElement:Audio,document:{querySelectorAll:()=>[],documentElement:{}},
    localStorage:{getItem:()=>String(enabled)},MutationObserver:class{observe(){}},location:{href:'https://thechoicervoicergames.com/pack',origin:'https://thechoicervoicergames.com'},console});
  return {api:window.__choicerSilentPreviewV1,root,video,audio,nativePlay};
}
test('record preview restarts exact line silently, mutes detached backing audio and restores on stop',async()=>{
  const s=setup();const stop=s.api.start(s.root,0);await new Promise(r=>setImmediate(r));
  assert.equal(s.video.currentTime,2.5);assert.equal(s.video.paused,false);assert.equal(s.video.muted,true);assert.equal(s.audio.muted,true);
  stop();assert.equal(s.video.paused,true);assert.equal(s.audio.paused,true);assert.equal(s.video.muted,false);assert.equal(s.audio.muted,false);
  stop(); // Idempotent cleanup.
});
test('disabled preview leaves the video untouched',()=>{
  const s=setup(false);s.api.prepare(s.root,0);s.api.start(s.root,0)();
  assert.equal(s.video.currentTime,7);assert.equal(s.video.paused,true);assert.equal(s.video.muted,false);
});
