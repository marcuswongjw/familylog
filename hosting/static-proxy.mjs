// Serve only the reviewed static Pages build. Identity/API traffic goes directly to Firebase/GAS.
export default {
 async fetch(request,env){
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD'}});
  const url=new URL(request.url);
  if(!/^\/(?:index\.html|manifest\.json|firebase-messaging-sw\.js|parents-sw\.js|[\w-]+\.(?:png|svg)|(?:js|css|assets)\/[\w.-]+\.(?:js|css|svg|png))?$/.test(url.pathname))return new Response('Not found',{status:404});
  const upstream=new URL('https://marcuswongjw.github.io'+env.ORIGIN_PATH+(url.pathname==='/'?'index.html':url.pathname.slice(1)));
  const version=url.searchParams.get('v');
  if(/^[0-9]{1,6}$/.test(version||'') && /\.(js|css|json|png|svg)$/.test(url.pathname))upstream.searchParams.set('v',version);
  const response=await fetch(upstream,{method:request.method,redirect:'manual'});
  const headers=new Headers(response.headers);headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','strict-origin-when-cross-origin');
  if(/\.(html|js|json)$/.test(upstream.pathname))headers.set('Cache-Control','no-cache');
  if(response.status>=300&&response.status<400)return new Response('Site is updating. Please try again shortly.',{status:503});
  return new Response(response.body,{status:response.status,headers});
 }
};
