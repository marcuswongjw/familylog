// Parent app has its own offline shell and no push/device registration.
const CACHE_NAME='parents-corner-v50';
importScripts('./js/pwa-cache.js');
installAppCache(CACHE_NAME,['./', './index.html', './manifest.json', './css/styles.css', './css/nest.css', './js/app.js', './js/parents.js', './js/nest.js', './js/status.js', './js/session.js', './js/api.js', './js/calendar.js', './js/money.js', './js/modals.js', './js/notifications.js', './js/memories.js', './js/operations.js', './js/school.js', './js/habits.js', './js/rewards.js', './js/rewards-art.js', './js/pwa-cache.js', './js/performance.js', './js/archives.js', './js/firebase-features.js', './assets/nest-mark.svg', './assets/firebase-app-compat-9.23.0.js', './assets/firebase-auth-compat-9.23.0.js']);
