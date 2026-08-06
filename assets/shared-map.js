/* shared-map.js pitch v1 — hoops parity mountSharedMap lightweight
   - pitch 633 24-d L2 PC1/2/3 → canvas 3D starfield
   - DPR=1, LOD mobile 633 all, desktop all, throttle 30fps
   - Exports mountSharedMap(canvas, {highlightId, guessIds, dark})
*/
export async function mountSharedMap(canvas, opts={}){
  if(!canvas) return null;
  const dark=!!opts.dark;
  const highlightId=opts.highlightId??null;
  const rawGuesses=opts.guessIds||[];
  const POS=['DEF','MID','FWD'];
  const POS_COLOR={DEF:'#0072B2',MID:'#009E73',FWD:'#D55E00'};
  let W=0,H=0, rotY=0.18, rotX=0.22, auto=true, isDragging=false, lastX=0, lastY=0;
  let ctx=null; try{ ctx=canvas.getContext('2d',{alpha:false}); }catch{ ctx=canvas.getContext('2d'); }
  let N=0, pts=[], proj=[];

  function getSize(){
    const r=canvas.getBoundingClientRect();
    let w=r.width,h=r.height;
    if(w<10||h<10){ const pr=canvas.parentElement?.getBoundingClientRect(); w=Math.max(w,pr?.width||0,320); h=Math.max(h,pr?.height||0,380); if(w<10) w=window.innerWidth||360; if(h<10) h=400; }
    return {w:Math.round(w),h:Math.round(h)};
  }
  function resize(){
    if(!canvas) return;
    const sz=getSize(); W=sz.w; H=sz.h;
    const dpr=1;
    canvas.width=W*dpr; canvas.height=H*dpr;
    canvas.style.width=W+'px'; canvas.style.height=H+'px';
    if(ctx) ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  const ro=new ResizeObserver(resize); try{ ro.observe(canvas);}catch{}
  resize();

  async function loadVectors(){
    try{
      const res=await fetch('assets/vectors.json',{cache:'force-cache'});
      if(!res.ok) throw new Error('vectors fetch '+res.status);
      const data=await res.json();
      // vectors.json shape: {features, feature_labels, players:[{i,name,tourney,pos,cluster,vec24,profile16,pc3:[x,y,z]}...] } or similar — handle both
      let list=[];
      if(Array.isArray(data)) list=data;
      else if(data.players) list=data.players;
      else if(data.rows) list=data.rows;
      else if(data.vectors) list=data.vectors;
      if(!list.length){ console.warn('shared-map: empty vectors'); return; }
      // normalize to pts with x,y,z from pc3 or vec24 0/1/2
      pts=list.map((p,i)=>{
        let x=0,y=0,z=0;
        if(p.pc3&&p.pc3.length>=3){ x=p.pc3[0]; y=p.pc3[1]; z=p.pc3[2]; }
        else if(p.pc&&p.pc.length>=3){ x=p.pc[0]; y=p.pc[1]; z=p.pc[2]; }
        else if(p.vec){ x=(p.vec[0]||0); y=(p.vec[1]||0); z=(p.vec[2]||0); }
        else if(p.x!=null){ x=p.x; y=p.y; z=p.z; }
        else { x=(Math.random()-0.5)*2; y=(Math.random()-0.5)*2; z=(Math.random()-0.5)*2; }
        return {id:p.i!=null?p.i:i, x, y, z, pos:p.pos||p.position||POS[i%3], name:p.name||('P'+i), season:p.tourney||p.season||''};
      });
      N=pts.length;
    }catch(e){ console.warn('shared-map loadVectors fail',e); pts=[{id:0,x:0,y:0,z:0,pos:'MID',name:'fallback'}]; N=1; }
  }

  function projectFrame(){
    const fov=380, dist=3.2;
    const cosY=Math.cos(rotY), sinY=Math.sin(rotY), cosX=Math.cos(rotX), sinX=Math.sin(rotX);
    proj=pts.map(p=>{
      let x=p.x, y=p.y, z=p.z;
      // rotate Y
      let x1=x*cosY - z*sinY, z1=x*sinY + z*cosY;
      let y1=y;
      // rotate X
      let y2=y1*cosX - z1*sinX, z2=y1*sinX + z1*cosX;
      const zc=z2+dist;
      const scale=fov/(fov+zc*90);
      const sx=W/2 + x1*scale* (W*0.42);
      const sy=H/2 - y2*scale* (H*0.42);
      return {sx,sy,depth:zc,scale,orig:p};
    });
    proj.sort((a,b)=>a.depth-b.depth);
  }

  function draw(){
    if(!ctx||!W||!H) return;
    ctx.fillStyle=dark?'#0A1510':'#FFFEF7';
    ctx.fillRect(0,0,W,H);
    // grid faint
    ctx.strokeStyle=dark?'#1a2e1f':'#E5E2D8'; ctx.lineWidth=0.5;
    // dots
    for(const pr of proj){
      const isHL=highlightId!=null && pr.orig.id===highlightId;
      const isGuess=rawGuesses.some(g=> (typeof g==='object'?(g.idx===pr.orig.id||g.id===pr.orig.id):g===pr.orig.id));
      const col=POS_COLOR[pr.orig.pos]||'#777';
      const r=isHL?5: isGuess?3.2:1.6;
      ctx.globalAlpha=isHL?1: isGuess?0.95:0.55;
      ctx.fillStyle=isHL?'#F0E442':col;
      ctx.beginPath(); ctx.arc(pr.sx,pr.sy,r,0,Math.PI*2); ctx.fill();
      if(isHL||isGuess){ ctx.strokeStyle='#0A1510'; ctx.lineWidth=isHL?1.6:0.8; ctx.stroke(); }
    }
    ctx.globalAlpha=1;
    // highlight ring for target
    if(highlightId!=null){
      const t=proj.find(p=>p.orig.id===highlightId);
      if(t){ ctx.strokeStyle='#F0E442'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(t.sx,t.sy,9,0,Math.PI*2); ctx.stroke(); }
    }
  }

  let raf=0, last=0;
  function loop(ts){
    raf=requestAnimationFrame(loop);
    if(!auto||isDragging) { draw(); return; }
    if(ts-last<33) { if(proj.length) draw(); return; }
    last=ts;
    rotY+=0.0018;
    projectFrame(); draw();
  }

  // interaction
  function onDown(x,y){ isDragging=true; lastX=x; lastY=y; auto=false; }
  function onMove(x,y){ if(!isDragging) return; const dx=x-lastX, dy=y-lastY; rotY+=dx*0.008; rotX=Math.max(-1.2,Math.min(1.2,rotX+dy*0.006)); lastX=x; lastY=y; projectFrame(); draw(); }
  function onUp(){ isDragging=false; setTimeout(()=>{ if(!isDragging) auto=true; },1800); }

  canvas.addEventListener('pointerdown', e=>{ canvas.setPointerCapture(e.pointerId); onDown(e.clientX,e.clientY); });
  canvas.addEventListener('pointermove', e=>{ onMove(e.clientX,e.clientY); });
  canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointerleave', onUp);
  canvas.addEventListener('wheel', e=>{ e.preventDefault(); const d=Math.sign(e.deltaY)*0.12; // fake zoom by scaling spread — skip for simplicity
    projectFrame(); draw(); },{passive:false});

  await loadVectors(); projectFrame(); draw();
  if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches) raf=requestAnimationFrame(loop);

  const api={
    setTarget(id){ /* parity noop setter */ },
    setGuesses(ids){ /* update rawGuesses ref for parity */
      try{
        if(Array.isArray(ids)){ rawGuesses.length=0; ids.forEach(v=>rawGuesses.push(v)); }
        projectFrame(); draw();
      }catch(e){}
    },
    _pts:pts,
    destroy(){ try{ cancelAnimationFrame(raf);}catch{} try{ ro.disconnect();}catch{} }
  };
  return api;
}
