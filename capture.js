/* MAIN world: observe existing MediaRecorder output; never request a microphone,
   start/stop a recording, replace a take, or change the site's playback. */
(() => {
  'use strict';
  const KEY = '__choicerLocalExporterV1';
  if (window[KEY]) return;
  const state = { takes: new Map(), activeRoot: null };
  window[KEY] = state;
  const roots = () => [...document.querySelectorAll('.dubpack-player')];
  const packKey = root => location.origin + location.pathname + '#' +
    (root.dataset.manifest || root.dataset.pack || 'player');
  function currentLine(root) {
    const n = root?.querySelector('.dp-clip-num')?.textContent.match(/(\d+)\s*\/\s*\d+/);
    return n ? Number(n[1]) - 1 : null;
  }
  function metadata(root) {
    return { key: packKey(root), pageUrl: location.href,
      manifestUrl: root.dataset.manifest ? new URL(root.dataset.manifest, location.href).href : null,
      packUrl: root.dataset.pack ? new URL(root.dataset.pack, location.href).href : null,
      title: root.querySelector('.dp-title')?.textContent || document.title };
  }
  const dataURL = blob => new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob);
  });
  async function preserve(root, index, blob, recordedAt = Date.now()) {
    if (!root || !Number.isInteger(index) || index < 0 || !blob?.size) return;
    const meta = metadata(root);
    const take = { index, data: await dataURL(blob), recordedAt };
    if ((state.takes.get(meta.key + ':' + index)?.take.recordedAt || 0) > recordedAt) return;
    // Keep raw blobs in this tab too if extension storage is temporarily unavailable.
    state.takes.set(meta.key + ':' + index, { ...meta, take });
    window.postMessage({ type: 'CHOICER_LOCAL_TAKE_V1', meta, take }, location.origin);
  }
  document.addEventListener('click', e => {
    const root = e.target instanceof Element && e.target.closest('.dubpack-player');
    if (root) {
      state.activeRoot = root;
      const button = e.target.closest('button');
      if (button && (button.textContent.trim() === 'RECORD' || button.classList.contains('dp-mic')) && !button.classList.contains('on'))
        window.__choicerSilentPreviewV1?.prepare(root, currentLine(root));
    }
  }, true);
  document.addEventListener('keydown', () => {
    const visible = roots().filter(r => { const b = r.getBoundingClientRect(); return b.top < innerHeight && b.bottom > 0; });
    if (visible.length === 1) state.activeRoot = visible[0];
  }, true);
  const nativeStart = window.MediaRecorder?.prototype.start;
  if (nativeStart) {
    window.MediaRecorder.prototype.start = function (...args) {
      const root = state.activeRoot || (roots().length === 1 ? roots()[0] : null);
      const index = currentLine(root), chunks = [], recordedAt = Date.now();
      let stopPreview = () => {};
      const onData = e => { if (e.data?.size) chunks.push(e.data); };
      const onStop = () => {
        stopPreview();
        this.removeEventListener('dataavailable', onData);
        this.removeEventListener('stop', onStop);
        if (chunks.length) preserve(root, index, new Blob(chunks, {type: this.mimeType || chunks[0].type}), recordedAt)
          .catch(e => console.warn('Choicer backup failed:', e));
      };
      this.addEventListener('dataavailable', onData);
      this.addEventListener('stop', onStop);
      try {
        const result = Reflect.apply(nativeStart, this, args);
        try { stopPreview = window.__choicerSilentPreviewV1?.start(root, index) || stopPreview; }
        catch (e) { console.warn('Silent preview unavailable:', e); }
        return result;
      }
      catch (e) { this.removeEventListener('dataavailable', onData); this.removeEventListener('stop', onStop); throw e; }
    };
  }
  // __dp is available only in the session previously inspected through DevTools.
  // No debugger permissions or private-closure tricks are used by this extension.
  state.snapshot = async () => {
    const p = window.__dp;
    if (p?.root?.matches?.('.dubpack-player') && p.takes) {
      await Promise.all(Object.entries(p.takes).map(([i, t]) => preserve(p.root, +i, t.blob)));
    }
    return [...state.takes.values()];
  };
})();
