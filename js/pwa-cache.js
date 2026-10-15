/* One app-shell policy: only navigations may fall back to HTML. */
function installAppCache(name, assets) {
  const revision=name.match(/-v(\d+)$/)?.[1],scope=new URL(self.registration.scope);
  const shell=new URL('index.html',scope).href;
  function key(request) {
    if(request.mode==='navigate')return shell;
    const url=new URL(request.url||request,scope);
    if(url.searchParams.get('v')===revision&&[...url.searchParams.keys()].every(k=>k==='v'))url.search='';
    return url.href;
  }
  function usable(response,url,navigation=false) {
    if(!response?.ok)return false;
    const type=response.headers.get('content-type')||'';
    if(navigation||/\.html$/.test(url.pathname)||url.pathname.endsWith('/'))return /text\/html/i.test(type);
    if(/\.js$/.test(url.pathname))return /(?:java|ecma)script/i.test(type);
    if(/\.css$/.test(url.pathname))return /text\/css/i.test(type);
    return !/text\/html/i.test(type);
  }
  self.addEventListener('install',event=>event.waitUntil((async()=>{
    const cache=await caches.open(name);
    await Promise.all(assets.map(async path=>{
      const url=new URL(path,scope),response=await fetch(url.href,{cache:'reload'});
      if(!usable(response,url))throw Error('App shell asset unavailable: '+url.pathname);
      await cache.put(url.href,response);
    }));await self.skipWaiting();
  })()));
  self.addEventListener('activate',event=>event.waitUntil((async()=>{
    const prefix=name.replace(/v\d+$/,'v');
    await Promise.all((await caches.keys()).filter(k=>k.startsWith(prefix)&&k!==name).map(k=>caches.delete(k)));
    await self.clients.claim();
  })()));
  self.addEventListener('fetch',event=>{
    const request=event.request,url=new URL(request.url);
    if(request.method!=='GET'||url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return;
    if(request.mode!=='navigate'&&!/\.(js|css|html|svg|png|json)$/.test(url.pathname))return;
    event.respondWith((async()=>{
      const cache=await caches.open(name),cacheKey=key(request);
      try {
        const response=await fetch(request);
        if(!usable(response,url,request.mode==='navigate'))throw Error('Invalid app shell response');
        try { await cache.put(cacheKey,response.clone()); } catch (_) {}
        return response;
      }catch(_){const cached=await cache.match(cacheKey);return usable(cached,url,request.mode==='navigate')?cached:Response.error();}
    })());
  });
}
