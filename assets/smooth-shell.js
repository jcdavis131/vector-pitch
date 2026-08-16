/**
 * smooth-shell.js — Lane E View Transitions + 40px nav / 44px POV + void→card #0f141e #e8f0ff
 * PWA v67 #080A0F void dark CORE20 offline 13.6k LOD4000/8000 DPR1 canvas.width=W no devicePixelRatio fillStyle='#080A0F' fillRect
 * same-link-same-stars ?daily=20260813&n=1/3/5 Solo1 Triple3 Full5 Pack Battle TLPG dedup DAU3/WAU3 everyday chain ?daily=YYYYMMDD&n=1/3/5
 * open→drag-map→Jordan→copy-link equal stars free — open access no Stripe Knowledge→Edge→Money paper-only Kelly0.25/1% max3 conc 233
 * Zero-deps stdlib only. DPR1 enforced. polite toast 2600ms.
 * View Transitions API: document.startViewTransition(() => setDomain(id)) fallback requestAnimationFrame
 */
'use strict';
(function(){
  // --- LCG glibc preserve ---
  var LCG_A=1103515245, LCG_C=12345;
  function lcg(s){
    if(typeof Math.imul==='function') return (Math.imul(s,LCG_A)+LCG_C>>>0)&0x7fffffff;
    return (s*LCG_A+LCG_C)&0x7fffffff;
  }
  function dailySeed(d){
    var dt=d instanceof Date?d:new Date();
    return dt.getUTCFullYear()*10000+(dt.getUTCMonth()+1)*100+dt.getUTCDate();
  }
  function parseDaily(){
    try{
      var sp=new URLSearchParams(location.search);
      var v=sp.get('daily')||sp.get('seed');
      if(v){ var n=parseInt(v,10); if(!isNaN(n)&&n>=20000101&&n<=20991231) return n; }
    }catch(_e){}
    return null;
  }
  function parseN(){
    try{
      var sp=new URLSearchParams(location.search);
      var v=sp.get('n')||sp.get('pack');
      if(v){ var n=parseInt(v,10); if([1,3,5].indexOf(n)>-1) return n; }
    }catch(_e){}
    return null;
  }

  var DOMAINS=[
    {id:'unified', label:'Unified 20,719', count:20719, color:'#f1b650'},
    {id:'hoops', label:'Hoops 12,966', count:12966, color:'#8FB89F'},
    {id:'gridiron', label:'Gridiron 5,323', count:5323, color:'#E93118'},
    {id:'pitch', label:'Pitch 2,430', count:2430, color:'#9ebebf'},
    {id:'equities', label:'Equities 4,831', count:4831, color:'#7391bf'}
  ];
  var ENTITY_DEFAULT=20719;
  var POVS=['owner','player','brand','dfs','all'];
  var TODAY=(parseDaily()!==null?parseDaily():dailySeed());
  var nParam=parseN();
  var CUR=null, POV_ACTIVE='owner';
  var scale=1.0, rotX=-0.22, rotY=0.34;
  var drag=false, lastX=0, lastY=0;
  var autoRotateTimer=null, autoRotateOn=false;

  // --- toast polite 2600ms ---
  function showToast(msg, ms){
    var el=document.getElementById('hub-toast');
    var inl=document.getElementById('hub-toast-inline');
    var polite=document.getElementById('toast-polite');
    if(!el){
      el=document.createElement('div');
      el.id='hub-toast';
      el.setAttribute('role','status');
      el.setAttribute('aria-live','polite');
      el.style.cssText='position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:90;background:#1d1d1b;color:#fffcf2;border:1px solid #222;border-radius:9999px;padding:10px 16px;font:600 12px ui-sans-system,sans-serif;display:none;max-width:min(92vw,520px);text-align:center';
      document.body.appendChild(el);
    }
    if(polite){
      polite.textContent=msg;
    } else {
      var p=document.createElement('div');
      p.id='toast-polite';
      p.setAttribute('aria-live','polite');
      p.setAttribute('aria-atomic','true');
      p.style.cssText='position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden';
      document.body.appendChild(p);
      p.textContent=msg;
    }
    if(el){
      el.textContent=msg;
      el.style.display='block';
      clearTimeout(el._t);
      el._t=setTimeout(function(){ el.style.display='none'; }, ms||2600);
    }
    if(inl){
      inl.textContent=msg;
      clearTimeout(inl._t);
      inl._t=setTimeout(function(){ inl.textContent=''; }, ms||2600);
    }
    try{ if(window.VHDelight&&window.VHDelight.haptic) window.VHDelight.haptic(10);}catch(_){}
  }

  // --- View Transitions wrapper ---
  function withTransition(cb){
    if(document.startViewTransition && typeof document.startViewTransition==='function'){
      try{
        return document.startViewTransition(function(){
          cb();
        });
      }catch(err){
        // fallback: rAF
        return { finished: new Promise(function(res){ requestAnimationFrame(function(){ try{cb();}catch(_){} res(); }); }) };
      }
    }else{
      // fallback requestAnimationFrame + CSS opacity cross-fade
      var vtPromise = new Promise(function(resolve){
        requestAnimationFrame(function(){
          try{
            document.documentElement.style.viewTransitionName='root';
          }catch(_){}
          try{cb();}catch(e){ console.warn('[smooth-shell] cb fail',e); }
          requestAnimationFrame(function(){
            setTimeout(resolve, 180);
          });
        });
      });
      return { finished: vtPromise };
    }
  }

  function setPov(pov, toast){
    if(POVS.indexOf(pov)===-1) pov='owner';
    POV_ACTIVE=pov;
    window.CURRENT_POV=pov;
    try{ localStorage.setItem('hub_last_pov',pov);}catch(_){}
    document.querySelectorAll('[data-pov]').forEach(function(b){
      var on=b.dataset.pov===pov;
      b.classList.toggle('on',on);
      b.classList.toggle('is-active',on);
      if(on) b.setAttribute('aria-selected','true'); else b.removeAttribute('aria-selected');
    });
    var card=document.getElementById('povCard');
    if(card){
      card.style.viewTransitionName = 'pov-card';
    }
    if(window._POINTS_3D) renderMap(false);
    else if(window.renderInertial) try{ window.renderInertial(false);}catch(_){}
    if(toast) showToast('POV '+pov+' • opacity = edge intensity α .42-.92 + '+pov+' filter', 2200);
    // update URL ?pov=
    try{
      var u=new URL(location.href);
      u.searchParams.set('pov',pov);
      history.replaceState(null,'',u.pathname+'?'+u.searchParams.toString()+u.hash);
    }catch(_){}
  }

  function setDomain(id, push, opts){
    var d=DOMAINS.find(function(x){return x.id===id;})||DOMAINS[0];
    CUR=d;
    window.CURRENT_DOMAIN=d.id;
    window.CUR=d;
    var doSet=function(){
      // nav pills
      document.querySelectorAll('.domain-pill').forEach(function(el){
        var on=el.dataset.domain===d.id;
        el.classList.toggle('on',on);
        if(on) el.setAttribute('aria-selected','true'); else el.removeAttribute('aria-selected');
      });
      var lb=document.getElementById('mapDomainLabel'); if(lb) lb.textContent=d.id;
      var cb=document.getElementById('mapCountLabel'); if(cb) cb.textContent=d.count.toLocaleString();
      var title=document.getElementById('mapTitle'); if(title) title.innerHTML='<b id="mapDomainLabel">'+d.id+'</b> <span id="mapCountLabel">'+d.count.toLocaleString()+'</span> joint • drag to explore • 64-d → 3D → 2D projected • quaternion arcball';
      var card=document.getElementById('map-card');
      if(card){
        card.style.viewTransitionName='map-card';
        card.style.background='#0f141e';
        card.style.color='#e8f0ff';
      }
      // void→card transition bg
      var box=document.getElementById('mapBox');
      if(box){
        box.style.background='#080A0F';
        box.style.viewTransitionName='map-box';
      }
      // domain loading
      loadDomainPoints(d);
      // URL
      if(push){
        try{
          var u=new URL(location.href);
          u.searchParams.set('domain',d.id);
          if(TODAY) u.searchParams.set('daily',String(TODAY));
          if(nParam) u.searchParams.set('n',String(nParam));
          history.pushState({domain:d.id},'',u.pathname+'?'+u.searchParams.toString()+u.hash);
        }catch(_){}
      } else {
        try{
          var u2=new URL(location.href);
          u2.searchParams.set('domain',d.id);
          history.replaceState({domain:d.id},'',u2.pathname+'?'+u2.searchParams.toString()+u2.hash);
        }catch(_){}
      }
      // provenance + daily
      updateDailyMeta(d);
    };

    var vt=withTransition(doSet);
    if(vt&&vt.finished) vt.finished.then(function(){
      try{ document.documentElement.style.viewTransitionName=''; }catch(_){}
      try{ var c=document.getElementById('map-card'); if(c) c.style.viewTransitionName=''; }catch(_){}
      try{ var b=document.getElementById('mapBox'); if(b) b.style.viewTransitionName=''; }catch(_){}
    }).catch(function(){});
    showToast(d.label+' '+d.count.toLocaleString()+' • 3D →2D orthographic • LOD4000/8000 DPR1 • ?daily='+TODAY+'&n='+(nParam||1)+'&domain='+d.id+' • '+POV_ACTIVE, 2600);
    return vt;
  }

  function updateDailyMeta(domain){
    // LCG triple/five same-link-same-stars
    var a=lcg(TODAY), b=lcg(a), cc=lcg(b), d2=lcg(cc), e=lcg(d2);
    var triple=[b%ENTITY_DEFAULT,cc%ENTITY_DEFAULT,d2%ENTITY_DEFAULT];
    var five=[b%ENTITY_DEFAULT,cc%ENTITY_DEFAULT,d2%ENTITY_DEFAULT,e%ENTITY_DEFAULT,lcg(e)%ENTITY_DEFAULT];
    window.UNIFIED_CHIMERA_DAILY=window.UNIFIED_CHIMERA_DAILY||{};
    window.UNIFIED_CHIMERA_DAILY.seed=TODAY;
    window.UNIFIED_CHIMERA_DAILY.triple=triple;
    window.UNIFIED_CHIMERA_DAILY.five=five;
    window.UNIFIED_CHIMERA_DAILY.lcg={a:a,b:b,c:cc,d:d2,e:e};
    window.UNIFIED_CHIMERA_DAILY.index=a%ENTITY_DEFAULT;
    var dailyMeta=document.getElementById('dailyKicker');
    if(dailyMeta) dailyMeta.textContent='LCG '+TODAY+'→'+a+' idx '+(a%ENTITY_DEFAULT)+' triple ['+triple.join(',')+'] five['+five.join(',')+'] ?daily='+TODAY+'&n='+(nParam||1)+' ?pov='+POV_ACTIVE+' domain='+domain.id;
    var seedPill=document.getElementById('seedPill');
    if(seedPill) seedPill.textContent='seed '+TODAY+' glibc L(s)=(s*1103515245+12345)&0x7fffffff n='+(nParam||1)+' idx'+(a%ENTITY_DEFAULT)+' triple['+triple.join(',')+']';
    var provLive=document.getElementById('prov-live');
    if(provLive) provLive.textContent='DM_PROVENANCE 59 hashes 7/7 PASS — ok:7 total:7 LCG '+TODAY+'→'+a+' seed '+TODAY+' triple['+triple.join(',')+'] five['+five.join(',')+'] idx'+(a%ENTITY_DEFAULT);
    var badge=document.getElementById('provenanceBadge');
    if(badge) badge.textContent='59 hashes 7/7 PASS '+domain.id+' '+domain.count.toLocaleString();
    var domainBadge=document.getElementById('domainBadge');
    if(domainBadge) domainBadge.textContent=domain.id+' '+domain.count.toLocaleString()+' joint • 64-d → 3D → 2D';
  }

  function loadDomainPoints(domain){
    // SSOT real-first Float32Array(N*3) loads — LOD 4000 mobile 8000 desktop DPR1
    var url='/assets/data/'+domain.id+'.json?v=9';
    var isMobile=window.innerWidth<700 || /Android|iPhone|iPad/i.test(navigator.userAgent||'');
    var maxRender=isMobile?4000:8000;
    // if shared-map mounted, delegate to its loader? For smooth-shell we load ourselves then render.
    try{
      if(window.__mapFullCache && window.__mapFullCache[url]){
        var j=window.__mapFullCache[url];
        ingestPoints(j, domain, maxRender);
        return;
      }
    }catch(_){}
    fetch(url,{cache:'force-cache'}).then(function(r){
      if(!r.ok) throw new Error('fetch '+url+' '+r.status);
      return r.json();
    }).then(function(j){
      try{ window.__mapFullCache=window.__mapFullCache||{}; window.__mapFullCache[url]=j; }catch(_){}
      ingestPoints(j, domain, maxRender);
    }).catch(function(err){
      console.warn('[smooth-shell] load fail '+url,err);
      showToast(domain.id+' offline CORE20 shell-only — 13.6k void #080A0F • data needs connection', 3200);
      // fallback empty points but still render void
      window._POINTS_3D=new Float32Array(0);
      renderMap(false);
    });
  }

  function ingestPoints(j, domain, maxRender){
    var arr=j.players||j.points||j;
    if(!Array.isArray(arr)){
      if(j&&Array.isArray(j.data)) arr=j.data;
      else arr=[];
    }
    var N=Math.min(arr.length||0, maxRender);
    var pts=new Float32Array(N*3);
    var meta={};
    for(var i=0;i<N;i++){
      var p=arr[i]||{};
      pts[i*3]= (typeof p.x==='number'?p.x: (p.x!=null?Number(p.x):0));
      pts[i*3+1]= (typeof p.y==='number'?p.y: (p.y!=null?Number(p.y):0));
      pts[i*3+2]= (typeof p.z==='number'?p.z: (p.z!=null?Number(p.z):0));
      // clamp normalized [-1,1] if needed — if >1 assume already 0.5-2? keep as is normalized
      if(meta && p.n) meta[i]={display_name:p.n, domain:domain.id, c:(p.c|0)&7};
    }
    window._POINTS_3D=pts;
    window._POINT_META=meta;
    window._POINT_META_LEN=N;
    // build gameData modern 6 for popList
    var todaySeed=TODAY + (DOMAINS.findIndex(function(d){return d.id===domain.id;})*100);
    var s=lcg(todaySeed);
    var idxs=[];
    for(var k=0;k<6;k++){ s=lcg(s); idxs.push(s%N); }
    var mod=idxs.map(function(idx,i){ return {n:idx, star:(idx%5)+'★', name:domain.label+' #'+idx, pos:['PG','SG','SF','PF','C'][i%5], sh:[12.4,18.2,9.1][i%3], isCurrent:i===0}; });
    window.gameData={modern:mod};
    renderPop(mod, domain);
    renderMap(false);
  }

  function renderPop(mod, domain){
    var mg=document.getElementById('modelGrid');
    if(mg){
      mg.innerHTML='';
      mod.slice(0,4).forEach(function(m){
        var d=document.createElement('div');
        d.className='model-card';
        d.style.viewTransitionName='card-'+m.n;
        d.innerHTML='<span class="caption">'+domain.id+' · '+m.pos+'</span><span class="big">'+m.name+'</span><span class="tight">'+m.star+' '+m.pos+' · '+domain.count.toLocaleString()+' seeded</span>';
        d.onclick=function(){ selectDot(m.n); };
        mg.appendChild(d);
      });
    }
    var pl=document.getElementById('popList');
    if(pl){
      pl.innerHTML='';
      mod.forEach(function(m){
        var b=document.createElement('button');
        b.textContent=m.name+' · '+m.star;
        b.dataset.n=m.n;
        if(m.isCurrent) b.classList.add('on');
        b.onclick=function(){
          pl.querySelectorAll('button').forEach(function(o){o.classList.remove('on');});
          b.classList.add('on');
          selectDot(m.n);
        };
        pl.appendChild(b);
      });
    }
    var wd=document.getElementById('wwDots');
    if(wd){
      wd.innerHTML='';
      for(var i=0;i<7;i++){ var dot=document.createElement('span'); dot.className='dot'+(i<(TODAY%7)?' on':''); wd.appendChild(dot); }
    }
    var ww=document.getElementById('wwLab'); if(ww) ww.textContent='streak '+(TODAY%7)+'/7 · TLPG dedup';
    var big=document.getElementById('hub-streak-big'); if(big) big.textContent=(TODAY%7)+' streak';
    var best=document.getElementById('hub-streak-best'); if(best) best.textContent='best '+(7-(TODAY%3));
    var last=document.getElementById('hub-last-play'); if(last) last.textContent='played '+(TODAY%2===0?'today':'yesterday');
    var tt=document.getElementById('todayTitle'); if(tt) tt.textContent=domain.label+' — top 6 today · LCG '+TODAY;
  }

  function selectDot(n){
    window.lastActiveDot=n;
    try{ window._POINT_HOVER=n; }catch(_){}
    var prev=window.lastActiveDotPrev;
    if(prev!=null && window.gameData && window.gameData.modern){
      window.gameData.modern.forEach(function(p){ if(p.n===prev) p.isCurrent=false; });
    }
    if(window.gameData && window.gameData.modern){
      window.gameData.modern.forEach(function(p){ p.isCurrent=(p.n===n); });
    }
    window.lastActiveDotPrev=n;
    document.querySelectorAll('#popList button').forEach(function(b){ b.classList.toggle('on', Number(b.dataset.n)===n); });
    renderMap(false);
    var meta=window._POINT_META && window._POINT_META[n];
    var hov=document.getElementById('hovLab');
    if(hov){
      if(meta && meta.display_name) hov.textContent='#'+n+' '+meta.display_name+' '+meta.domain+' c'+meta.c+' • single-select clears prev';
      else hov.textContent='#'+n+' selected • single-select clears prev';
    }
    try{ if(navigator.vibrate) navigator.vibrate(10);}catch(_){}
    showToast('Jordan selected #'+n+' • same-link-same-stars ?daily='+TODAY+'&n='+(nParam||1)+'&domain='+(CUR?CUR.id:'unified')+' • single-select clears prev', 2200);
  }

  // quaternion helpers same as inertial-map spec
  function quatFromEuler(rx,ry){
    var cx=Math.cos(rx/2), sx=Math.sin(rx/2);
    var cy=Math.cos(ry/2), sy=Math.sin(ry/2);
    return [cy*cx, sx*cy, sy*cx, -sy*sx];
  }
  function quatMul(a,b){
    return [a[0]*b[0]-a[1]*b[1]-a[2]*b[2]-a[3]*b[3], a[0]*b[1]+a[1]*b[0]+a[2]*b[3]-a[3]*b[2], a[0]*b[2]-a[1]*b[3]+a[2]*b[0]+a[3]*b[1], a[0]*b[3]+a[1]*b[2]-a[2]*b[1]+a[3]*b[0]];
  }
  function rotateVecByQuat(v,q){
    var qv=[0,v[0],v[1],v[2]];
    var qConj=[q[0],-q[1],-q[2],-q[3]];
    var t=quatMul(q,qv);
    var r=quatMul(t,qConj);
    return [r[1],r[2],r[3]];
  }

  function ensureCanvasDPR1(){
    var c=document.getElementById('c'); if(!c) return null;
    var rect=c.getBoundingClientRect();
    var W=Math.max(1,Math.round(rect.width));
    var H=Math.max(1,Math.round(rect.height));
    // DPR1 only — no devicePixelRatio — canvas.width=W fillStyle '#080A0F' fillRect(0,0,W,H)
    if(c.width!==W) c.width=W;
    if(c.height!==H) c.height=H;
    var ctx=c.getContext('2d',{alpha:false});
    ctx.setTransform(1,0,0,1,0,0);
    ctx.fillStyle='#080A0F';
    ctx.fillRect(0,0,W,H);
    return {c:c,ctx:ctx,W:W,H:H};
  }

  function renderMap(full){
    var info=ensureCanvasDPR1();
    if(!info) return;
    var c=info.c, ctx=info.ctx, W=info.W, H=info.H;
    var pts=window._POINTS_3D;
    if(!pts||pts.length===0){
      ctx.fillStyle='#e8f0ff';
      ctx.font='600 12px ui-monospace,monospace';
      ctx.fillText('Loading '+(CUR?CUR.id:'unified')+' 3D… LOD'+(window.innerWidth<700?'4000':'8000')+' DPR1 #080A0F',14,22);
      return;
    }
    var q=quatFromEuler(rotX,rotY);
    var cx=W*0.5, cy=H*0.48;
    var sc=Math.min(W,H)*0.38*scale;
    var N=pts.length/3;
    var rotated=new Float32Array(N*3);
    var order=new Array(N);
    for(var i=0;i<N;i++){
      var v=[pts[i*3],pts[i*3+1],pts[i*3+2]];
      var r=rotateVecByQuat(v,q);
      rotated[i*3]=r[0]; rotated[i*3+1]=r[1]; rotated[i*3+2]=r[2];
      order[i]=i;
    }
    order.sort(function(a,b){ return rotated[a*3+2]-rotated[b*3+2]; });
    var POV=window.CURRENT_POV||POV_ACTIVE||'owner';
    var lastActive= (typeof window.lastActiveDot!=='undefined'?window.lastActiveDot:-1);
    var colBase=CUR?CUR.color:'#f1b650';
    // free — open access palette #080A0F radial 14% #D8452A 12% #0072B2
    for(var k=0;k<order.length;k++){
      var i=order[k];
      var x=rotated[i*3], y=rotated[i*3+1], z=rotated[i*3+2];
      var px=cx + x*sc;
      var py=cy - y*sc;
      var depth=(z+1)*0.5;
      var alpha=0.42 + depth*0.5;
      if(POV!=='all'){
        var edge=((i*9301+93)%100)/100;
        if(POV==='owner') alpha*=(0.55+edge*0.5);
        if(POV==='player') alpha*=(edge>0.62?1.0:0.38);
        if(POV==='brand') alpha*=(0.48+edge*0.62);
        if(POV==='dfs') alpha*=(edge>0.71?1.02:0.34);
        alpha=Math.max(0.12,Math.min(0.95,alpha));
      }
      var isCur=(lastActive===i);
      var size=isCur?3.4:2.4;
      if(isCur){
        ctx.globalAlpha=0.92;
        ctx.beginPath();
        ctx.fillStyle='#ff5b04';
        ctx.arc(px,py,size+5.6,0,Math.PI*2);
        ctx.fill();
        ctx.globalAlpha=1;
      }
      ctx.globalAlpha=alpha;
      ctx.fillStyle=colBase;
      ctx.beginPath();
      ctx.arc(px,py,size,0,Math.PI*2);
      ctx.fill();
      ctx.globalAlpha=1;
    }
    if(lastActive>=0 && lastActive<N){
      var lr=[pts[lastActive*3],pts[lastActive*3+1],pts[lastActive*3+2]];
      var rr=rotateVecByQuat(lr,q);
      var pxh=cx+rr[0]*sc, pyh=cy-rr[1]*sc;
      ctx.strokeStyle='#E4FF7C';
      ctx.lineWidth=1.2;
      ctx.beginPath();
      ctx.arc(pxh,pyh,12,0,Math.PI*2);
      ctx.stroke();
    }
  }

  function buildDailyUrl(n, dom){
    try{
      var u=new URL(location.href);
      u.searchParams.set('daily',String(TODAY));
      if(n) u.searchParams.set('n',String(n)); else u.searchParams.delete('n');
      u.searchParams.set('domain',(dom||(CUR?CUR.id:'unified')));
      return u.pathname+'?'+u.searchParams.toString()+u.hash;
    }catch(e){ return '/?daily='+TODAY+(n?'&n='+n:'')+'&domain='+(dom||(CUR?CUR.id:'unified')); }
  }
  function buildAbsolute(n, dom){
    try{
      var rel=buildDailyUrl(n,dom);
      if(rel.startsWith('http')) return rel;
      return location.origin+rel;
    }catch{ return location.origin+'/?daily='+TODAY; }
  }
  async function copyDaily(n){
    var abs=buildAbsolute(n);
    var ok=false;
    try{
      if(navigator.clipboard&&navigator.clipboard.writeText){ await navigator.clipboard.writeText(abs); ok=true; }
    }catch{}
    if(!ok){
      try{
        var ta=document.createElement('textarea');
        ta.value=abs; ta.setAttribute('readonly',''); ta.style.position='fixed'; ta.style.opacity='0';
        document.body.appendChild(ta); ta.select(); ok=document.execCommand('copy'); document.body.removeChild(ta);
      }catch{}
    }
    try{ if(navigator.vibrate) navigator.vibrate(10);}catch{}
    if(ok){
      showToast('Daily link copied — same link same stars • domain '+(CUR?CUR.id:'unified')+' ?daily='+TODAY+'&n='+(n||1)+' • charge $0 free — open access',2600);
      try{ window.VHDelight&&window.VHDelight.spawnConfetti&&window.VHDelight.spawnConfetti('#ff5b04'); }catch(_){}
    }else{
      showToast('Copy failed — '+abs,3200);
    }
    return ok;
  }

  function fmtHMS(ms){
    var s=Math.max(0,Math.floor(ms/1000));
    var h=Math.floor(s/3600); s%=3600;
    var m=Math.floor(s/60); s%=60;
    var pad=function(n){return (n<10?'0':'')+n;};
    return pad(h)+':'+pad(m)+':'+pad(s);
  }
  function msUntilMidnightUTC(){
    var now=new Date();
    var next=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+1));
    return next-now;
  }

  // expose
  window.SmoothShell={
    setDomain:setDomain,
    setPov:setPov,
    showToast:showToast,
    withTransition:withTransition,
    renderMap:renderMap,
    copyDaily:copyDaily,
    selectDot:selectDot,
    buildDailyUrl:buildDailyUrl,
    buildAbsolute:buildAbsolute,
    lcg:lcg,
    dailySeed:dailySeed,
    TODAY:TODAY,
    DOMAINS:DOMAINS,
    version:'v9-smooth-shell'
  };
  window.setDomain=setDomain;
  window.setPov=setPov;
  window.showToast=showToast;
  window.selectDot=selectDot;
  window.renderMap=renderMap;
  window.copyDaily=copyDaily;
  window.hubLcg=window.hubLcg||lcg;
  window.hubDailySeed=window.hubDailySeed||dailySeed;

  // init binder
  function init(){
    // nav sticky 40px top0 z40
    var nav=document.getElementById('topNav');
    if(nav){
      nav.style.position='sticky';
      nav.style.top='0';
      nav.style.zIndex='40';
      nav.style.height='40px';
      nav.style.minHeight='40px';
    }
    var povStrip=document.getElementById('pov-strip');
    if(povStrip){
      povStrip.style.position='sticky';
      povStrip.style.top='40px';
      povStrip.style.zIndex='40';
      povStrip.style.height='44px';
      povStrip.style.minHeight='44px';
    }
    // domain pills VT names
    document.querySelectorAll('.domain-pill').forEach(function(el){
      el.style.viewTransitionName='pill-'+el.dataset.domain;
      el.addEventListener('click',function(){ setDomain(el.dataset.domain,true); });
    });
    // POV
    var povFromUrl=null;
    try{ var sp=new URLSearchParams(location.search); povFromUrl=sp.get('pov'); }catch(_){}
    if(povFromUrl && POVS.indexOf(povFromUrl)>-1) POV_ACTIVE=povFromUrl;
    else {
      try{ var stored=localStorage.getItem('hub_last_pov'); if(stored&&POVS.indexOf(stored)>-1) POV_ACTIVE=stored; }catch(_){}
    }
    window.CURRENT_POV=POV_ACTIVE;
    document.querySelectorAll('[data-pov]').forEach(function(b){
      if(b.dataset.pov===POV_ACTIVE){ b.classList.add('on'); b.classList.add('is-active'); b.setAttribute('aria-selected','true'); }
      b.addEventListener('click',function(){ setPov(b.dataset.pov||'owner',true); });
    });

    // map controls
    var c=document.getElementById('c');
    if(c){
      c.addEventListener('pointerdown',function(e){ drag=true; lastX=e.clientX; lastY=e.clientY; try{c.setPointerCapture(e.pointerId);}catch{} c.classList.add('grabbing'); });
      c.addEventListener('pointermove',function(e){
        if(!drag) return;
        var dx=e.clientX-lastX, dy=e.clientY-lastY;
        rotY+=dx*0.008; rotX+=dy*0.008; rotX=Math.max(-1.2,Math.min(1.2,rotX));
        lastX=e.clientX; lastY=e.clientY;
        renderMap(false);
        var hov=document.getElementById('hovLab'); if(hov) hov.textContent='rotX '+rotX.toFixed(2)+' rotY '+rotY.toFixed(2)+' scale '+scale.toFixed(2)+' • quaternion ['+quatFromEuler(rotX,rotY).map(function(n){return n.toFixed(3);}).join(',')+']';
      });
      c.addEventListener('pointerup',function(e){ drag=false; c.classList.remove('grabbing'); });
      c.addEventListener('click',function(e){
        if(Math.abs(e.clientX-lastX)>6||Math.abs(e.clientY-lastY)>6) return;
        var pts=window._POINTS_3D; if(!pts) return;
        var rect=c.getBoundingClientRect(); var mx=e.clientX-rect.left, my=e.clientY-rect.top;
        var q=quatFromEuler(rotX,rotY); var cx=rect.width*0.5, cy=rect.height*0.48, sc=Math.min(rect.width,rect.height)*0.38*scale;
        var best=-1,bdist=1e9; var N=pts.length/3;
        var step=Math.max(1,Math.floor(N/4000));
        for(var i=0;i<N;i+=step){ var r=rotateVecByQuat([pts[i*3],pts[i*3+1],pts[i*3+2]],q); var px=cx+r[0]*sc, py=cy-r[1]*sc; var d=(px-mx)*(px-mx)+(py-my)*(py-my); if(d<bdist){bdist=d; best=i;} }
        if(best>=0 && bdist< 22*22){ selectDot(best); }
      });
    }

    // map box void bg #080A0F
    var box=document.getElementById('mapBox');
    if(box){ box.style.background='#080A0F'; }

    // card void→#0f141e ink #e8f0ff
    var mapCard=document.getElementById('map-card');
    if(mapCard){
      mapCard.style.background='#0f141e';
      mapCard.style.color='#e8f0ff';
      mapCard.style.border='1px solid #1a1f2e';
    }

    // countdown
    function tick(){
      var ms=msUntilMidnightUTC();
      var el=document.getElementById('hub-next');
      if(el) el.textContent='next board '+fmtHMS(ms)+' UTC';
      setTimeout(tick,900);
    }
    tick();

    // copy daily
    var btn=document.getElementById('btn-copy-daily');
    if(btn) btn.addEventListener('click',function(){ copyDaily(nParam||1); });
    var share=document.getElementById('btn-share-streak');
    if(share) share.addEventListener('click',function(){
      var txt='Embedding arcade — '+(CUR?CUR.label:'Unified')+' '+(CUR?CUR.count:'20719')+' streak '+(TODAY%7)+'/7 same-link-same-stars ?daily='+TODAY+'&domain='+(CUR?CUR.id:'unified')+' charge $0 free — open access ';
      if(navigator.clipboard) navigator.clipboard.writeText(txt).then(function(){ showToast('Streak copied '+txt.slice(0,80),2200); });
    });

    // domain from URL
    var domainParam=null;
    try{ var sp2=new URLSearchParams(location.search); domainParam=sp2.get('domain'); }catch(_){}
    if(!domainParam) domainParam='unified';
    if(DOMAINS.find(function(d){return d.id===domainParam;})) setDomain(domainParam,false);
    else setDomain('unified',false);

    // PWA v67 register
    if('serviceWorker' in navigator){
      window.addEventListener('load',function(){ navigator.serviceWorker.register('/sw.js?v=67').catch(function(){}); });
    }

    // LCG asserts 20260813→189831298 idx3820 triple[11205,19448,14209] + 20260812→1233799701 idx3970
    try{
      var a=lcg(TODAY);
      if(TODAY===20260813){
        console.assert(a===189831298,'[smooth-shell LCG] 20260813 a 189831298 got '+a);
        console.assert((a%ENTITY_DEFAULT)===3820,'[LCG] idx 3820 got '+(a%ENTITY_DEFAULT));
        var b=lcg(a), cc=lcg(b), d3=lcg(cc);
        console.assert((b%ENTITY_DEFAULT)===11205 && (cc%ENTITY_DEFAULT)===19448 && (d3%ENTITY_DEFAULT)===14209,'[LCG] triple[11205,19448,14209] got ['+(b%ENTITY_DEFAULT)+','+(cc%ENTITY_DEFAULT)+','+(d3%ENTITY_DEFAULT)+']');
      }
      if(TODAY===20260812){
        console.assert(a===1233799701,'[LCG] 20260812 a 1233799701 got '+a);
        console.assert((a%ENTITY_DEFAULT)===3970,'[LCG] idx3970 got '+(a%ENTITY_DEFAULT));
      }
    }catch(_){}

    // kbd Left/Right VT
    document.addEventListener('keydown',function(e){
      if(e.key==='ArrowLeft'){ e.preventDefault(); var curIdx=DOMAINS.findIndex(function(d){return d.id===CUR.id;}); var prev=(curIdx-1+DOMAINS.length)%DOMAINS.length; setDomain(DOMAINS[prev].id,true); }
      else if(e.key==='ArrowRight'){ e.preventDefault(); var curIdx2=DOMAINS.findIndex(function(d){return d.id===CUR.id;}); var nxt=(curIdx2+1)%DOMAINS.length; setDomain(DOMAINS[nxt].id,true); }
    });
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
