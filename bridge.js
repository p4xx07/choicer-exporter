(() => {
  if (globalThis.__choicerBridgeV1) return;
  globalThis.__choicerBridgeV1 = true;
  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.type !== 'CHOICER_LOCAL_TAKE_V1') return;
    chrome.runtime.sendMessage({type: 'save-take', meta: event.data.meta, take: event.data.take})
      .then(r => { if (!r?.ok) throw Error(r?.error || 'Local backup failed'); })
      .catch(e => console.warn('Choicer local backup unavailable:', e.message));
  });
})();
