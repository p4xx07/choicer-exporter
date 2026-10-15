export const ORIGIN = 'https://thechoicervoicergames.com';
export function mediaURL(value, base = ORIGIN) {
  const u = new URL(value, base);
  if (u.origin !== ORIGIN || u.username || u.password) throw Error('Media must come from the Choicer Voicer website.');
  return u.href;
}
export function validateTake(meta, take) {
  if (!meta || typeof meta.key !== 'string' || meta.key.length > 3000 || !meta.key.startsWith(ORIGIN + '/')) throw Error('Invalid pack.');
  mediaURL(meta.pageUrl);
  if (meta.manifestUrl) mediaURL(meta.manifestUrl);
  if (meta.packUrl) mediaURL(meta.packUrl);
  if (!Number.isInteger(take?.index) || take.index < 0 || take.index > 9999 ||
      typeof take.data !== 'string' || take.data.length > 35_000_000 ||
      !/^data:(audio|video)\/[\w.+-]+(?:;[^,]*)?;base64,[A-Za-z0-9+/=]+$/.test(take.data)) throw Error('Invalid recorded audio.');
  return {meta: {key: meta.key, pageUrl: meta.pageUrl, manifestUrl: meta.manifestUrl || null,
    packUrl: meta.packUrl || null, title: String(meta.title || 'Voice pack').slice(0, 300),
    ...(meta.manifest ? {manifest: normalizeManifest(meta.manifest, meta.manifestUrl || ORIGIN)} : {})},
    take: {index: take.index, data: take.data, recordedAt: Number(take.recordedAt) || Date.now()}};
}
export function normalizeManifest(input, base) {
  if (!input || !Array.isArray(input.lines) || !input.lines.length || input.lines.length > 10000) throw Error('The pack has no valid lines.');
  const lines = input.lines.map((line, index) => {
    const timestamp = Number(line.timestamp);
    if (!Number.isFinite(timestamp) || timestamp < 0) throw Error('Invalid line timestamp.');
    return { ...line, index, timestamp };
  });
  return {title: String(input.title || 'Voice pack'), video: mediaURL(input.video, base),
    backingTrack: input.backingTrack ? mediaURL(input.backingTrack, base) : null, lines};
}
export function scheduleTakes(lines, takes, duration) {
  return takes.map(t => {
    if (!lines[t.index]) throw Error('A recording has no matching pack line.');
    return {...t, start: Number(lines[t.index].timestamp)};
  }).filter(t => t.start < duration);
}
export function safeFilename(title) {
  return title.replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 100) || 'Choicer-Voicer';
}
