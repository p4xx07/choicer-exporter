import {validateTake, ORIGIN} from './model.js';
import {saveTake, listPacks, getTakes} from './db.js';
chrome.action.onClicked.addListener(async tab => {
  let issue = '';
  if (tab.url?.startsWith(ORIGIN + '/')) {
    try {
      await chrome.scripting.executeScript({target: {tabId: tab.id}, files: ['bridge.js']});
      await chrome.scripting.executeScript({target: {tabId: tab.id}, files: ['preview.js', 'capture.js'], world: 'MAIN'});
      const [{result}] = await chrome.scripting.executeScript({target: {tabId: tab.id}, world: 'MAIN',
        func: async () => await window.__choicerLocalExporterV1?.snapshot() || []});
      for (const item of result || []) { const clean = validateTake(item, item.take); await saveTake(clean.meta, clean.take); }
    } catch (e) { issue = e.message; }
  }
  await chrome.tabs.create({url: chrome.runtime.getURL('export.html') + (issue ? '?issue=' + encodeURIComponent(issue) : '')});
});
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  const extensionPage = sender.url?.startsWith(chrome.runtime.getURL(''));
  (async () => {
    if (message?.type === 'save-take' && (extensionPage || sender.url?.startsWith(ORIGIN + '/'))) {
      const clean = validateTake(message.meta, message.take); await saveTake(clean.meta, clean.take); return {ok: true};
    }
    if (!extensionPage) throw Error('Unknown sender.');
    if (message?.type === 'list') return {ok: true, packs: await listPacks()};
    if (message?.type === 'takes') return {ok: true, takes: await getTakes(message.key)};
    throw Error('Unknown command.');
  })().then(reply, e => reply({ok: false, error: e.message}));
  return true;
});
