// PWA cache + FCM background handler + notification click → open Home
// v6: network-first for app shell (js/css/html) so intimacy log + GAS fixes ship to installed PWAs
const CACHE_NAME = 'wongs-nest-v31';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './css/nest.css',
  './js/nest.js',
  './assets/nest-mark.svg',
  './js/app.js',
  './js/status.js',
  './js/session.js',
  './js/api.js',
  './js/calendar.js',
  './js/money.js',
  './js/modals.js',

  './js/notifications.js',
  './js/memories.js',
  './js/operations.js',
  './js/school.js',
  './js/habits.js',
  './js/rewards-art.js',
  './js/rewards.js',
  './manifest.json',
  './icon.png',
  './icon-192.png',
  './apple-touch-icon.png',
  './apple-touch-icon-precomposed.png',
  './favicon.png',
  './favicon.svg'
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
  const path = url.pathname || '';
  // App shell & identity assets: always try network first so deploys are not stuck on stale SW cache
  const isAppShell = event.request.mode === 'navigate'
    || (sameOrigin && (
      path.endsWith('/') ||
      path.endsWith('.html') ||
      path.endsWith('/familylog') ||
      path.endsWith('/notifications.js') || path.endsWith('/memories.js') || path.endsWith('/operations.js') || path.endsWith('/habits.js') || path.endsWith('.js') || path.endsWith('/school.js') || path.endsWith('/rewards.js') || path.endsWith('/rewards-art.js') ||
      path.endsWith('/styles.css') || path.endsWith('/nest.css') || path.endsWith('/nest.js') ||
      path.includes('manifest.json') ||
      path.endsWith('.png') || path.endsWith('.svg') ||
      path.endsWith('firebase-messaging-sw.js')
    ));

  if (isAppShell) {
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
function appDeepLink(screen) {
  const s = screen || 'home';
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
  const screen = (data && (data.screen || data.open)) || 'home';
  const scope = self.registration.scope;
  const targetUrl = (data && data.url) || appDeepLink(screen);
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
  event.waitUntil(notificationStore('get','account').then(email=>email===data.recipient?openAppFromNotification({screen:'home',url:appDeepLink('home')}):undefined));
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

function notificationStore(action,key,value){
 return new Promise((resolve,reject)=>{const open=indexedDB.open('wongs-nest-notifications',1);open.onupgradeneeded=()=>open.result.createObjectStore('meta');open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction('meta',action==='get'?'readonly':'readwrite'),store=tx.objectStore('meta');const req=action==='get'?store.get(key):store.put(value,key);tx.oncomplete=()=>{resolve(req.result);db.close();};tx.onerror=()=>{reject(tx.error);db.close();};};});
}
let notificationQueue=Promise.resolve();
function queueNotification(work){notificationQueue=notificationQueue.catch(()=>{}).then(work);return notificationQueue;}
async function deliverReminder(d){
 if(!d||!d.recipient||!/^[a-f0-9]{64}$/.test(d.reminderId||''))return;
 const email=await notificationStore('get','account');if(email!==d.recipient)return;
 const key='seen:'+d.recipient;const seen=await notificationStore('get',key)||[];if(seen.includes(d.reminderId))return;
 await self.registration.showNotification(d.title||'Wong’s Nest',{body:d.body||'',icon:self.registration.scope+'favicon.png',tag:d.reminderId,data:{recipient:d.recipient,screen:'home'}});
 await notificationStore('put',key,[...seen.slice(-13),d.reminderId]);
}
self.addEventListener('message',event=>{
 if(event.data?.type==='NOTIFICATION_ACCOUNT')event.waitUntil(queueNotification(async()=>{await notificationStore('put','account',event.data.email||null);const notifications=await self.registration.getNotifications();notifications.forEach(n=>{if(n.data?.recipient!==event.data.email)n.close();});}));
 if(event.data?.type==='REMINDER_MESSAGE')event.waitUntil(queueNotification(()=>deliverReminder(event.data.data)));
});
messaging.onBackgroundMessage(payload=>queueNotification(()=>deliverReminder(payload.data)));
