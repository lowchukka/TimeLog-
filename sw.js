const VERSION='3.0.85';
const CACHE='arbeitszeit-'+VERSION;
// One-time bridge from pre-update-button versions. Set false in subsequent releases.
const BOOTSTRAP_ACTIVATE=false;
const ASSETS=['./index.html','./app.js','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 try{
  await cache.addAll(ASSETS.map(a=>new Request(new URL(a,self.registration.scope),{cache:'reload'})));
  const app=await cache.match('./app.js'),html=await cache.match('./index.html');
  if(!app||!html||!(await app.text()).includes("const VERSION = '"+VERSION+"';")||!(await html.text()).includes('name="timelog-build" content="'+VERSION+'"'))throw new Error('Unvollständiges Deployment');
 }catch(e){await caches.delete(CACHE);throw e;}
 if(BOOTSTRAP_ACTIVATE)await self.skipWaiting();
})()));
self.addEventListener('message',event=>{
 if(event.data?.type==='TIMELOG_GET_VERSION'&&event.ports[0])event.ports[0].postMessage({type:'TIMELOG_VERSION',version:VERSION});
 if(event.data?.type==='TIMELOG_ACTIVATE_UPDATE')event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('arbeitszeit-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const u=new URL(event.request.url);if(event.request.method!=='GET'||u.origin!==self.location.origin)return;const base=new URL(self.registration.scope);const asset=ASSETS.find(a=>new URL(a,base).href===u.href);if(event.request.mode==='navigate'&&(u.pathname===base.pathname||u.pathname===new URL('./index.html',base).pathname)){event.respondWith(caches.open(CACHE).then(c=>c.match('./index.html')).then(r=>r||fetch('./index.html')));}else if(asset){event.respondWith(caches.open(CACHE).then(c=>c.match(asset)).then(r=>r||fetch(event.request)));}});
