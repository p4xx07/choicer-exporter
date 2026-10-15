# Choicer Voicer Local Exporter

A Chrome Manifest V3 extension for **https://thechoicervoicergames.com/**. No build step, dependencies, account, analytics, external server, FFmpeg installation, or microphone permission is needed.

## Where it works

Use this extension in **desktop Google Chrome** on [thechoicervoicergames.com](https://thechoicervoicergames.com/).

- Browse the [Voice Packs catalogue](https://thechoicervoicergames.com/voice-packs-online/), choose a pack and record your lines.
- Supported pages use the site's `.dubpack-player` with a JSON manifest. The [Hiding from Randall Monsters Inc pack](https://thechoicervoicergames.com/hiding-from-randall-monsters-inc-pack/) is the reference example used during development.
- This is **not** an extension for the standalone/downloadable Choicer Voicer game, GameBanana itself, `choicervoicer.net`, or arbitrary video websites. It only has access to `https://thechoicervoicergames.com/*`.
- Desktop Chrome is the target. Other Chromium browsers have not been verified; mobile browsers are not supported by this package.
- Internet access is needed to fetch the pack's source video and backing track. Voice processing, backups and encoding happen locally.

## Install once

1. On this GitHub repository, click **Code → Download ZIP**, then unzip it somewhere permanent. Alternatively, clone the repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** at the top right.
4. Click **Load unpacked** and select the extracted repository folder (usually `choicer-exporter-main`) containing `manifest.json`.
5. Pin **Choicer Voicer Local Exporter** from Chrome's Extensions menu.

Chrome will ask for access to this specific website. The extension does not request access to other websites, browsing history, your microphone, or Chrome's debugger.

**Do not refresh a game that contains unsaved takes.** Installation does not refresh it. Newly opened pack pages are observed automatically. For an already-open page, click the extension icon once to attach the observer without refreshing; subsequent recordings will be backed up. Earlier takes normally cannot be recovered retroactively. Advanced recovery: if a compatible player instance was already exposed as `window.__dp` through DevTools, the extension can collect its takes without further console work. Normal installation does not expose private player state.

## Silent scene playback while recording

Version 1.1 adds a **Play scene silently while recording** checkbox below the pack player, enabled by default.

- When you press **Record** (or the site's microphone button), the extension seeks to that line's timestamp and plays its scene with no original dialogue or backing audio.
- Use the site's Record button again to stop your take. The preview pauses and audio mute settings are restored. The site's normal segment boundary may pause the video earlier; it does not automatically stop your microphone recording.
- The extension does not start a recording on its own. Chrome's normal microphone prompt still belongs to the website.
- Disable the checkbox to keep the site's original behavior. The preference is remembered for this website.
- Timing is limited by the browser's media seeking and playback startup. This visual aid does not provide sample-accurate microphone/video synchronization or automatically trim leading silence.
- If pack timing has not loaded or Chrome blocks playback, the checkbox status explains that; your normal recording continues.

## Normal use

1. Record your lines on the website as usual. Each stopped take is copied automatically into local extension storage. Retakes replace that line's backup. The extension never clicks Record or starts a microphone.
2. Click the extension icon to open Export Studio. Your saved packs appear in its list.
3. Choose a pack, set backing-track volume, and click **Export dubbed video**.
4. Keep the Export Studio tab visible and the computer awake. Export runs in real time (a 96-second scene takes about 96 seconds, plus media preparation).
5. The finished video downloads and can be played inside Export Studio. A download link remains available if Chrome blocks the automatic download.

The original scene is used as visual footage. Your takes are mixed at the pack's exact `timestamp` positions, with an optional backing track at 25% by default. Missing lines are silent. Intentional overlaps remain overlaps; long takes are cut at the scene's end. The original spoken dialogue is not included. This does not fix recording mistakes or restore overwritten takes.

## Import an existing backup

Click **Import recording backup** and choose a compatible JSON file. Expected structure:

```json
{
  "manifest": {
    "title": "Voice pack title",
    "video": "https://thechoicervoicergames.com/path/to/video.mp4",
    "backingTrack": "https://thechoicervoicergames.com/path/to/backing.mp3",
    "lines": [{ "timestamp": 1.25 }]
  },
  "takes": [{ "index": 0, "data": "data:audio/webm;base64,..." }]
}
```

Take indices are zero-based. The backing track is optional. Existing backups generated by this exporter are supported. Importing a backup does not restore a previously overwritten take unless that older take is in the backup.

You can download a new JSON backup from Export Studio at any time. Backups include the recorded audio and pack metadata, but the site's source video and backing track are fetched when exporting, so those assets must remain available online. Local extension backups survive a game-page refresh and a browser restart, but are lost if you remove the extension, clear its data, or lose that Chrome profile. Download JSON backups for independent safekeeping.

## Output and limits

- MP4 (H.264/AAC) when Chrome supports recording it; otherwise WebM (VP9/Opus). The selected container is reflected in the filename. Use a recent Chrome version.
- Works with the site's manifest-based `.dubpack-player` packs, including **Hiding from Randall Monsters Inc**. Folder-only packs without a manifest need an imported compatible JSON backup.
- No co-op merging across different devices, no automatic alignment correction, no native FFmpeg process. A regular extension cannot launch a local FFmpeg executable without an additional native helper; this extension uses Chrome's media encoder to keep installation simple.
- An interrupted, hidden-tab, stalled or desynchronized render is rejected; keep Export Studio visible and retry. Cancel preserves all saved takes.
- Media is only fetched from this website. A backup that points to another host is rejected.
- If the website changes its player DOM or recording implementation, the capture or silent-preview adapter may need updating. The observed player version was `dubpack-player.js?ver=1.5.15`.
- Multiple packs on one page are associated with the player most recently interacted with; a normal single-pack page is the supported primary workflow.

## Privacy / permissions

`scripting` injects the recording observer into an already-open pack without reloading it. Host access is limited to `https://thechoicervoicergames.com/*`, for capture and downloading the source media. Audio is stored in IndexedDB under the extension's origin. Nothing is sent to an upload endpoint. The observer runs in the page's MAIN world because MediaRecorder belongs to the page; like any MAIN-world script, the host page can interfere with it. The site already has its own recordings; the extension adds no microphone access.

## Source and validation

All source is included. `preview.js` adds optional silent recording playback; `capture.js` observes MediaRecorder output; `bridge.js` forwards it to extension storage; `background.js` manages the saved takes; `render.js` renders a separate video without mutating the game's state. There is no remotely loaded JavaScript. The preview preference is stored in localStorage on the website; audio backups are stored under the extension origin.

Run `npm test` (or `node --test tests/*.test.js`) to check capture, retakes, native recording errors, URL restrictions, data validation, and timing and silent recording preview. No install step is needed for tests. The Chrome unpacked-extension installation and its permission prompt must be completed by you. These automated tests do not substitute for a full installed-extension smoke test.

Manual smoke test after installation: record two lines, close/reopen Export Studio and verify both persist, download a backup, export with the studio visible, play the result, cancel a second render and verify the takes remain, and import the downloaded backup. Check the recording indicator goes off after each normal site recording.
