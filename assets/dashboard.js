/* Vector Pitch Lab */
(function(){
  const $ = (s, r=document)=>r.querySelector(s);
  const $$ = (s, r=document)=>[...r.querySelectorAll(s)];

  // level toggle novice/expert
  let level = 'novice';
  function setLevel(l){
    level = l;
    $$('.toggle-btn[data-level]').forEach(b=>b.classList.toggle('is-active', b.dataset.level===l));
    $$('[data-novice]').forEach(el=>el.style.display = l==='novice' ? '' : '');
    $$('[data-expert]').forEach(el=>el.style.display = l==='expert' ? '' : 'none');
    localStorage.setItem('dash-level', l);
  }
  $$('.toggle-btn[data-level]').forEach(b=>b.addEventListener('click',()=>setLevel(b.dataset.level)));
  setLevel(localStorage.getItem('dash-level')||'novice');

  // sport toggle
  let sport = 'hoops';
  function setSport(s){
    sport = s;
    $$('.toggle-btn[data-sport]').forEach(b=>b.classList.toggle('is-active', b.dataset.sport===s));
    localStorage.setItem('dash-sport', s);
    // could filter metrics per sport
  }
  $$('.toggle-btn[data-sport]').forEach(b=>b.addEventListener('click',()=>setSport(b.dataset.sport)));
  setSport(localStorage.getItem('dash-sport')||'hoops');

  // copy buttons
  $$('.copy').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const code = btn.closest('.code-panel')?.querySelector('code')?.textContent||'';
      navigator.clipboard.writeText(code).then(()=>{ btn.textContent='copied'; setTimeout(()=>btn.textContent='copy',1200); });
    });
  });

  // Canvas charts removed: the static dashboard had no real per-chart data source.
  // The shipped game is PCA(3)+k-means(8) over 16-d z-scored StatsBomb vectors; there
  // is no training-loss / MAE / param telemetry to plot, so the old hardcoded charts
  // (drift %, MAE, param count, pass bars) were fabricated. Removed rather than faked.

  // pipeline step click scroll
  $$('.pipe-step').forEach(el=>el.addEventListener('click',()=>{ const id=el.dataset.step; document.getElementById(id)?.scrollIntoView({behavior:'smooth', block:'start'}); }));
})();
