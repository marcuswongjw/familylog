// PWA cache + FCM background handler + notification click → open Chat
const CACHE_NAME = 'wong-family-v3';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.png',
  './favicon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // Let the browser handle non-GET (Firestore, etc.)
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request)
      .then(cached => cached || fetch(event.request))
  );
});

/**
 * Open (or focus) the app and navigate to the requested screen.
 * Used when the user taps a push notification.
 */
function openAppFromNotification(data) {
  const screen = (data && data.screen) || 'chat';
  const scope = self.registration.scope; // e.g. https://user.github.io/familylog/
  const targetUrl = scope + (screen === 'chat' ? '#chat' : '#' + encodeURIComponent(screen));

  return clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
    for (const client of clientList) {
      // Focus an existing tab/window of this app
      if (client.url.startsWith(scope) && 'focus' in client) {
        client.postMessage({ type: 'NOTIFICATION_CLICK', screen: screen });
        return client.focus();
      }
    }
    // No open client — open a new window to the app (hash routes to chat)
    if (clients.openWindow) {
      return clients.openWindow(targetUrl);
    }
  });
}

// Tap / click on a shown notification
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification.data || {};
  event.waitUntil(openAppFromNotification(data));
});

// Firebase Cloud Messaging Background Listener
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAapGliVr1bcKa5ESvIPpT1VvPIHb0uwD0",
  authDomain: "familylog-86db6.firebaseapp.com",
  projectId: "familylog-86db6",
  storageBucket: "familylog-86db6.firebasestorage.app",
  messagingSenderId: "171956350431",
  appId: "1:171956350431:web:6094e6bafb0bb849ed286a",
  measurementId: "G-HCHV787ZPJ"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Background message payload:', payload);

  const n = payload.notification || {};
  const d = payload.data || {};
  const title = n.title || d.title || 'New Family Log Update';
  const body = n.body || d.body || '';
  const screen = d.screen || 'chat';
  const scope = self.registration.scope;

  const options = {
    body: body,
    icon: scope + 'favicon.png',
    badge: scope + 'favicon.png',
    // Ensure click has a target even if FCM data is thin
    data: Object.assign({ screen: screen, url: scope + '#chat' }, d),
    tag: d.tag || 'familylog-chat',
    renotify: true
  };
  if (n.image || d.image) {
    options.image = n.image || d.image;
  }

  // Always show via SW so notificationclick (above) owns the click path
  return self.registration.showNotification(title, options);
});
