import {scheduleTakes} from './model.js';

async function getBlob(url, signal) {
  const r = await fetch(url, {signal, credentials: 'omit'});
  if (!r.ok) throw Error(`Could not download media (HTTP ${r.status}).`);
  return r.blob();
}
function eventOnce(target, success, signal) {
  return new Promise((resolve, reject) => {
    const finish = (error) => { target.removeEventListener(success, ok); target.removeEventListener('error', bad); signal?.removeEventListener('abort', abort); error ? reject(error) : resolve(); };
    const ok = () => finish();
    const bad = () => finish(Error('This browser could not decode the source video.'));
    const abort = () => finish(new DOMException('Export cancelled', 'AbortError'));
    target.addEventListener(success, ok, {once: true}); target.addEventListener('error', bad, {once: true});
    signal?.addEventListener('abort', abort, {once: true});
    if (signal?.aborted) abort();
  });
}

// No microphone or desktop capture: the video is drawn to a canvas and the
// recorded audio buffers are scheduled against the pack's original timeline.
export async function renderDub({manifest, takes, canvas, backingVolume = 0.25, signal, audioContext, onProgress = () => {}}) {
  let ac, videoURL, timer, recorder, stream, wakeLock;
  const video = document.createElement('video');
  video.muted = true; video.playsInline = true; video.preload = 'auto';
  const sources = [], chunks = [];
  const check = () => { if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError'); };
  try {
    check(); onProgress(0, 'Downloading source video…');
    // Unlock audio while the Export button's user gesture is still active.
    ac = audioContext || new AudioContext({sampleRate: 48000}); await ac.resume();
    if (ac.state !== 'running') throw Error('Audio is paused by Chrome. Click Export again.');
    videoURL = URL.createObjectURL(await getBlob(manifest.video, signal));
    const ready = eventOnce(video, 'loadeddata', signal); video.src = videoURL; await ready;
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0 || !video.videoWidth) throw Error('Invalid source video.');
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const context = canvas.getContext('2d'); context.drawImage(video, 0, 0);
    const dest = ac.createMediaStreamDestination();
    // Compression prevents overlapping takes from clipping while keeping their
    // relative timing intact. There is no original dialogue mixed underneath.
    const limiter = ac.createDynamicsCompressor();
    limiter.threshold.value = -1; limiter.knee.value = 0; limiter.ratio.value = 20;
    limiter.attack.value = 0.003; limiter.release.value = 0.12; limiter.connect(dest);
    const scheduled = scheduleTakes(manifest.lines, takes, duration);
    onProgress(0, 'Decoding recordings…');
    const decoded = await Promise.all(scheduled.map(async take => ({...take,
      buffer: await ac.decodeAudioData(await (await getBlob(take.data, signal)).arrayBuffer())})));
    let bed;
    if (manifest.backingTrack && backingVolume > 0) {
      onProgress(0, 'Downloading backing track…');
      bed = await ac.decodeAudioData(await (await getBlob(manifest.backingTrack, signal)).arrayBuffer());
    }
    check();
    const mime = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm']
      .find(type => MediaRecorder.isTypeSupported(type));
    if (!mime) throw Error('Chrome has no supported video encoder.');
    stream = canvas.captureStream(30); dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
    recorder = new MediaRecorder(stream, {mimeType: mime, videoBitsPerSecond: 6000000, audioBitsPerSecond: 192000});
    recorder.addEventListener('dataavailable', e => { if (e.data.size) chunks.push(e.data); });
    let fail;
    const ended = new Promise((resolve, reject) => {
      fail = reject;
      recorder.addEventListener('stop', resolve, {once: true});
      recorder.addEventListener('error', e => reject(e.error || Error('Video encoding failed.')), {once: true});
    });
    ended.catch(() => {}); // Cleanup can reject before playback has started.
    const abort = () => { if (recorder.state !== 'inactive') recorder.stop(); fail(new DOMException('Export cancelled', 'AbortError')); };
    signal?.addEventListener('abort', abort, {once: true});
    try {
      try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* optional */ }
      check();
      recorder.start(1000); await video.play();
      const t0 = ac.currentTime;
      for (const take of decoded) {
        const source = ac.createBufferSource(); source.buffer = take.buffer; source.connect(limiter);
        source.start(t0 + take.start, 0, Math.min(take.buffer.duration, duration - take.start)); sources.push(source);
      }
      if (bed) {
        const source = ac.createBufferSource(), gain = ac.createGain();
        source.buffer = bed; source.loop = true; gain.gain.value = backingVolume;
        source.connect(gain).connect(limiter); source.start(t0); sources.push(source);
      }
      let last = performance.now();
      timer = setInterval(() => {
        try {
          // Background throttling or buffering would desynchronize real-time
          // audio from video. Reject such exports instead of presenting bad files.
          const now = performance.now();
          if (document.hidden || now - last > 1500 || Math.abs((ac.currentTime - t0) - video.currentTime) > 0.4)
            throw Error('Export interrupted or the tab was hidden. Keep this tab visible and retry.');
          last = now; context.drawImage(video, 0, 0);
          onProgress(video.currentTime / duration, `Rendering ${video.currentTime.toFixed(1)} / ${duration.toFixed(1)} seconds`);
        } catch (e) { fail(e); }
      }, 33);
      video.addEventListener('ended', () => { if (recorder.state === 'recording') recorder.stop(); }, {once: true});
      video.addEventListener('error', () => fail(Error('Video playback failed.')), {once: true});
      await ended; check();
      const blob = new Blob(chunks, {type: mime});
      if (!blob.size) throw Error('The encoder produced an empty video.');
      onProgress(1, 'Video ready');
      return {blob, extension: mime.includes('mp4') ? 'mp4' : 'webm', duration};
    } finally { signal?.removeEventListener('abort', abort); }
  } finally {
    clearInterval(timer); video.pause(); video.removeAttribute('src'); video.load();
    if (recorder?.state !== undefined && recorder.state !== 'inactive') recorder.stop();
    sources.forEach(s => { try { s.stop(); } catch { /* already ended */ } });
    stream?.getTracks().forEach(t => t.stop());
    if (ac && ac.state !== 'closed') await ac.close();
    if (videoURL) URL.revokeObjectURL(videoURL);
    await wakeLock?.release().catch(() => {});
  }
}
