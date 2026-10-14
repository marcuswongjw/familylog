// Parent app has its own cache and no family push/device registration.
const CACHE_NAME='parents-corner-v37';
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(['./','./index.html','./manifest.json','./css/styles.css','./css/nest.css'])).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('parents-corner-')&&k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
 if(event.request.mode!=='navigate'&&!/\.(js|css|html|svg|png|json)$/.test(url.pathname))return;
 event.respondWith(fetch(event.request).then(response=>{if(response.ok)caches.open(CACHE_NAME).then(cache=>cache.put(event.request,response.clone()));return response;}).catch(()=>caches.match(event.request).then(hit=>hit|| (event.request.mode==='navigate'?caches.match('./index.html'):Response.error()))));
});
