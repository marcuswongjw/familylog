/* Load photo services only when a feature needs them. Auth stays in the startup shell. */
const firebaseFeatureLoads = new Map();
function loadFirebaseFeature(name) {
  if (!['firestore', 'storage'].includes(name)) return Promise.reject(new Error('Unknown photo service.'));
  if (typeof firebase[name] === 'function') return Promise.resolve();
  if (firebaseFeatureLoads.has(name)) return firebaseFeatureLoads.get(name);
  const pending = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'assets/firebase-' + name + '-compat-9.23.0.js';
    script.async = true;
    let timer;
    const finish = error => {
      clearTimeout(timer);
      script.onload = script.onerror = null;
      if (error) { script.remove(); reject(error); } else resolve();
    };
    script.onload = () => finish(typeof firebase[name] === 'function' ? null : new Error('Photo service unavailable.'));
    script.onerror = () => finish(new Error('Could not load photo service. Check your connection and retry.'));
    timer = setTimeout(() => finish(new Error('Photo service took too long to load. Please retry.')), 15000);
    document.head.append(script);
  });
  firebaseFeatureLoads.set(name, pending);
  pending.catch(() => { if (firebaseFeatureLoads.get(name) === pending) firebaseFeatureLoads.delete(name); });
  return pending;
}
let memoryDatabaseReady;
async function ensureMemoryDatabase() {
  if (db) return db;
  if (!memoryDatabaseReady) memoryDatabaseReady = (async () => {
    await loadFirebaseFeature('firestore');
    const instance = firebase.firestore();
    // Persistence must be configured before the first query. Failure still permits online use.
    await instance.enablePersistence().catch(() => {});
    db = instance;
    return instance;
  })().catch(error => { memoryDatabaseReady = null; throw error; });
  return memoryDatabaseReady;
}
async function ensurePhotoStorage() {
  if (storage) return storage;
  await loadFirebaseFeature('storage');
  if (!storage) storage = firebase.storage();
  return storage;
}
