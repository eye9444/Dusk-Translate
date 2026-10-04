function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('dusk-translation-commits', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('commits', { keyPath: 'attemptId' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function transaction(mode, operation) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('commits', mode);
      const request = operation(tx.objectStore('commits'));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('Unable to persist translation usage.'));
    });
  } finally { db.close(); }
}
export const commitQueue = {
  put: record => transaction('readwrite', store => store.put(record)),
  remove: id => transaction('readwrite', store => store.delete(id)),
  list: () => transaction('readonly', store => store.getAll()),
};
