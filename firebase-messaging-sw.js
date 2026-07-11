// PWA cache + FCM background handler + notification click → open Chat
// v4: network-first for navigations (fresh app after deploy), stronger open/focus for iOS/Android PWAs
const CACHE_NAME = 'wong-family-v5';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
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
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const sameOrigin = url.origin === self.location.origin;
  // Navigations / HTML: network-first so PWAs pick up new deploys
  const isNav = event.request.mode === 'navigate'
    || (sameOrigin && (url.pathname.endsWith('/') || url.pathname.endsWith('.html') || url.pathname.endsWith('/familylog')));

  if (isNav) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(event.request).then(c => c || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(cached => cached || fetch(event.request))
  );
});

/**
 * Build a deep-link URL. Query param survives iOS PWA quirks better than hash alone.
 */
function chatDeepLink(screen) {
  const s = screen || 'chat';
  const scope = self.registration.scope;
  try {
    const u = new URL(scope);
    u.searchParams.set('open', s);
    u.hash = s;
    return u.href;
  } catch (e) {
    return scope + '?open=' + encodeURIComponent(s) + '#' + encodeURIComponent(s);
  }
}

/**
 * Open (or focus) the app and navigate to the requested screen.
 */
function openAppFromNotification(data) {
  const screen = (data && (data.screen || data.open)) || 'chat';
  const scope = self.registration.scope;
  const targetUrl = (data && data.url) || chatDeepLink(screen);
  const msg = { type: 'NOTIFICATION_CLICK', screen: screen };

  return clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
    const ours = clientList.filter(c => c.url && c.url.indexOf(new URL(scope).origin) === 0
      && (c.url.indexOf('/familylog') !== -1 || c.url.startsWith(scope) || scope.indexOf(new URL(c.url).pathname.split('/').slice(0, 2).join('/')) !== -1));

    // Prefer clients under this SW scope
    let matched = clientList.filter(c => c.url && c.url.startsWith(scope));
    if (!matched.length) matched = ours.length ? ours : clientList;

    const posts = [];
    for (const client of matched) {
      try { client.postMessage(msg); } catch (e) { /* ignore */ }
      posts.push(client);
    }
    if (posts.length && 'focus' in posts[0]) {
      return posts[0].focus().then(c => c || posts[0]);
    }
    if (clients.openWindow) {
      return clients.openWindow(targetUrl);
    }
  });
}

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification.data || {};
  event.waitUntil(openAppFromNotification(data));
});

// Some platforms fire this when the user opens the app from a notification action
self.addEventListener('notificationclose', () => { /* no-op */ });

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
  const url = d.url || chatDeepLink(screen);

  const options = {
    body: body,
    icon: scope + 'favicon.png',
    badge: scope + 'favicon.png',
    data: Object.assign({ screen: screen, url: url, open: screen }, d),
    tag: d.tag || 'familylog-chat',
    renotify: true,
    requireInteraction: false
  };
  if (n.image || d.image) {
    options.image = n.image || d.image;
  }

  return self.registration.showNotification(title, options);
});
