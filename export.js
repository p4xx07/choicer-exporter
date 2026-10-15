import {normalizeManifest, validateTake, safeFilename, ORIGIN, mediaURL} from './model.js';
import {renderDub} from './render.js';
const $ = id => document.getElementById(id);
let packs = [], selected, controller, previewURL;
function status(text, error = false) { $('status').textContent = text; $('status').classList.toggle('error', error); }
async function message(payload) { const r = await chrome.runtime.sendMessage(payload); if (!r?.ok) throw Error(r?.error || 'Extension unavailable'); return r; }
async function loadList(prefer) {
  packs = (await message({type: 'list'})).packs;
  $('packs').replaceChildren();
  for (const pack of packs) { const o = document.createElement('option'); o.value = pack.key; o.textContent = pack.title; $('packs').append(o); }
  if (prefer && packs.some(p => p.key === prefer)) $('packs').value = prefer;
  await selectPack();
}
async function selectPack() {
  selected = null; $('export').disabled = true; $('backup').disabled = true;
  const meta = packs.find(p => p.key === $('packs').value);
  if (!meta) { $('summary').textContent = 'No saved takes yet. Record a line in the game, or import a recording backup.'; return; }
  const takes = (await message({type: 'takes', key: meta.key})).takes;
  selected = {meta, takes};
  $('summary').textContent = `${takes.length} recorded ${takes.length === 1 ? 'line' : 'lines'} saved on this device.`;
  $('export').disabled = !takes.length; $('backup').disabled = !takes.length;
}
async function manifestFor(meta) {
  if (meta.manifest) return normalizeManifest(meta.manifest, ORIGIN);
  if (!meta.manifestUrl) throw Error('This folder-based pack needs a JSON backup with a manifest. This version supports the site’s manifest-based packs.');
  const url = mediaURL(meta.manifestUrl), r = await fetch(url, {credentials: 'omit'});
  if (!r.ok) throw Error(`Pack metadata download failed (HTTP ${r.status}).`);
  return normalizeManifest(await r.json(), url);
}
function download(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function handle(fn) { return async (...args) => { try { await fn(...args); } catch (e) { status(e.message, true); } }; }
$('packs').onchange = handle(selectPack);
$('refresh').onclick = handle(() => loadList($('packs').value));
$('backing').oninput = () => { $('volume').textContent = $('backing').value + '%'; };
$('import').onclick = () => { $('file').value = ''; $('file').click(); };
$('file').onchange = handle(async () => {
  const file = $('file').files[0]; if (!file) return;
  if (file.size > 100_000_000) throw Error('Backup exceeds the 100 MB import limit.');
  const backup = JSON.parse(await file.text());
  const manifest = normalizeManifest(backup.manifest, ORIGIN);
  if (!Array.isArray(backup.takes) || backup.takes.length > 10000 || !backup.takes.length) throw Error('This backup contains no valid takes.');
  const key = ORIGIN + '/imported#' + manifest.video;
  const meta = {key, pageUrl: ORIGIN + '/', title: manifest.title, manifest};
  const clean = backup.takes.map(t => {
    if (!manifest.lines[t.index]) throw Error('Recording index does not match the pack.');
    return validateTake(meta, t);
  });
  if (new Set(clean.map(t => t.take.index)).size !== clean.length) throw Error('Duplicate recording indices in backup.');
  for (const item of clean) await message({type: 'save-take', ...item});
  await loadList(key); status(`Imported ${clean.length} recordings. Ready to export.`);
});
$('backup').onclick = handle(async () => {
  if (!selected) return;
  const manifest = await manifestFor(selected.meta);
  download(new Blob([JSON.stringify({version: 1, manifest, takes: selected.takes.map(({index, data, recordedAt}) => ({index, data, recordedAt}))})], {type: 'application/json'}), safeFilename(manifest.title) + '-recordings-backup.json');
  status('Recording backup downloaded.');
});
function busy(value) {
  for (const id of ['export','import','backup','packs','refresh','backing']) $(id).disabled = value;
  $('cancel').hidden = !value;
}
$('cancel').onclick = () => controller?.abort();
$('export').onclick = handle(async () => {
  if (!selected) return;
  busy(true); controller = new AbortController(); $('canvas').hidden = false;
  $('preview').hidden = true; $('download').hidden = true; $('progress').value = 0;
  let audioContext;
  try {
    audioContext = new AudioContext({sampleRate: 48000}); await audioContext.resume();
    const manifest = await manifestFor(selected.meta);
    if (selected.takes.length < manifest.lines.length) status(`Exporting ${selected.takes.length} of ${manifest.lines.length} lines; missing lines will be silent.`);
    const result = await renderDub({manifest, takes: selected.takes, canvas: $('canvas'),
      backingVolume: Number($('backing').value) / 100, signal: controller.signal, audioContext,
      onProgress: (fraction, text) => { $('progress').value = fraction; status(text); }});
    if (previewURL) URL.revokeObjectURL(previewURL);
    previewURL = URL.createObjectURL(result.blob);
    $('preview').src = previewURL; $('preview').hidden = false; $('canvas').hidden = true;
    $('download').href = previewURL; $('download').download = safeFilename(manifest.title) + '-dub.' + result.extension;
    $('download').hidden = false; $('download').click();
    status(`Done · ${result.duration.toFixed(1)} seconds · ${(result.blob.size / 1048576).toFixed(1)} MB. Play it below or download again.`);
  } catch (e) { status(e.name === 'AbortError' ? 'Export cancelled. Your saved recordings are unchanged.' : e.message, e.name !== 'AbortError'); }
  finally { if (audioContext && audioContext.state !== 'closed') await audioContext.close(); controller = null; busy(false); }
});
window.addEventListener('beforeunload', event => { if (controller) { event.preventDefault(); event.returnValue = ''; } });
handle(async () => { await loadList(); const issue = new URLSearchParams(location.search).get('issue'); if (issue) status('Could not collect this tab: ' + issue, true); })();
