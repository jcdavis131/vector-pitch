/* shared-map.js pitch v2-light filtered — hoops v4-filtered parity for pitch
   - 2 tournaments OR recent (2022) keeps rookie filter
   - DPR=1 LOD mobile 4000 desktop 8000 throttle 30fps idle pause color-batched fillRect
   - Exports mountSharedMap(canvas, {highlightId, guessIds, dark})
   - Cache API + session reuse pending focus queue injection always works even filtered
*/
export async function mountSharedMap(canvas, opts={}){
  if(!canvas) return null;
  const POS_COLOR={DEF:'#0072B2',MID:'#009E73',FWD:'#D55E00'};
  const POS=['DEF','MID','FWD'];
  const OKABE=['#0072B2','#D55E00','#009E73','#F0E442','#56B4E9','#CC79A7','#E69F00','#FFFEF7'];
  const highlightInit = opts.highlightId ?? null;
  const dark = !!opts.dark;
  const isMobile = (typeof window!=='undefined') && (window.innerWidth<700 || /Android|iPhone|iPad/i.test(navigator.userAgent||''));
  const maxRender = isMobile ? 4000 : 8000;
  const frameBudget = isMobile ? 42 : 33;
  const reduceMotion = (typeof window!=='undefined') && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let N=0, baseOx=null, baseOy=null, baseOz=null, baseC=null, baseI=null, baseN=[], baseS=[], baseP=[], baseT=[];
  let projected=[], projById=null, maxId=0;
  let W=0,H=0, rotY=Math.PI*0.18, rotX=0.22, auto=!reduceMotion, lastT=0, isDragging=false, lastX=0,lastY=0;
  let embedPaused=false;
  let fullLoaded=false, fullLoading=false, pendingFocus=null;
  let totalRaw=633, filteredCount=0;

  function tournYear(s){
    if(!s) return null;
    const str=String(s);
    const m=str.match(/(19|20)\d{2}/);
    if(m) return parseInt(m[0],10);
    if(str.includes('2018')) return 2018;
    if(str.includes('2022')) return 2022;
    return null;
  }

  function buildTourneyFilter(arr){
    let maxYear=0;
    for(const p of arr){ const y=tournYear(p.s||p.season||p.tourney); if(y&&y>maxYear) maxYear=y; }
    if(!maxYear) maxYear=2022;
    const recentMin = maxYear;
    const byPerson=new Map();
    for(const p of arr){
      const pid = p.pid!=null ? String(p.pid) : (p.player_id!=null ? String(p.player_id) : '');
      const rawName=(p.n||p.name||'').trim();
      if(!rawName && !pid) continue;
      const key = pid ? ('pid:'+pid) : ('name:'+rawName.toLowerCase());
      let rec=byPerson.get(key);
      if(!rec){ rec={count:0, maxY:0, minY:9999, years:[], displayName: rawName, pid}; byPerson.set(key,rec); }
      rec.count++;
      const y=tournYear(p.s||p.season||p.tourney)||0;
      if(y){ if(y>rec.maxY) rec.maxY=y; if(y<rec.minY) rec.minY=y; rec.years.push(y); }
    }
    const keepKeys=new Set();
    for(const [k, rec] of byPerson){
      if(rec.count>=2) keepKeys.add(k);
      else if(rec.maxY && rec.maxY>=recentMin) keepKeys.add(k);
    }
    let kept=0;
    for(const p of arr){
      const pid = p.pid!=null ? String(p.pid) : (p.player_id!=null ? String(p.player_id) : '');
      const key = pid ? ('pid:'+pid) : ('name:'+(p.n||p.name||'').trim().toLowerCase());
      if(keepKeys.has(key)) kept++;
    }
    console.log('pitch season filter v2 pid-aware: maxYear',maxYear,'recentMin',recentMin,'keptPersons',keepKeys.size,'keptPts',kept,'/',arr.length);
    return {keepKeys, maxYear, recentMin, kept, raw:arr.length};
  }

  function normalizeGuesses(list){
    if(!Array.isArray(list)) return [];
    const out=[];
    for(const g of list){
      if(g==null) continue;
      if(typeof g==='object'){
        const idx=g.idx!=null?g.idx|0:(g.id!=null?g.id|0:(g.i!=null?g.i|0:null));
        if(idx==null) continue;
        out.push({ idx, sim:(typeof g.sim==='number'?g.sim:null), rank:(typeof g.rank==='number'?g.rank:null), x:(typeof g.x==='number'?g.x:null), y:(typeof g.y==='number'?g.y:null), z:(typeof g.z==='number'?g.z:null), c:(typeof g.c==='number'?g.c:null), n:g.name||g.n||null, s:g.season||g.s||null, p:(typeof g.p==='number'?g.p:null) });
      } else out.push({ idx:g|0, sim:null, rank:null, x:null, y:null, z:null, c:null, n:null, s:null, p:null });
    }
    return out;
  }

  function _injectPoint(p){
    try{
      if(!p||p.i==null||!baseOx) return false;
      const id=p.i|0;
      if(id>=0 && id<=maxId && projById && projById[id]>=0) return true;
      const n=N+1;
      const nOx=new Float32Array(n), nOy=new Float32Array(n), nOz=new Float32Array(n);
      const nC=new Uint8Array(n), nI=new Int32Array(n);
      nOx.set(baseOx); nOy.set(baseOy); nOz.set(baseOz); nC.set(baseC); nI.set(baseI);
      nOx[N]=((p.x??0.5)-0.5)*2; nOy[N]=((p.y??0.5)-0.5)*2; nOz[N]=((p.z??0.5)-0.5)*2;
      nC[N]=(p.c|0)&7; nI[N]=id;
      baseOx=nOx; baseOy=nOy; baseOz=nOz; baseC=nC; baseI=nI;
      baseN[N]=p.n||''; baseS[N]=p.s||''; baseP[N]=p.p??-1; baseT[N]=p.team||'';
      projected.push({sx:0,sy:0,depth:0,alpha:0.6,c:nC[N]});
      N=n;
      if(id>maxId){ const np=new Int32Array(id+1); np.fill(-1); if(projById) np.set(projById); projById=np; maxId=id; }
      projById[id]=N-1;
      projectFrame(); return true;
    }catch(e){ console.warn('_injectPoint fail',e); return false; }
  }

  let targetId=highlightInit, guessIds=normalizeGuesses(opts.guessIds);
  let ctx=null; try{ ctx=canvas.getContext('2d',{alpha:false}); }catch{ ctx=canvas.getContext('2d'); }

  function getSize(){
    const rect=canvas.getBoundingClientRect();
    let w=rect.width, h=rect.height;
    if(w<10||h<10){ const pr=canvas.parentElement?.getBoundingClientRect(); w=Math.max(w, pr?.width||0, 320); h=Math.max(h, pr?.height||0, 380); if(w<10) w=window.innerWidth||390; if(h<10) h=Math.round((window.innerHeight||800)*0.5); }
    return {w:Math.max(10,Math.round(w)), h:Math.max(10,Math.round(h))};
  }
  function resize(){
    if(!canvas) return;
    const sz=getSize();
    if(W===sz.w && H===sz.h && canvas.width===sz.w && canvas.height===sz.h) return;
    W=sz.w; H=sz.h; canvas.width=W; canvas.height=H;
    if(canvas.style.width!==W+'px') canvas.style.width=W+'px';
    if(canvas.style.height!==H+'px') canvas.style.height=H+'px';
    if(ctx) ctx.setTransform(1,0,0,1,0,0);
    projectFrame(); draw();
  }
  function ensureArrays(len){
    if(!baseOx || baseOx.length!==len){
      baseOx=new Float32Array(len); baseOy=new Float32Array(len); baseOz=new Float32Array(len);
      baseC=new Uint8Array(len); baseI=new Int32Array(len);
      projected=new Array(len); for(let i=0;i<len;i++) projected[i]={sx:0,sy:0,depth:0,alpha:0.6};
    }
  }

  async function fetchWithCache(url){
    if(window.__mapPitchCache && window.__mapPitchCache[url]) return window.__mapPitchCache[url];
    try{
      if('caches' in window){
        const cache=await caches.open('vector-pitch-maps-v2');
        const hit=await cache.match(url);
        if(hit){ const j=await hit.json(); window.__mapPitchCache=window.__mapPitchCache||{}; window.__mapPitchCache[url]=j; return j; }
        const res=await fetch(url,{cache:'default'});
        if(res.ok){ cache.put(url, res.clone()); const j=await res.json(); window.__mapPitchCache=window.__mapPitchCache||{}; window.__mapPitchCache[url]=j; return j; }
      }
    }catch{}
    const r=await fetch(url,{cache:'force-cache'});
    if(!r.ok) throw new Error('fetch failed '+url);
    const j=await r.json();
    window.__mapPitchCache=window.__mapPitchCache||{}; window.__mapPitchCache[url]=j;
    return j;
  }

  async function loadVectors(){
    const liteUrls=['assets/vectors_search_lite.json','assets/vectors_lite.json','assets/vectors.json'];
    for(const u of liteUrls){
      try{
        const j=await fetchWithCache(u);
        const arr=j.players||j;
        if(!Array.isArray(arr)||!arr.length) continue;
        let useArr=arr;
        if(arr.length>200){
          const {keepKeys} = buildTourneyFilter(arr.map(p=>({n:p.name||p.n||'', s:p.season||p.tourney||p.s||'', pid:p.player_id||p.pid||p.i})));
          const filtered = arr.filter(p=>{
            const pid = p.player_id!=null ? String(p.player_id) : (p.pid!=null? String(p.pid):'');
            const key = pid ? ('pid:'+pid) : ('name:'+(p.name||p.n||'').trim().toLowerCase());
            return keepKeys.has(key);
          });
          useArr = (filtered.length>=180) ? filtered : arr;
          filteredCount=useArr.length;
          totalRaw=arr.length;
        }
        N=useArr.length; ensureArrays(N);
        let localMax=0;
        for(let i=0;i<N;i++){
          const p=useArr[i]||{};
          const x = p.x!=null ? p.x : (p.pc3&&p.pc3[0]!=null ? p.pc3[0] : (p.pc&&p.pc[0]!=null?p.pc[0]:0.5));
          const y = p.y!=null ? p.y : (p.pc3&&p.pc3[1]!=null ? p.pc3[1] : (p.pc&&p.pc[1]!=null?p.pc[1]:0.5));
          const z = p.z!=null ? p.z : (p.pc3&&p.pc3[2]!=null ? p.pc3[2] : (p.pc&&p.pc[2]!=null?p.pc[2]:0.5));
          baseOx[i]=((x)-0.5)*2; baseOy[i]=((y)-0.5)*2; baseOz[i]=((z)-0.5)*2;
          baseC[i]=(p.c|p.cluster|0)&7; baseI[i]=p.i!=null? (p.i|0) : (p.id!=null? p.id|0 : i);
          baseN[i]=p.name||p.n||''; baseS[i]=p.season||p.tourney||p.s||''; baseP[i]=['DEF','MID','FWD'].indexOf(p.pos||p.position)||0; baseT[i]=p.team||'';
          projected[i].c=baseC[i];
          if(baseI[i]>localMax) localMax=baseI[i];
        }
        maxId=localMax; projById=new Int32Array(maxId+1); projById.fill(-1);
        for(let i=0;i<N;i++){ const id=baseI[i]; if(id>=0&&id<=maxId) projById[id]=i; }
        console.log('shared-map pitch v2 loaded',N,u,'filtered',filteredCount||N,'/',totalRaw);
        projectFrame(); draw();
        if(u!=='assets/vectors.json' && !fullLoading){ fullLoading=true; setTimeout(()=>loadFullProgressive().catch(()=>{}), 600); }
        return true;
      }catch(e){ console.warn('pitch lite load fail',u,e); }
    }
    N=1; ensureArrays(1); baseOx[0]=0; baseOy[0]=0; baseOz[0]=0; baseC[0]=0; baseI[0]=0; baseN[0]='fallback'; maxId=0; projById=new Int32Array([0]); projectFrame(); draw(); return false;
  }

  async function loadFullProgressive(){
    if(fullLoaded) return;
    try{
      const j=await fetchWithCache('assets/vectors.json');
      const arr=j.players||j;
      if(!Array.isArray(arr)||arr.length<=N){ fullLoaded=true; return; }
      totalRaw=arr.length;
      const {keepKeys} = buildTourneyFilter(arr.map(p=>({n:p.name||'', s:p.season||'', pid:p.player_id||p.i})));
      const filtered = arr.filter(p=>{
        const pid = p.player_id!=null ? String(p.player_id) : '';
        const key = pid ? ('pid:'+pid) : ('name:'+(p.name||'').trim().toLowerCase());
        return keepKeys.has(key);
      });
      const useArr = (filtered.length>=180) ? filtered : arr;
      N=useArr.length; ensureArrays(N);
      let localMax=maxId;
      for(let i=0;i<N;i++){ const p=useArr[i]||{}; baseOx[i]=((p.x??0.5)-0.5)*2; baseOy[i]=((p.y??0.5)-0.5)*2; baseOz[i]=((p.z??0.5)-0.5)*2; baseC[i]=(p.c|0)&7; const id=p.id!=null? p.id|0 : i; baseI[i]=id; baseN[i]=p.name||''; baseS[i]=p.season||''; if(id>localMax) localMax=id; }
      maxId=localMax; projById=new Int32Array(maxId+1); projById.fill(-1); for(let i=0;i<N;i++){ const id=baseI[i]; if(id>=0&&id<=maxId) projById[id]=i; }
      fullLoaded=true; console.log('pitch v2 full progressive loaded',N); projectFrame(); draw();
      if(pendingFocus!=null){ setTarget(pendingFocus); pendingFocus=null; }
    }catch(e){ console.warn('full progressive fail',e); }
    finally{ fullLoading=false; }
  }

  function projectFrame(){
    if(!baseOx || !W || !H) return;
    const fov=380, dist=3.2;
    const cosY=Math.cos(rotY), sinY=Math.sin(rotY), cosX=Math.cos(rotX), sinX=Math.sin(rotX);
    for(let i=0;i<N;i++){
      let x=baseOx[i], y=baseOy[i], z=baseOz[i];
      let x1=x*cosY - z*sinY, z1=x*sinY + z*cosY;
      let y1=y;
      let y2=y1*cosX - z1*sinX, z2=y1*sinX + z1*cosX;
      const zc=z2+dist; const scale=fov/(fov+zc*90);
      const sx=W/2 + x1*scale*(W*0.42);
      const sy=H/2 - y2*scale*(H*0.42);
      const pr=projected[i]||(projected[i]={});
      pr.sx=sx; pr.sy=sy; pr.depth=zc; pr.scale=scale; pr.orig={id:baseI[i], pos:POS[baseP[i]]||POS[i%3], name:baseN[i], team:baseT[i], c:baseC[i]};
    }
    projected.sort((a,b)=>a.depth-b.depth);
  }

  function draw(){
    if(!ctx||!W||!H) return;
    ctx.fillStyle=dark?'#0A1510':'#FFFEF7';
    ctx.fillRect(0,0,W,H);
    ctx.strokeStyle=dark?'#1a2e1f':'#E5E2D8'; ctx.lineWidth=0.5;
    for(const pr of projected){
      const isHL=targetId!=null && pr.orig && pr.orig.id===targetId;
      const isGuess=guessIds.some(g=>g.idx===pr.orig.id);
      const col=POS_COLOR[pr.orig.pos]||OKABE[pr.orig.c%8]||'#777';
      const r=isHL?5: isGuess?3.2:1.6;
      ctx.globalAlpha=isHL?1: isGuess?0.95:0.55;
      ctx.fillStyle=isHL?'#F0E442':col;
      if(maxRender>3500 && r<2){
        const rr=Math.max(1,r); ctx.fillRect(pr.sx-rr/2, pr.sy-rr/2, rr, rr);
      }else{
        ctx.beginPath(); ctx.arc(pr.sx,pr.sy,r,0,Math.PI*2); ctx.fill();
      }
      if(isHL||isGuess){ ctx.strokeStyle='#0A1510'; ctx.lineWidth=isHL?1.6:0.8; ctx.stroke(); }
    }
    ctx.globalAlpha=1;
    if(targetId!=null){
      const t=projected.find(p=>p.orig && p.orig.id===targetId);
      if(t){ ctx.strokeStyle='#F0E442'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(t.sx,t.sy,9,0,Math.PI*2); ctx.stroke(); }
    }
  }

  let raf=0, lastT=0, isDragging=false, lastX=0, lastY=0;
  function loop(ts){
    raf=requestAnimationFrame(loop);
    if(embedPaused) { draw(); return; }
    if(isDragging) { draw(); return; }
    if(ts-lastT<frameBudget){ if(projected.length) draw(); return; }
    lastT=ts;
    if(auto){ rotY+=0.0016; projectFrame(); }
    draw();
  }

  function onDown(x,y){ isDragging=true; lastX=x; lastY=y; auto=false; }
  function onMove(x,y){ if(!isDragging) return; const dx=x-lastX, dy=y-lastY; rotY+=dx*0.008; rotX=Math.max(-1.2,Math.min(1.2,rotX+dy*0.006)); lastX=x; lastY=y; projectFrame(); draw(); }
  function onUp(){ isDragging=false; setTimeout(()=>{ if(!isDragging && !reduceMotion) auto=true; },1800); }

  function setTarget(id){
    if(baseOx==null){ pendingFocus=id; return; }
    targetId=id;
    if(!projById || id>maxId || projById[id]<0){
      window.fetch('assets/vectors.json',{cache:'force-cache'}).then(r=>r.json()).then(j=>{
        const arr=j.players||j; const p=arr.find(q=> (q.id===id)|| (q.i===id));
        if(p){ _injectPoint({i:id, x:p.x??0.5, y:p.y??0.5, z:p.z??0.5, c:p.c||0, n:p.name||'', s:p.season||''}); targetId=id; projectFrame(); draw(); }
      }).catch(()=>{});
    }
    projectFrame(); draw();
  }

  function setGuesses(ids){
    guessIds=normalizeGuesses(ids);
    projectFrame(); draw();
  }

  canvas.addEventListener('pointerdown', e=>{ try{canvas.setPointerCapture(e.pointerId);}catch{} onDown(e.clientX,e.clientY); });
  canvas.addEventListener('pointermove', e=>{ onMove(e.clientX,e.clientY); });
  canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointerleave', onUp);
  canvas.addEventListener('wheel', e=>{ e.preventDefault(); projectFrame(); draw(); },{passive:false});

  const ro=new ResizeObserver(()=>{ resize(); }); try{ ro.observe(canvas);}catch{}
  resize();
  await loadVectors(); projectFrame(); draw();
  if(!reduceMotion) raf=requestAnimationFrame(loop);

  const api={
    setTarget,
    setGuesses,
    focus(id){ setTarget(id); },
    pause(){ embedPaused=true; },
    resume(){ embedPaused=false; },
    get stats(){ return {N, totalRaw, filteredCount, maxId, fullLoaded}; },
    destroy(){ try{ cancelAnimationFrame(raf);}catch{} try{ ro.disconnect();}catch{} }
  };
  window._pitchMapApi=api;
  return api;
}
