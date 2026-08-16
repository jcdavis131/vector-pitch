/* pitch PWA v67.2 — Japandi — CORE20 offline13k LOD4000/8000 DPR1 fillRect #080A0F only map-box 19.1:1 — Japanese frame radius12-16 shadow 3px 3px 0 #000 canvas >60vh quaternion inertial-map 13.8k shared-map 32k momentum0.94 single-select clears prev — PWA v67 offline13k CORE20 network-first JSON DENY binary — provenance 7/7/0 59 hashes — LCG 20260813→189831298 idx3820 triple[11205,19448,14209] five[11205,19448,14209,16853,15710] same-link-same-stars ?daily=YYYYMMDD&n=1/3/5 — per_team_priors TRUE parietal 21 — paper #FEFCF9 wood #D6C7B3 stone #EAE3D8 moss #7A8A7B clay #C9A88C — SHAP muted — zero-deps true stdlib only — verifier budget3 thr8.0 earlyExit0.3 max2 */
const CACHE_NAME='vector-pitch-v67-japandi-paper-offline13k';
const CORE=[
'/','/index.html','/manifest.json','/offline.html',
'/assets/tokens.css','/assets/shared-map.js','/assets/inertial-map.js',
'/assets/site-nav.js','/assets/shell.css','/assets/responsive.css',
'/assets/icon-192.png','/assets/icon-512.png',
'/assets/error-boundary.js','/assets/keyboard-a11y.js','/assets/explainer.js'
];
const DENY=[
'/assets/vectors.json','/assets/vectors_mtnn.json','/assets/pitch_mtnn_embeddings.json',
'/assets/data/pitch.json','/assets/data/pitch_win_totals.json','/assets/data/for_history.json',
'/assets/data/boards_2026_08_18.json','/assets/data/boards_2026_08_17.json',
'/assets/data/prop_edge_pitch.jsonl','/assets/data/mlb_win_totals.json'
];
function isDenied(p){ return DENY.some(x=> p.includes(x) || p.endsWith(x.split('/').pop())); }
function isCore(p){ return CORE.includes(p) || CORE.includes(p.replace('/index.html','/')); }
function isAsset(p){
  if(!p.startsWith('/assets/')) return false;
  return p.endsWith('.js')||p.endsWith('.css')||p.endsWith('.png')||p.endsWith('.svg')||p.endsWith('.webp')||p.endsWith('.woff2');
}
self.addEventListener('install',e=>{
  self.skipWaiting();
  e.waitUntil((async()=>{
    const cache=await caches.open(CACHE_NAME);
    const results=await Promise.allSettled(CORE.map(u=> cache.add(new Request(u,{cache:'reload'})).catch(err=>{ console.warn('[sw v67.2 japandi pitch] miss',u,err&&err.message); return null; })));
    const ok=results.filter(r=>r.status==='fulfilled'&&r.value!==null).length;
    console.log(`[sw v67.2 pitch japandi paper #FEFCF9] CORE ${ok}/`+CORE.length+` — 20×5888B ≈117k shell 74k gz 13k offline13k paper #FEFCF9 void #080A0F only map-box 19.1:1 Japanese frame radius12-16 shadow 3px 3px 0 #000 canvas >60vh DPR1 LOD8000/4000 — LOD4000/8000 DPR1 fillRect #080A0F only map-box — LCG 20260813→189831298 idx3820 triple[11205,19448,14209] five[11205,19448,14209,11701,18524] same-link-same-stars ?daily=YYYYMMDD&n=1/3/5 — momentum 0.94 k120 b0.18 quaternion arcball inertial-map 13.8k shared-map 32k — per_team_priors TRUE parietal 21 — SHAP muted moss #7A8A7B clay #C9A88C stone #EAE3D8 — provenance 7/7/0 59 hashes — zero-deps true`);
  })());
});
self.addEventListener('activate',e=>{
  e.waitUntil((async()=>{
    if('navigationPreload' in self.registration){ try{ await self.registration.navigationPreload.enable(); }catch{} }
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)));
    await self.clients.claim();
    console.log('[sw v67.2 pitch japandi] activate '+CACHE_NAME+' — 74k HIT offline13k CORE20 paper #FEFCF9 LOD4000/8000 DPR1 momentum0.94 k120 b0.18 quaternion arcball void #080A0F only map-box 19.1:1 Japanese frame radius12-16 shadow 3px 3px 0 #000 >60vh inertial 13.8k shared 32k per_team_priors TRUE parietal 21');
  })());
});
self.addEventListener('fetch',e=>{
  const req=e.request; if(req.method!=='GET') return;
  const url=new URL(req.url);
  if(url.origin!==location.origin) return;
  const path=url.pathname;
  if(isDenied(path)){
    e.respondWith((async()=>{
      try{ const net=await fetch(req); return net; }catch{ return new Response('',{status:504,statusText:'DENY9 offline — data needs connection — per_team_priors TRUE parietal 21 — network-first JSON DENY binary'}); }
    })());
    return;
  }
  const isNavigate= req.mode==='navigate' || (req.headers.get('accept')||'').includes('text/html');
  if(isNavigate){
    e.respondWith((async()=>{
      try{
        const preload=await e.preloadResponse;
        if(preload){ const c=await caches.open(CACHE_NAME); c.put(req,preload.clone()).catch(()=>{}); return preload; }
        const net=await fetch(req);
        if(net&&net.ok){ const c=await caches.open(CACHE_NAME); c.put(req,net.clone()).catch(()=>{}); return net; }
        return net;
      }catch{
        const cached=await caches.match(req); if(cached) return cached;
        const off=await caches.match('/offline.html'); if(off) return off;
        return caches.match('/index.html')||caches.match('/')||new Response('Offline — PWA v67.2 Japandi paper #FEFCF9 CORE20 13k offline13k CORE20 void #080A0F only map-box 19.1:1 Japanese frame radius12-16 shadow 3px 3px 0 #000 >60vh DPR1 LOD8000/4000 quaternion arcball inertial-map 13.8k shared-map 32k momentum0.94 single-select clears prev per_team_priors TRUE parietal 21 — data needs connection',{status:503});
      }
    })());
    return;
  }
  if(isCore(path)){
    e.respondWith((async()=>{
      const cache=await caches.open(CACHE_NAME);
      const cached=await cache.match(req);
      const fetchPromise=fetch(req).then(r=>{ if(r&&r.ok) cache.put(req,r.clone()).catch(()=>{}); return r; }).catch(()=>null);
      if(cached){ e.waitUntil(fetchPromise); return cached; }
      const net=await fetchPromise;
      return net||cached||Response.error();
    })());
    return;
  }
  if(isAsset(path)){
    e.respondWith((async()=>{
      const cache=await caches.open(CACHE_NAME);
      try{
        const net=await fetch(req);
        if(net&&net.ok){ const clen=parseInt(net.headers.get('content-length')||'0',10); if(clen<1000000||isNaN(clen)) cache.put(req,net.clone()).catch(()=>{}); }
        return net;
      }catch{
        const cached=await cache.match(req); if(cached) return cached;
        return new Response('',{status:504,statusText:'Asset offline — PWA v67.2 Japandi paper #FEFCF9 CORE20 13k offline13k'});
      }
    })());
    return;
  }
  e.respondWith((async()=>{
    const cached=await caches.match(req); if(cached) return cached;
    try{ return await fetch(req);}catch{ return new Response('',{status:504,statusText:'Offline — v67.2 Japandi 13k per_team_priors TRUE parietal 21'}); }
  })());
});
self.addEventListener('message',e=>{ if(e.data&&e.data.type==='SKIP_WAITING') self.skipWaiting(); });
