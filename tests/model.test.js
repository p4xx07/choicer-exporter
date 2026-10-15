import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeManifest, validateTake, mediaURL, scheduleTakes} from '../model.js';
const base = 'https://thechoicervoicergames.com/wp-content/uploads/dubpacks/demo/manifest.json';
const raw = {title:'Demo', video:'assets/video.mp4', backingTrack:'assets/bed.mp3', lines:[{timestamp:1}, {timestamp:2.5}]};
test('relative media resolves against manifest directory, not the game page', () => {
  const m = normalizeManifest(raw, base);
  assert.equal(m.video, new URL('assets/video.mp4', base).href);
  assert.equal(m.backingTrack, new URL('assets/bed.mp3', base).href);
});
test('import cannot fetch unrelated hosts, credential URLs, or executable URLs', () => {
  for (const url of ['https://evil.example/a','javascript:alert(1)','https://a:b@thechoicervoicergames.com/a','http://thechoicervoicergames.com/a']) assert.throws(() => mediaURL(url));
});
test('invalid indices, audio payloads and timestamps are rejected', () => {
  const meta = {key: 'https://thechoicervoicergames.com/pack', pageUrl: 'https://thechoicervoicergames.com/pack'};
  assert.equal(validateTake(meta,{index:0,data:'data:audio/webm;codecs=opus;base64,AQID'}).take.index,0);
  for (const t of [{index:-1,data:'data:audio/webm;base64,AQID'},{index:0,data:'data:text/html;base64,AQID'},{index:0,data:'bad'}]) assert.throws(() => validateTake(meta,t));
  assert.throws(() => normalizeManifest({...raw,lines:[{timestamp:-1}]},base));
});
test('line indices retain original timestamps, overlaps, gaps and absent lines', () => {
  const m = normalizeManifest(raw,base);
  const result = scheduleTakes(m.lines,[{index:0},{index:1}],2);
  assert.deepEqual(result,[{index:0,start:1}]);
  assert.deepEqual(scheduleTakes(m.lines,[{index:1}],5),[{index:1,start:2.5}]);
  assert.throws(() => scheduleTakes(m.lines,[{index:2}],5));
});
