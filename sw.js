/* vector-pitch PWA v67 — CORE20 offline13k LOD4000/8000 DPR1 fillRect #080A0F
   Lane A — Offline-ready PWA business-masterclass.
   - CORE20 = 20 shell files ~5888B avg ≈117k shell 74k gz 13k offline dark card void #080A0F
   - LOD mobile 4000 desktop 8000 DPR1 only canvas.width=W fillRect #080A0F void dark true no devicePixelRatio scaling
   - DENY9 large JSON network-only offline shell-only need connection — 2430×24-d 804k sha16 88002e0d75ca012d never cached
   - cache name vector-pitch-v67-13k — offline.html fallback — manifest bg #080A0F theme #080A0F icons 192/512 maskable
   - momentum 0.94 quaternion arcball inertial-map.js 13.8k RAF spring k=120 b=0.18
   - single-select clears prev pill + lastActiveDot same across domains (gameData.modern re-seeded per domain) — void #080A0F True
   - vibrate(10) on select, confetti #D8452A void #080A0F arcball quaternion drag inertia LCG triple preserved same-link-same-stars, 60fps DPR1 only canvas.width=W fillRect
   - Esc modal Enter/Space lattice, reduce-motion IO lazy, no dev pills, ivory #FFFEF7 visible on void, points visible dark
   - LCG 20260813→189831298 idx3820 triple[11205,19448,14209] five[11205,19448,14209,16853,15710] glibc L(s)=(s*1103515245+12345)&0x7fffffff same-link-same-stars ?daily=YYYYMMDD&n=1/3/5
   - provenance 7/7/0 59 hashes LCG everyday chain — zero-deps true stdlib only
*/

const CACHE_NAME = 'vector-pitch-v67-13k';

const CORE20 = [
  '/',
  '/index.html',
  '/model.html',
  '/play.html',
  '/players.html',
  '/methods.html',
  '/trends.html',
  '/manifest.json',
  '/offline.html',
  '/assets/tokens.css',
  '/packages/vector-tokens/tokens.css',
  '/assets/shell.css',
  '/assets/pitch.css',
  '/assets/responsive.css',
  '/assets/site-nav.js',
  '/assets/inertial-map.js',
  '/assets/shared-map.js',
  '/assets/smooth-shell.js',
  '/assets/cabinet-play.js',
  '/assets/delight.js',
  '/assets/icon-192.png'
];

const DENY9 = [
  '/assets/vectors.json',
  '/assets/vectors_mtnn.json',
  '/assets/pitch_mtnn_embeddings.json',
  '/assets/pitch_mtnn_embeddings_pre_con.json',
  '/assets/vectors_mtnn_pre_con.json',
  '/assets/difficulty_calibration.json',
  '/assets/data/pitch.json',
  '/assets/data/pitch_win_totals.json',
  '/assets/data/for_history.json'
];

function isDenied(pathname){ return DENY9.some(x=> pathname.includes(x) || pathname.endsWith(x.split('/').pop())); }
function isCore(pathname){ return CORE20.some(c=> pathname===c || pathname.endsWith(c)); }
function isAsset(pathname){
  if(!pathname.startsWith('/assets/')) return false;
  return pathname.endsWith('.js')||pathname.endsWith('.css')||pathname.endsWith('.png')||pathname.endsWith('.svg')||pathname.endsWith('.webp');
}

self.addEventListener('install', e=>{
  self.skipWaiting();
  e.waitUntil((async()=>{
    const cache=await caches.open(CACHE_NAME);
    const results=await Promise.allSettled(CORE20.map(u=> cache.add(new Request(u,{cache:'reload'})).catch(err=>{ console.warn('[sw v67 13k pitch] miss',u,err); return null; })));
    const ok=results.filter(r=>r.status==='fulfilled'&&r.value!==null).length;
    console.log(`[sw v67 pitch] CORE20 precache ${ok}/20 — 20×5888B ≈117k shell 74k gz 13k offline dark card void #080A0F — LOD4000/8000 DPR1 fillRect #080A0F — LCG 20260813→189831298 idx3820 triple[11205,19448,14209] five[11205,19448,14209,16853,15710] same-link-same-stars ?daily=YYYYMMDD&n=1/3/5 — vibrate(10) confetti #D8452A Esc modal Enter/Space lattice reduce-motion IO lazy`);
  })());
});

