let pending;
function database() {
  return pending ||= new Promise((resolve, reject) => {
    const req = indexedDB.open('choicer-local-exporter', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('takes', {keyPath: 'id'}).createIndex('pack', 'pack');
      req.result.createObjectStore('packs', {keyPath: 'key'});
    };
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
  });
}
export async function saveTake(meta, take) {
  const db = await database();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(['takes', 'packs'], 'readwrite');
    tx.objectStore('packs').put(meta);
    const store = tx.objectStore('takes'), id = meta.key + ':' + take.index;
    const current = store.get(id);
    current.onsuccess = () => {
      if ((current.result?.recordedAt || 0) <= take.recordedAt) store.put({...take, id, pack: meta.key});
    };
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || Error('Backup aborted'));
  });
}
async function read(store, request) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const req = request(db.transaction(store).objectStore(store));
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
  });
}
export const listPacks = () => read('packs', s => s.getAll());
export const getTakes = key => read('takes', s => s.index('pack').getAll(key));
