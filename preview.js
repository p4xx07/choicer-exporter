/* Silent scene follow-along. Never starts/stops MediaRecorder or accesses a mic. */
(() => {
  'use strict';
  if (window.__choicerSilentPreviewV1) return;
  const controls = new Map(), manifests = new WeakMap();
  let active = null;
  const setting = 'choicer-exporter-silent-preview';
  let defaultEnabled = true;
  try { defaultEnabled = localStorage.getItem(setting) !== 'false'; } catch { /* storage unavailable */ }
  const notice = (root, text) => { const ui = controls.get(root); if (ui) ui.status.textContent = text; };
  function manifest(root) {
    return manifests.get(root) || (window.__dp?.root === root ? window.__dp.manifest : null);
  }
  function prepare(root, index) {
    if (!(controls.get(root)?.checkbox.checked ?? defaultEnabled)) return;
    const video = root?.querySelector('video'), time = Number(manifest(root)?.lines?.[index]?.timestamp);
    if (video && Number.isFinite(time) && time >= 0 && Math.abs(video.currentTime - time) > 0.01) {
      video.pause(); video.currentTime = time;
    }
  }
  // The site's backing track is a detached Audio element, so muting only the
  // visible <video> would still play sound. Mute Audio elements when played
  // during this preview, then restore their previous mute settings on stop.
  const nativePlay = window.HTMLMediaElement?.prototype.play;
  if (nativePlay) window.HTMLMediaElement.prototype.play = function (...args) {
    if (active && this instanceof HTMLAudioElement) {
      if (!active.muted.has(this)) active.muted.set(this, this.muted);
      this.muted = true;
    }
    return Reflect.apply(nativePlay, this, args);
  };
  function start(root, index) {
    if (!root || !(controls.get(root)?.checkbox.checked ?? defaultEnabled)) return () => {};
    const video = root.querySelector('video'), time = Number(manifest(root)?.lines?.[index]?.timestamp);
    if (!video || !Number.isFinite(time) || time < 0) {
      notice(root, 'Preview unavailable: pack timing has not loaded. Recording still works.'); return () => {};
    }
    active?.stop();
    const session = {muted: new Map(), videoMuted: video.muted, stopped: false};
    session.stop = () => {
      if (session.stopped) return; session.stopped = true;
      video.pause();
      for (const [audio, muted] of session.muted) { audio.pause(); audio.muted = muted; }
      video.muted = session.videoMuted;
      if (active === session) active = null;
      notice(root, 'Silent recording preview enabled.');
    };
    active = session; video.muted = true;
    try {
      prepare(root, index);
      Promise.resolve(video.play()).then(() => {
        if (session.stopped) video.pause();
        else notice(root, 'Silent scene playing. Use Record again to stop your take.');
      }, () => { session.stop(); notice(root, 'Chrome blocked preview playback. Your take is still recording.'); });
    } catch { session.stop(); notice(root, 'Preview could not start. Your take is still recording.'); }
    return session.stop;
  }
  function mount(root) {
    if (controls.has(root)) return;
    const panel = document.createElement('div');
    panel.style.cssText = 'padding:10px 14px;font:13px system-ui;color:#172c40;background:#eaf5fd;border-radius:10px;margin:8px 0';
    const label = document.createElement('label'), checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = defaultEnabled;
    const status = document.createElement('div'); status.style.marginTop = '5px'; status.setAttribute('role', 'status');
    label.append(checkbox, document.createTextNode(' Play scene silently while recording'));
    panel.append(label, status); root.append(panel); controls.set(root, {checkbox, status});
    status.textContent = defaultEnabled ? 'Silent recording preview enabled.' : 'Silent recording preview disabled.';
    checkbox.addEventListener('change', () => {
      defaultEnabled = checkbox.checked;
      try { localStorage.setItem(setting, String(checkbox.checked)); } catch { /* optional preference */ }
      if (!checkbox.checked) active?.stop();
      status.textContent = checkbox.checked ? 'Silent recording preview enabled.' : 'Silent recording preview disabled.';
    });
    if (root.dataset.manifest) {
      const url = new URL(root.dataset.manifest, location.href);
      if (url.origin === location.origin) fetch(url.href).then(r => { if (!r.ok) throw Error('Metadata failed'); return r.json(); })
        .then(m => manifests.set(root, m)).catch(() => notice(root, 'Pack timing unavailable; export backups still work.'));
    }
  }
  function scan() { document.querySelectorAll('.dubpack-player').forEach(mount); }
  window.__choicerSilentPreviewV1 = {prepare, start};
  scan();
  const observer = new MutationObserver(scan);
  observer.observe(document.documentElement || document, {subtree: true, childList: true});
})();
