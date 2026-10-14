const {test}=require('node:test'),assert=require('node:assert/strict');
test('domain hosting forwards only static files and never auth, cookies, query or writes',async()=>{
 const worker=(await import('../hosting/static-proxy.mjs')).default,original=global.fetch;let call;
 global.fetch=async(url,options)=>{call={url:String(url),options};return new Response('Static file',{headers:{'Content-Type':'text/html'}})};
 try{
  const r=await worker.fetch(new Request('https://parents.marcusw.xyz/?open=us',{headers:{Authorization:'private',Cookie:'private'}}),{ORIGIN_PATH:'/familylog/parents/'});
  assert.equal(r.status,200);assert.equal(call.url,'https://marcuswongjw.github.io/familylog/parents/index.html');assert.equal(call.options.headers,undefined);assert.equal(r.headers.get('Cache-Control'),'no-cache');
  await worker.fetch(new Request('https://family.marcusw.xyz/js/app.js?v=33&idToken=private'),{ORIGIN_PATH:'/familylog/'});assert.equal(call.url,'https://marcuswongjw.github.io/familylog/js/app.js?v=33');
  call=null;assert.equal((await worker.fetch(new Request('https://family.marcusw.xyz/api/private'),{})).status,404);assert.equal(call,null);
  assert.equal((await worker.fetch(new Request('https://parents.marcusw.xyz/',{method:'POST',body:'private'}),{})).status,405);assert.equal(call,null);
 }finally{global.fetch=original;}
});
