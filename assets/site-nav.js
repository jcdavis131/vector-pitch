/* Shared top navigation — Vector Pitch mount on <nav class="site-nav" data-active="/path"> */
(function (global) {
  'use strict';
  var LINKS = [
    { href: '/', label: 'Play', title: 'Guess The Player daily' },
    { href: '/model', label: 'Lab', title: 'MTNN 24-d Training Cockpit' },
    { href: '/players', label: 'Players', title: '633 WC player dossier' },
    { href: '/methods', label: 'Methods', title: 'How built — every number recomputable' },
    { href: '/trends', label: 'Trends', title: '2018 → 2022 drift' },
    { href: '/dashboard', label: 'Dash', title: 'Lab pipeline status' }
  ];
  function mount() {
    var nav = document.querySelector('.site-nav');
    if (!nav) return;
    var active = nav.getAttribute('data-active') || '';
    var linksHtml = LINKS.map(function (l) {
      var isActive = active === l.href || (active === '/' && l.href === '/') ||
        (active === '/play' && l.href === '/') ||
        (active === '/model' && l.href === '/model') ||
        (active === '/players' && l.href === '/players') ||
        (active === '/methods' && l.href === '/methods') ||
        (active === '/trends' && l.href === '/trends') ||
        (active === '/dashboard' && l.href === '/dashboard');
      return '<a class="site-nav__link' + (isActive ? ' is-active' : '') + '"' +
        ' href="' + l.href + '"' +
        (l.title ? ' title="' + l.title + '"' : '') +
        (isActive ? ' aria-current="page"' : '') +
        '>' + l.label + '</a>';
    }).join('');
    nav.innerHTML =
      '<a class="site-nav__brand" href="/">VECTOR<span class="site-nav__accent">PITCH</span></a>' +
      '<div class="site-nav__links">' + linksHtml + '</div>';
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
  global.VPSiteNav = { mount: mount, links: LINKS };
})(window);