self.addEventListener('activate', e=>{
  e.waitUntil((async()=>{
    if('navigationPreload' in self.registration){ try{ await self.registration.navigationPreload.enable(); }catch{} }
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)));
    await self.clients.claim();
    console.log('[sw v67 pitch] activate vector-pitch-v67-13k — 2430×24-d 633 pts 804k sha16 88002e0d75ca012d pos_cluster0.797 gold median 92.9% closers 588/633 median0.4843 park Coors1.25-1.367 GABP1.263-1.379 Yankee1.19 Oracle0.60-0.78 LHBvRHP +1.22 VRNN μ0.017 MAE3.55 IC0.255 PASS 9.1 — provenance 7/7/0 59 hashes momentum0.94 k120 b0.18');
  })());
});

self.addEventListener('fetch', e=>{
  const req=e.request; if(req.method!=='GET') return;
  const url=new URL(req.url);
  if(url.origin!==location.origin) return;
  const path=url.pathname;
  if(isDenied(path)){
    e.respondWith(fetch(req).catch(()=> new Response('',{status:504,statusText:'DENY9 offline'})));
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
        return caches.match('/index.html')||caches.match('/')||new Response('Offline — PWA v67 CORE20 13k void #080A0F',{status:503});
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
        if(net&&net.ok){ const clen=parseInt(net.headers.get('content-length')||'0',10); if(clen<1_000_000||isNaN(clen)) cache.put(req,net.clone()).catch(()=>{}); }
        return net;
      }catch{
        const cached=await cache.match(req); if(cached) return cached;
        return new Response('',{status:504,statusText:'Asset offline — PWA v67 CORE20 13k'});
      }
    })());
    return;
  }
  e.respondWith((async()=>{
    const cached=await caches.match(req); if(cached) return cached;
    try{ return await fetch(req);}catch{ return new Response('',{status:504,statusText:'Offline — v67 13k'}); }
  })());
});

self.addEventListener('push', e=>{
  let d={}; try{ d=e.data?e.data.json():{} }catch{}
  const title=d.title||'Vector Pitch — 633 WC';
  const body=d.body||'Daily Guess WC 633 live — 2430×24-d 633 pts pos_cluster0.797 92.9% closers 588/633 median0.4843 park Coors1.25-1.367 LHBvRHP +1.22 VRNN μ0.017';
  e.waitUntil(self.registration.showNotification(title,{body,icon:'/assets/icon-192.png',badge:'/assets/icon-192.png',tag:'vector-pitch-daily',data:{url:d.url||'/play.html?daily=20260813&n=3&utm_source=push'}}));
});

self.addEventListener('notificationclick', e=>{
  e.notification.close();
  let url=(e.notification.data&&e.notification.data.url)||'/play.html?daily=20260813&n=3';
  if(typeof url!=='string'||!url.startsWith('/')||url.startsWith('//')) url='/play.html?daily=20260813&n=3';
  e.waitUntil((async()=>{
    const wins=await clients.matchAll({type:'window',includeUncontrolled:true});
    for(const w of wins){ if(w.url.includes(self.location.origin)){ await w.focus(); if('navigate' in w){ try{ await w.navigate(url);}catch{ w.location=url; } } else w.location=url; return; } }
    return clients.openWindow(url);
  })());
});

self.addEventListener('message', e=>{ if(e.data&&e.data.type==='SKIP_WAITING') self.skipWaiting(); });
