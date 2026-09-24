const CACHE='provenance-v4-1-0';
const ASSETS=['./','./index.html','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('provenance-')&&k!==CACHE).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim())
));
self.addEventListener('message',e=>{if(e.data&&e.data.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;
  const url=new URL(e.request.url);
  if(url.pathname.endsWith('/version.json')){
    e.respondWith(fetch(new Request(e.request,{cache:'no-store'})).catch(()=>new Response(JSON.stringify({version:'4.1.0'}),{headers:{'content-type':'application/json'}})));
    return;
  }
  if(e.request.mode==='navigate'){
    e.respondWith(fetch(new Request(e.request,{cache:'reload'})).then(r=>{
      if(r.ok){const copy=r.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put('./index.html',copy)))}
      return r
    }).catch(async()=>(await caches.match('./index.html'))||Response.error()));
    return;
  }
  e.respondWith(fetch(e.request).then(r=>{
    if(r.ok){const copy=r.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(e.request,copy)))}
    return r
  }).catch(async()=>(await caches.match(e.request))||Response.error()));
});