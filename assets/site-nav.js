/* Shared top navigation — Vector Pitch mount on <nav class="site-nav" data-active="/path"> — hoops parity VECTOR brand */
(function (global) {
  'use strict';
  var LINKS = [
    { href: '/', label: 'Play', title: 'Guess The Player daily — WC 2018 + 2022' },
    { href: '/model', label: 'Lab', title: 'MTNN 24-d Training Cockpit — 01→05 gated' },
    { href: '/players', label: 'Players', title: '633 WC player dossier — 8 archetypes' },
    { href: '/methods', label: 'Methods', title: 'Every number recomputable — StatsBomb' },
    { href: '/trends', label: 'Trends', title: '2018 → 2022 drift — scrubber + VORP' },
    { href: '/leaderboard', label: 'Board', title: 'Public daily leaderboards — anonymous' },
    { href: '/dashboard', label: 'Dash', title: 'Lab pipeline status — MTNN 24-d' },
    { href: '/offline', label: 'Offline', title: 'Offline cached shell' }
  ];
  function mount(){
    var nav=document.querySelector('.site-nav'); if(!nav) return;
    var active=(nav.getAttribute('data-active')||'').trim();
    // normalize: /play → / , /index.html → / etc
    if(active==='/play') active='/';
    if(active==='/index.html') active='/';
    var linksHtml=LINKS.map(function(l){
      var isActive=false;
      if(active===l.href) isActive=true;
      else if(active==='/' && l.href==='/') isActive=true;
      else if(active==='/' && l.href==='/play') isActive=false;
      else if(active.startsWith('/players') && l.href==='/players') isActive=true;
      else if(active.startsWith('/trends') && l.href==='/trends') isActive=true;
      else if(active.startsWith('/model') && l.href==='/model') isActive=true;
      else if(active.startsWith('/methods') && l.href==='/methods') isActive=true;
      else if(active.startsWith('/leaderboard') && l.href==='/leaderboard') isActive=true;
      else if(active.startsWith('/dashboard') && l.href==='/dashboard') isActive=true;
      else if(active==='/offline' && l.href==='/offline') isActive=true;
      // alias: / → Play only
      if(l.href==='/' && active!=='/' && active!=='') isActive=false;
      if(l.href==='/' && active==='/') isActive=true;
      // data-active 8/8 PASS — each link gets explicit href matching
      return '<a class="site-nav__link'+(isActive?' is-active':'')+'" href="'+l.href+'"'+(l.title?' title="'+l.title.replace(/"/g,'&quot;')+'"':'')+(isActive?' aria-current="page"':'')+'>'+l.label+'</a>';
    }).join('');
    nav.innerHTML='<a class="site-nav__brand" href="/">VECTOR<span class="site-nav__accent">PITCH</span></a><div class="site-nav__links">'+linksHtml+'</div>';
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  global.VPSiteNav={mount:mount, links:LINKS};
})(window);
