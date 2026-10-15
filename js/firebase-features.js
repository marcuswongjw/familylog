/* Load feature services on demand. App/Auth stay in the startup shell. */
const firebaseFeatureLoads = new Map();
function loadFirebaseFeature(name) {
  if (!['firestore', 'storage', 'functions', 'messaging'].includes(name)) return Promise.reject(new Error('Unknown app service.'));
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
    script.onload = () => finish(typeof firebase[name] === 'function' ? null : new Error('App service unavailable.'));
    script.onerror = () => finish(new Error('Could not load app service. Check your connection and retry.'));
    timer = setTimeout(() => finish(new Error('App service took too long to load. Please retry.')), 15000);
    document.head.append(script);
  });
  firebaseFeatureLoads.set(name, pending);
  pending.catch(() => { if (firebaseFeatureLoads.get(name) === pending) firebaseFeatureLoads.delete(name); });
  return pending;
}
let memoryDatabaseReady, memoryDatabaseEpoch = 0;
let memoryDatabaseCleanup = Promise.resolve();
async function ensureMemoryDatabase() {
  if (!familyAccount(currentUserEmail)) throw new Error('Please sign in with one of the family accounts.');
  const epoch = memoryDatabaseEpoch;
  if (db) return db;
  if (!memoryDatabaseReady) {
    const cleanup = memoryDatabaseCleanup;
    const pending = (async () => {
      await loadFirebaseFeature('firestore');
      await cleanup;
      const instance = firebase.firestore();
      // Memory-only cache. Remove the legacy disk cache before making any query.
      try { await instance.clearPersistence(); }
      catch (_) { throw new Error('Could not clear the old Memories cache. Close other app tabs, then open Memories again.'); }
      if (epoch === memoryDatabaseEpoch) db = instance;
      return instance;
    })();
    memoryDatabaseReady = pending;
    pending.catch(() => { if (memoryDatabaseReady === pending) memoryDatabaseReady = null; });
  }
  const instance = await memoryDatabaseReady;
  if (epoch !== memoryDatabaseEpoch || !familyAccount(currentUserEmail)) throw new Error('Your account changed. Please open Memories again.');
  return instance;
}
function resetMemoryDatabase() {
  memoryDatabaseEpoch++;
  const pending = memoryDatabaseReady || (db ? Promise.resolve(db) : null);
  db = null;
  memoryDatabaseReady = null;
  if (pending) {
    // Compat terminate removes its service registration; the next session gets a fresh instance.
    // A failed initialization has not started queries and can retry its disk cleanup next time.
    memoryDatabaseCleanup = pending.then(instance => instance.terminate(), () => {});
    memoryDatabaseCleanup.catch(() => {});
  }
}
async function ensurePhotoStorage() {
  if (storage) return storage;
  await loadFirebaseFeature('storage');
  if (!storage) storage = firebase.storage();
  return storage;
}

async function ensureFunctionServices() {
  await loadFirebaseFeature('functions');
  return firebase.functions();
}
async function ensurePushMessaging() {
  if (messaging) return messaging;
  await loadFirebaseFeature('messaging');
  if (!messaging) {
    try { messaging = firebase.messaging(); }
    catch (_) { throw new Error('This browser does not support push reminders.'); }
  }
  return messaging;
}
