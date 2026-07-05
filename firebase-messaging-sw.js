// Caching Assets (PWA Offline Capability)
const CACHE_NAME = 'wong-family-v2';
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
  // Let the browser handle standard non-GET requests (like Firestore POST) directly
  if (event.request.method !== 'GET') return;
  
  event.respondWith(
    caches.match(event.request)
      .then(cached => cached || fetch(event.request))
  );
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
  
  const title = payload.notification.title || 'New Family Log Update';
  const options = {
    body: payload.notification.body || '',
    icon: 'favicon.png',
    image: payload.notification.image || undefined,
    data: payload.data || {}
  };
  
  self.registration.showNotification(title, options);
});
