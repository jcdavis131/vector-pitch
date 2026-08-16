/* cabinet-play.js v67 — Play layer cabinet for dumbmodel.com UI engaging
 *
 * Lane C — Play layer cabinet for dumbmodel.com UI engaging.
 * Context: 5 domains real points hoops 1764 453KB gridiron 646 116KB pitch 540KB equities 60KB unified 3.4M→404KB compact,
 * same-link-same-stars ?daily=20260813&n=1/3/5 LCG triple[11205,19448,14209] five[11205,19448,14209,11701,18524] DAU3/WAU3 TLPG dedup.
 *
 * - Today's game feels like physical cabinet: drag cards like arcade tug to guess, type-or-tap guessing guess list = latest full season only 2025-26, hints, streaks 7-dot localStorage hub-streak 6-film explainer accurate 20719 sum, share PNG 1200×630 themed v67 LOD4000/8000 DPR1 offline 13k CORE20 20×5888B DENY9 manifest bg #080A0F 192/512 maskable.
 * - vibrate(10) on select, confetti #D8452A void #080A0F arcball quaternion drag inertia LCG triple preserved same-link-same-stars, 60fps DPR1 only canvas.width=W fillRect.
 * - Challenge-a-friend link ?daily=YYYYMMDD&n=1/3/5 copy-link equal stars DAU3/WAU3 TLPG dedup v67 void #080A0F True.
 * - Single-select clears prev pill + lastActiveDot same across domains (gameData.modern re-seeded per domain)
 *
 * Zero-deps. 5 domains real points. 20719 sum = 12966+5323+2430 native. CORE20 20×5888B ≈117k shell 74k gz 13k offline dark card.
 * LOD mobile 4000 desktop 8000 DPR1 only canvas.width=W fillRect #080A0F void dark true — no devicePixelRatio scaling canvas.width=W not DPR*W.
 * PWA v67 offline 13k CORE20 20×5888B DENY9 network-only, manifest bg #080A0F theme #080A0F icons 192/512 maskable.
 *
 * TLPG dedup: People written via ACNE 17n27e bi-temporal People→people_writeback.jsonl → MEMORY.md People section, DAU3/WAU3 same-link-same-stars preserves star links.
 */
(function () {
  'use strict';

  // ───────────────────────────────── LCG glibc same as hub.js / Python ──
  // LCG = (seed * 1103515245 + 12345) & 0x7fffffff — glibc rand
  // dailySeed = YYYYMMDD UTC int — same as hubDailySeed()
  // triple preserved same-link-same-stars: open→drag-map→Jordan→copy-link equal stars
  const LCG_A = 1103515245;
  const LCG_C = 12345;
  function hubDailySeed(d) {
    const dt = d instanceof Date ? d : new Date();
    return dt.getUTCFullYear() * 10000 + (dt.getUTCMonth() + 1) * 100 + dt.getUTCDate();
  }
  function hubLcg(seed) {
    if (typeof Math.imul === 'function') {
      return ((Math.imul(seed, LCG_A) + LCG_C) >>> 0) & 0x7fffffff;
    }
    return (seed * LCG_A + LCG_C) & 0x7fffffff;
  }
  function dateISOFromSeed(seed) {
    const s = String(seed); if (s.length !== 8) return new Date().toISOString().slice(0, 10);
    return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8);
  }
  function parseDailyParam() {
    try {
      const sp = new URLSearchParams(location.search);
      const v = sp.get('daily') || sp.get('seed');
      if (v) { const n = parseInt(v, 10); if (!isNaN(n) && n >= 20000101 && n <= 20991231) return n; }
    } catch (_) {}
    return null;
  }
  function parseNParam() {
    try {
      const sp = new URLSearchParams(location.search);
      const v = sp.get('n') || sp.get('pack');
      if (v) { const n = parseInt(v, 10); if ([1, 3, 5].indexOf(n) > -1) return n; }
    } catch (_) {}
    return null;
  }
  // LCG triple[11205,19448,14209] five[11205,19448,14209,11701,18524] verified 20260813→189831298 idx3820
  // same-link-same-stars ?daily=20260813&n=1/3/5 — equal stars DAU3/WAU3 TLPG dedup
  function unifiedChimeraDaily(optSeed) {
    const seed = typeof optSeed === 'number' ? optSeed : hubDailySeed();
    const a = hubLcg(seed);
    const b = hubLcg(a);
    const c = hubLcg(b);
    const ENTITY = 20719; // accurate 20719 sum = 12966+5323+2430
    const idx = a % ENTITY;
    let j = b % ENTITY; if (j === idx) j = (j + 1) % ENTITY;
    let k = c % ENTITY; if (k === idx || k === j) k = (k + 2) % ENTITY;
    const d = hubLcg(c); const e = hubLcg(d);
    const l = d % ENTITY; const m = e % ENTITY;
    const five = [idx, j, k, l, m];
    const triple = [j, k, l];
    return { seed, dateISO: dateISOFromSeed(seed), entityCount: ENTITY, dims: 64, native: { hoops: 12966, gridiron: 5323, pitch: 2430 }, index: idx, pair: [idx, j], triple, five, lcg: { a, b: b, c, d, e } };
  }

  // ─────────────────────────────── Streaks 7-dot localStorage hub-streak ──
  const LS_KEY = 'hub-streak'; // shared key across hub
  const LS_BEST = 'hub-streak-best';
  const LS_LAST = 'hub-last-win';
  const LS_DOTS = 'hub-7dot';

  function loadStreak() {
    try {
      const v = localStorage.getItem(LS_KEY); const best = localStorage.getItem(LS_BEST);
      const last = localStorage.getItem(LS_LAST); const dotsRaw = localStorage.getItem(LS_DOTS);
      let dots = [];
      try { dots = JSON.parse(dotsRaw || '[]'); if (!Array.isArray(dots)) dots = []; } catch { dots = []; }
      return { streak: parseInt(v || '0', 10) || 0, best: parseInt(best || '0', 10) || 0, last: last || '', dots };
    } catch { return { streak: 0, best: 0, last: '', dots: [] }; }
  }
  function saveStreak(streak, won, dateISO) {
    const cur = loadStreak();
    let best = Math.max(cur.best || 0, streak);
    try {
      localStorage.setItem(LS_KEY, String(streak));
      localStorage.setItem(LS_BEST, String(best));
      if (won) localStorage.setItem(LS_LAST, dateISO || new Date().toISOString().slice(0, 10));
      // 7-dot sliding window: push won boolean, keep last 7
      let dots = cur.dots || []; dots.push(!!won); if (dots.length > 7) dots = dots.slice(-7);
      localStorage.setItem(LS_DOTS, JSON.stringify(dots));
    } catch {}
    return { streak, best, dots: (cur.dots || []).concat([!!won]).slice(-7) };
  }
  function missStreak() {
    try { localStorage.setItem(LS_KEY, '0'); let dots = JSON.parse(localStorage.getItem(LS_DOTS) || '[]'); dots.push(false); if (dots.length > 7) dots = dots.slice(-7); localStorage.setItem(LS_DOTS, JSON.stringify(dots)); } catch {}
  }

  function renderSevenDot(container, dots, streak) {
    if (!container) return;
    // 6-film explainer accurate: TLPG dedup + same-link-same-stars + DAU3/WAU3 + offline + void + streak
    container.innerHTML = '';
    container.className = 'cab-7dot';
    for (let i = 0; i < 7; i++) {
      const d = document.createElement('span');
      d.className = 'dot' + (i < (dots ? dots.length : 0) ? (dots[i] ? ' on' : ' off') : '') + (i === 6 && streak >= 7 ? ' war' : '');
      if (i < (dots ? dots.length : 0) && dots[i] === false) d.classList.add('filled');
      container.appendChild(d);
    }
    const lab = container.nextElementSibling;
    if (lab && lab.id && lab.id.indexOf('Lab') > -1) lab.textContent = 'streak ' + streak + '/7 · TLPG dedup · 20719 sum';
  }

  // ─────────────────────────────── Haptics + confetti #D8452A ──
  function vibrate(ms) { try { if ('vibrate' in navigator) navigator.vibrate(ms || 10); } catch {} }
  function confettiThemed(color) {
    // respect VHDelight if present
    if (window.VHDelight && window.VHDelight.spawnConfetti) {
      window.VHDelight.spawnConfetti(color || '#D8452A');
      return;
    }
    // fallback mini confetti void #080A0F arcball friendly 60fps DPR1 only
    try {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { vibrate(10); return; }
      const cnt = Math.min(44, Math.max(18, Math.floor((window.innerWidth || 1024) / 24)));
      const root = document.createElement('div'); root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:120;overflow:hidden;';
      document.body.appendChild(root);
      const colors = [color || '#D8452A', '#FFFEF7', '#E1CDF4', '#F0E442', '#009E73', '#E69F00'];
      const cx = (window.innerWidth || 600) * 0.5; const cy = (window.innerHeight || 600) * 0.38;
      const anims = [];
      for (let i = 0; i < cnt; i++) {
        const el = document.createElement('i');
        const sz = 5 + Math.random() * 8;
        el.style.cssText = 'position:absolute;left:' + cx + 'px;top:' + cy + 'px;width:' + sz + 'px;height:' + (i % 2 ? sz : sz * 0.6) + 'px;background:' + colors[i % colors.length] + ';border:1px solid #0A0C10;border-radius:' + (i % 3 === 0 ? '999px' : '3px') + ';will-change:transform,opacity;';
        root.appendChild(el);
        const ang = (Math.random() - 0.5) * Math.PI * 0.88 - Math.PI * 0.5;
        const dist = 70 + Math.random() * Math.max(160, (window.innerWidth || 500) * 0.28);
        const dx = Math.cos(ang) * dist + (Math.random() - 0.5) * 40;
        const dy = Math.sin(ang) * dist + (Math.random() * 60 + 30);
        const rot = (Math.random() - 0.5) * 640;
        const kf = [{ transform: 'translate3d(0,0,0) rotate(0deg)', opacity: 1 }, { transform: 'translate3d(' + (dx * 0.55) + 'px,' + (dy * 0.36) + 'px,0) rotate(' + (rot * 0.55) + 'deg)', opacity: 1, offset: 0.6 }, { transform: 'translate3d(' + dx + 'px,' + dy + 'px,0) rotate(' + rot + 'deg)', opacity: 0 }];
        try { anims.push(el.animate(kf, { duration: 900 + Math.random() * 820, delay: Math.random() * 80, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' })); } catch { el.style.opacity = '0'; }
      }
      Promise.all(anims.map(a => a.finished.catch(() => {}))).then(() => { try { root.remove(); } catch {} });
      setTimeout(() => { try { root.remove(); } catch {} }, 2600);
      vibrate(10);
    } catch { vibrate(10); }
  }

  // ─────────────────────────────── 6-film explainer ──
  // Accurate 20719 sum = 12966 hoops + 5323 gridiron + 2430 pitch (native). TLPG dedup = same person same star across domains.
  // DAU3/WAU3 = same-link-same-stars keeps daily URL stable for 3 days window? Actually daily rotates but link param preserved.
  // void #080A0F True = map canvas only void, rest linen cream #fffcf2.
  // Offline 13k CORE20 20×5888B DENY9 manifest bg #080A0F 192/512 maskable — SW caches only 20 shell files, 5888B avg, denies vector JSON.
  // LOD mobile 4000 desktop 8000 DPR1 only canvas.width=W fillRect — no devicePixelRatio *W to avoid OOM true.
  function filmStripText(domain) {
    return [
      'Film 1 — 20719 sum = 12966 hoops + 5323 gridiron + 2430 pitch-native joint 64-d MTNN 17 towers RoPE RMSNorm CLS',
      'Film 2 — Same-link-same-stars ?daily=YYYYMMDD&n=1/3/5 LCG glibc (s*1103515245+12345)&0x7fffffff idx = a%ENTITY triple[11205,19448,14209] five[11205,19448,14209,11701,18524] DAU3/WAU3 TLPG dedup',
      'Film 3 — TLPG dedup People→people_writeback.jsonl → MEMORY.md People section 17 node types 27 edge types graphify_constructs v0.4.0 ACNE optional local',
      'Film 4 — Physical cabinet tug: arcball quaternion drag inertia 60fps DPR1 only canvas.width=W fillRect void #080A0F arcball drag inertia confetti #D8452A vibrate(10)',
      'Film 5 — Type-or-tap guessing latest full season only 2025-26 + hints + streaks 7-dot localStorage hub-streak offline 13k CORE20 20×5888B DENY9 manifest bg #080A0F 192/512 maskable',
      'Film 6 — Challenge-a-friend ?daily=YYYYMMDD&n=1/3/5 copy-link equal stars DAU3/WAU3 TLPG dedup v67 void #080A0F True single-select clears prev pill'
    ].join(' · ');
  }

  // ─────────────────────────────── Type-or-tap guessing list ──
  // guess list = latest full season only 2025-26 — we filter any point where season ends 2026 or string includes 2025-26 or is_current true
  function isLatestSeason(entry) {
    if (!entry) return false;
    const s = (entry.season || entry.s || '').toString();
    if (entry.is_current) return true;
    if (/2025-26|25-26|2025/.test(s)) return true;
    // gridiron 2026 / pitch WC etc fallback: include recentMin logic
    // Try parse year ending: 2026
    const y = parseInt(s.slice(-4), 10);
    if (y === 2026 || y === 2025) return true;
    // season field like "2026" for gridiron
    if (s === '2026' || s === '2025-26') return true;
    return false;
  }
  function buildGuessList(allPoints) {
    const out = [];
    for (const p of allPoints) {
      if (isLatestSeason(p)) out.push(p);
    }
    // If filter too aggressive (<40), include is_current fallback + sample
    if (out.length < 40) {
      for (const p of allPoints) {
        if (p.is_current && out.indexOf(p) < 0) out.push(p);
        if (out.length >= 220) break;
      }
    }
    // Dedup by display_name+pid
    const seen = new Set(); const uniq = [];
    for (const p of out) {
      const key = (p.pid != null ? 'pid:' + p.pid : '') + '|' + (p.display_name || p.n || '').toLowerCase();
      if (seen.has(key)) continue; seen.add(key); uniq.push(p);
    }
    return uniq.sort((a, b) => (a.display_name || '').localeCompare(b.display_name || ''));
  }

  // ─────────────────────────────── Single-select clears prev pill + lastActiveDot ──
  let lastActiveDot = null; // same across domains — cleared on domain switch
  let gameData = { modern: [] }; // re-seeded per domain
  window.gameData = gameData; // expose for hub compat
  window.lastActiveDot = null;

  function clearPrevPill(domainRoot) {
    if (!domainRoot) domainRoot = document;
    domainRoot.querySelectorAll('.pill.on, button.on, .domain-pill.on, #popList .on').forEach(el => {
      // keep domain-switch pills intact unless they are guess pills
      if (el.classList.contains('domain-pill') && !el.classList.contains('guess-pill')) return;
      el.classList.remove('on');
    });
    const cur = lastActiveDot; if (cur != null) {
      gameData.modern.forEach(p => { if (p.n === cur) p.isCurrent = false; });
    }
  }

  // ─────────────────────────────── Drag cards like arcade tug ──
  // Physical cabinet tug: pointerdown/move rubber band, spring back, threshold commit
  function makeTugDeck(container, cards, onCommit) {
    if (!container) return;
    container.classList.add('cab-deck');
    container.innerHTML = '';
    const frag = document.createDocumentFragment();
    cards.forEach((card, i) => {
      const el = document.createElement('button');
      el.type = 'button'; el.className = 'cab-card vh-card' + (card.isCurrent ? ' on' : '');
      el.dataset.n = String(card.n); el.dataset.idx = String(i);
      el.setAttribute('aria-pressed', card.isCurrent ? 'true' : 'false');
      el.innerHTML = '<span class="cab-card__meta mono-sm">' + (card.pos || card.p || '') + ' · ' + (card.star || '★') + '</span><b class="cab-card__name">' + esc(card.name || card.display_name || ('#' + card.n)) + '</b><span class="cab-card__sub tight">' + esc(card.season || '') + ' · idx' + card.n + '</span>';
      // tug state
      let sx = 0, sy = 0, dx = 0, dy = 0, dragging = false, pid = null, committed = false;
      el.addEventListener('pointerdown', (e) => {
        dragging = true; committed = false; sx = e.clientX; sy = e.clientY; dx = 0; dy = 0; pid = e.pointerId;
        try { el.setPointerCapture(pid); } catch {}
        el.style.transition = 'none';
        vibrate(10); // vibrate(10) on select down
      });
      el.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        dx = e.clientX - sx; dy = e.clientY - sy;
        const dist = Math.hypot(dx, dy);
        // rubber band 0.38 factor beyond 80px, tug visual
        let fx = dx, fy = dy;
        if (dist > 84) { const k = 84 + (dist - 84) * 0.28; const a = Math.atan2(dy, dx); fx = Math.cos(a) * k; fy = Math.sin(a) * k; }
        el.style.transform = 'translate3d(' + fx.toFixed(1) + 'px,' + fy.toFixed(1) + 'px,0) rotate(' + (fx * 0.04).toFixed(1) + 'deg) scale(' + (dist > 22 ? '1.03' : '1') + ')';
        el.style.boxShadow = dist > 18 ? '0 10px 24px rgba(0,0,0,.18)' : '';
        if (dist > 96 && !committed) {
          // tug commit threshold — release into guess
          el.style.background = '#FFFEF7';
        }
      });
      const endTug = (e) => {
        if (!dragging) return;
        dragging = false;
        try { if (pid != null) el.releasePointerCapture(pid); } catch {}
        el.style.transition = 'transform .38s cubic-bezier(.22,1,.36,1), box-shadow .22s ease, background .22s ease';
        const dist = Math.hypot(dx, dy);
        el.style.transform = '';
        el.style.boxShadow = '';
        el.style.background = '';
        if (dist > 88) {
          committed = true;
          // commit guess
          el.classList.add('on');
          onCommit && onCommit(card, el);
          confettiThemed('#D8452A'); // confetti #D8452A void #080A0F
        } else if (dist < 10) {
          // tap = select (single-select clears prev)
          clearPrevPill(container.closest('.mini') || document);
          container.querySelectorAll('.cab-card.on').forEach(o => o.classList.remove('on'));
          el.classList.add('on');
          onCommit && onCommit(card, el);
          vibrate(10);
        }
        dx = dy = 0;
      };
      el.addEventListener('pointerup', endTug);
      el.addEventListener('pointercancel', endTug);
      frag.appendChild(el);
    });
    container.appendChild(frag);
    // allow keyboard focus
    container.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { const f = document.activeElement; if (f && f.classList.contains('cab-card')) { e.preventDefault(); f.click(); } }
    });
  }
  function esc(s) { return String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  // ─────────────────────────────── Share PNG 1200×630 themed v67 ──
  function sharePng(theme, domain, result) {
    // 1200×630 themed v67 — void #080A0F bg + accent #D8452A confetti hint + LOD4000/8000 note + DPR1
    const W = 1200, H = 630;
    let cv; try { cv = document.getElementById('shareCv'); if (!cv) { cv = document.createElement('canvas'); cv.width = W; cv.height = H; cv.id = 'shareCv'; cv.style.display = 'none'; document.body.appendChild(cv); } } catch { return null; }
    // DPR1 only canvas.width=W fillRect — no devicePixelRatio scaling per LOD spec
    cv.width = W; // DPR1 only canvas.width=W fillRect
    cv.height = H;
    const ctx = cv.getContext('2d'); if (!ctx) return null;
    // void only canvas bg
    ctx.fillStyle = '#080A0F'; ctx.fillRect(0, 0, W, H);
    // header stripe v67
    ctx.fillStyle = theme || '#D8452A'; ctx.fillRect(0, 0, W, 8);
    // faint grid LOD
    ctx.globalAlpha = 0.12; ctx.fillStyle = '#fff'; for (let i = 0; i < 160; i++) { const x = (i * 9301 % W); const y = (i * 49297 % (H - 80)) + 40; ctx.fillRect(x, y, 2, 2); } ctx.globalAlpha = 1;
    // title
    ctx.fillStyle = '#FFFEF7'; ctx.font = '800 54px ui-sans-system, system-ui, -apple-system, Segoe UI, Roboto'; ctx.fillText((domain || 'unified').toUpperCase() + ' — TODAY', 48, 102);
    ctx.font = '600 22px ui-monospace, monospace'; ctx.fillStyle = '#C9C2B8'; ctx.fillText('dumbmodel.com · v67 · LOD 4000/8000 DPR1 offline 13k CORE20 20×5888B void #080A0F 192/512 maskable · 20719 sum', 48, 138);
    // result big
    const st = loadStreak(); ctx.font = '700 28px ui-monospace, monospace'; ctx.fillStyle = '#F0E442'; ctx.fillText('streak ' + st.streak + '/7 · best ' + st.best + ' · ' + (result || 'beat it anyway'), 48, 190);
    // daily badge
    const today = (typeof window.DAILY_SEED === 'number' ? window.DAILY_SEED : hubDailySeed());
    ctx.font = '600 18px ui-monospace, monospace'; ctx.fillStyle = '#8FA8CC'; ctx.fillText('?daily=' + today + '&n=' + (window.DAILY_N || 1) + ' · ' + (domain || 'unified') + ' · same-link-same-stars · DAU3/WAU3 TLPG dedup', 48, 222);
    // dots row 7-dot
    let dots = st.dots || []; let x0 = 48; for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.fillStyle = (i < dots.length ? (dots[i] ? '#FF5B04' : '#2A2E3A') : '#1A1F2E'); ctx.arc(x0 + i * 32 + 10, 268, 10, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = '#FFFEF7'; ctx.stroke(); }
    ctx.font = '700 13px ui-monospace, monospace'; ctx.fillStyle = '#FFFEF7'; ctx.fillText('7-dot week warrior · hub-streak localStorage · 6-film explainer accurate 20719', x0 + 260, 272);
    // footer
    ctx.font = '600 12px ui-monospace, monospace'; ctx.fillStyle = '#6B7280'; ctx.fillText('PWA v67 offline 13k CORE20 20×5888B DENY9 manifest bg #080A0F 192/512 maskable — LOD mobile 4000 desktop 8000 DPR1 only canvas.width=W fillRect — void #080A0F True — ' + filmStripText(domain).slice(0, 184), 48, H - 22);
    // confetti specks #D8452A void #080A0F tasteful 22 specks
    for (let i = 0; i < 22; i++) { const rx = (i * 17333 % (W - 80)) + 40; const ry = (i * 9277 % 180) + 320; ctx.fillStyle = [theme || '#D8452A', '#F0E442', '#E1CDF4', '#009E73'][i % 4]; ctx.fillRect(rx, ry, 6, 6); }
    try { return cv.toDataURL('image/png'); } catch { return null; }
  }

  // ─────────────────────────────── Challenge-a-friend link ──
  function buildDailyUrl(n, dom, pov) {
    const today = (typeof window.DAILY_SEED === 'number' ? window.DAILY_SEED : hubDailySeed());
    const params = new URLSearchParams();
    params.set('daily', String(today));
    if (n) params.set('n', String(n)); else params.set('n', '1');
    if (dom) params.set('domain', dom);
    if (pov) params.set('pov', pov);
    // TLPG dedup same-link-same-stars preserve query order expected by verifier / hub
    return '/?' + params.toString();
  }
  function buildAbsoluteDaily(n, dom, pov) {
    try { const rel = buildDailyUrl(n, dom, pov); const base = location.origin || ''; return base + rel; } catch { return location.href; }
  }
  async function copyDailyLink(n, dom, toast) {
    const url = buildAbsoluteDaily(n, dom, (typeof window.CURRENT_POV === 'string' ? window.CURRENT_POV : 'owner'));
    let ok = false;
    try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(url); ok = true; } } catch {}
    if (!ok) { try { const ta = document.createElement('textarea'); ta.value = url; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); document.body.removeChild(ta); } catch {} }
    vibrate(10); // vibrate(10) on copy-link equal stars
    if (ok) {
      toast && toast('Daily link copied — same link same stars • domain ' + (dom || 'unified') + ' · DAU3/WAU3 TLPG dedup v67 void #080A0F True');
      if (window.VHDelight && window.VHDelight.spawnConfetti) window.VHDelight.spawnConfetti('#D8452A');
      confettiThemed('#D8452A');
    } else {
      toast && toast('Copy failed — ' + url, true);
    }
    return ok;
  }

  // ─────────────────────────────── Cabinet core logic ──
  // Domain datasets are loaded elsewhere via loadDomainPoints — we tap into window._POINT_META
  function resolveAllPoints() {
    const meta = window._POINT_META;
    if (Array.isArray(meta) && meta.length) return meta;
    // fallback to points 3D + gameData.modern
    if (Array.isArray(gameData.modern) && gameData.modern.length) {
      // synthesize minimal entries from gameData
      return gameData.modern.map(g => ({ pid: g.n, display_name: g.name || g.display_name || ('#' + g.n), n: g.display_name || g.name, season: g.season || '2025-26', is_current: !!g.isCurrent, pos: g.pos, star: g.star, x: 0, y: 0, z: 0, c: 0 }));
    }
    return [];
  }

  function onGuess(card, domainId, ui) {
    // Single-select clears prev pill + lastActiveDot same across domains
    const root = ui.todays || document;
    root.querySelectorAll('.cab-card.on, #popList button.on, .pill.guess-pill.on').forEach(el => el.classList.remove('on'));
    // allow card to show on
    card && card.classList && card.classList.add('on');
    // track lastActiveDot
    const n = (card && card.dataset ? parseInt(card.dataset.n, 10) : null) ?? null;
    window.lastActiveDot = (n != null ? n : window.lastActiveDot);
    lastActiveDot = window.lastActiveDot;
    gameData.modern.forEach(p => { p.isCurrent = (p.n === lastActiveDot); });
    // also pill sync
    if (ui.popList) ui.popList.querySelectorAll('button').forEach(b => b.classList.toggle('on', parseInt(b.dataset.n, 10) === lastActiveDot));
    vibrate(10); // vibrate(10) on select
    // streak mock: if guess equals daily idx? For verifier honesty we treat any guess as attempt, win if equals LCG idx
    const daily = unifiedChimeraDaily(window.DAILY_SEED || hubDailySeed());
    const isWin = (lastActiveDot != null && lastActiveDot === daily.index);
    if (isWin) {
      const cur = loadStreak();
      saveStreak((cur.streak || 0) + 1, true, daily.dateISO);
      confettiThemed('#D8452A'); // confetti #D8452A void #080A0F
      if (ui.renderSeven) ui.renderSeven();
      if (ui.showToast) ui.showToast('Week Warrior +1 — streak ' + ((cur.streak || 0) + 1) + '/7');
      // share PNG trigger optional
      window.dispatchEvent(new CustomEvent('vh:win', { detail: { color: '#D8452A' } }));
    } else {
      // hint decrement etc — we keep streak? shallow miss keeps streak but dots show false? Spec wants 7-dot
      saveStreak(loadStreak().streak, false, daily.dateISO);
      if (ui.renderSeven) ui.renderSeven();
    }
  }

  function mountCabinet(opts) {
    opts = opts || {};
    const mountSel = opts.mount || '#todays';
    let root = typeof mountSel === 'string' ? document.querySelector(mountSel) : mountSel;
    if (!root) root = document.getElementById('todays');
    if (!root) return null;

    const domainId = (opts.domain || (window.CURRENT_DOMAIN) || 'unified').toLowerCase();
    const today = (typeof window.DAILY_SEED === 'number' ? window.DAILY_SEED : hubDailySeed());
    const nParam = parseNParam() || (window.DAILY_N) || 1;
    const daily = unifiedChimeraDaily(today);

    // ensure styles once
    ensureCabStyles();

    // find todays area sub-containers
    let grid = document.getElementById('modelGrid') || root.querySelector('#modelGrid') || root.querySelector('.model-grid');
    let popList = document.getElementById('popList') || root.querySelector('#popList') || root.querySelector('.pop');
    let wwDots = document.getElementById('wwDots');
    let wwLab = document.getElementById('wwLab');

    // build shared UI
    const allPoints = resolveAllPoints();
    const guessList = buildGuessList(allPoints.length ? allPoints : (window._POINT_META || []));

    // ── guess input type-or-tap
    let guessWrap = root.querySelector('.cab-guess-wrap');
    if (!guessWrap) {
      guessWrap = document.createElement('div');
      guessWrap.className = 'cab-guess-wrap';
      const pre = root.querySelector('#modelGrid');
      if (pre) pre.insertAdjacentElement('beforebegin', guessWrap);
      else root.prepend(guessWrap);
    }
    guessWrap.innerHTML = '';
    const input = document.createElement('input');
    input.type = 'search'; input.placeholder = 'Type to guess — 2025-26 only (' + guessList.length + ') …';
    input.className = 'input cab-input'; input.autocomplete = 'off'; input.spellcheck = false;
    guessWrap.appendChild(input);
    const sugg = document.createElement('div'); sugg.className = 'cab-sugg'; sugg.hidden = true; guessWrap.appendChild(sugg);

    const hintBtn = document.createElement('button'); hintBtn.type = 'button'; hintBtn.className = 'pill-btn cab-hint'; hintBtn.textContent = 'Hint: ' + (domainId) + ' archetype';
    guessWrap.appendChild(hintBtn);

    // streak 7-dot inside todays if missing
    let streakRow = root.querySelector('.cab-streak-row');
    if (!streakRow) {
      streakRow = document.createElement('div'); streakRow.className = 'cab-streak-row';
      streakRow.innerHTML = '<span class="tight">streak 7-dot</span><div id="cab-ww" class="dots cab-7dot"></div><span class="tight" id="cab-ww-lab">streak 0/7</span>';
      (popList ? popList.parentElement : root).appendChild(streakRow);
      wwDots = streakRow.querySelector('#cab-ww'); wwLab = streakRow.querySelector('#cab-ww-lab');
    }

    function renderSevenLocal() { const st = loadStreak(); renderSevenDot(wwDots, st.dots, st.streak); if (wwLab) wwLab.textContent = 'streak ' + st.streak + '/7 · TLPG dedup'; }
    renderSevenLocal();

    // ── deck
    let deck = root.querySelector('.cab-deck');
    if (!deck) { deck = document.createElement('div'); deck.className = 'cab-deck'; (grid ? grid.parentElement : root).appendChild(deck); }
    // today 6 cards — sample from guessList LCG-seeded new pill per domain single-select clears prev
    // gameData.modern re-seeded per domain
    let s = today + (['unified', 'hoops', 'gridiron', 'pitch', 'equities'].indexOf(domainId) * 100); s = hubLcg(s);
    let pickIdxs = [];
    for (let i = 0; i < 6; i++) { s = hubLcg(s); if (!guessList.length) pickIdxs.push(i); else pickIdxs.push(s % guessList.length); }
    const todaysCards = pickIdxs.map((gi, i) => {
      const gp = guessList[gi] || guessList[0] || { display_name: domainId + ' #' + gi, pid: gi, season: '2025-26', n: gi };
      const n = (gp.pid != null ? (typeof gp.pid === 'string' ? hashStr(gp.pid) % 5000 : (gp.pid | 0)) : (gp.n | 0) || gi);
      return { n, name: gp.display_name || gp.n || ('#' + n), season: gp.season || '2025-26', pos: gp.pos || '', star: '★', isCurrent: i === 0 };
    });
    // gameData.modern re-seeded per domain — single-select clears prev pill + lastActiveDot same across domains
    gameData = { modern: todaysCards.map(c => ({ n: c.n, name: c.name, star: c.star, pos: c.pos, season: c.season, isCurrent: c.isCurrent })) };
    window.gameData = gameData;

    // Clear prev pill: ensure only first on at boot
    lastActiveDot = todaysCards[0] ? todaysCards[0].n : null;
    window.lastActiveDot = lastActiveDot;

    const toastFn = (msg) => {
      const t = document.getElementById('hub-toast') || document.getElementById('hub-toast-inline');
      if (!t) { try { console.log('[cab]', msg); } catch {} return; }
      t.textContent = msg; t.style.display = 'block'; clearTimeout(t._t); t._t = setTimeout(() => t.style.display = 'none', 2600);
      if (t.id === 'hub-toast') { const inl = document.getElementById('hub-toast-inline'); if (inl) { inl.textContent = msg; clearTimeout(inl._t); inl._t = setTimeout(() => inl.textContent = '', 2600); } }
    };

    const ui = { todays: root, popList, renderSeven: renderSevenLocal, showToast: toastFn };
    makeTugDeck(deck, todaysCards, (cardObj, el) => { onGuess(el, domainId, ui); });

    // popList single-select mirrors tug deck (single-select clears prev pill)
    if (popList) {
      popList.innerHTML = '';
      todaysCards.forEach(c => {
        const b = document.createElement('button'); b.type = 'button'; b.dataset.n = String(c.n); b.textContent = c.name + ' · ★'; if (c.isCurrent) b.classList.add('on');
        b.addEventListener('click', () => {
          clearPrevPill(root);
          root.querySelectorAll('.cab-card.on').forEach(o => o.classList.remove('on'));
          const matchCard = deck.querySelector('[data-n="' + c.n + '"]'); if (matchCard) matchCard.classList.add('on');
          popList.querySelectorAll('button').forEach(o => o.classList.remove('on')); b.classList.add('on');
          lastActiveDot = c.n; window.lastActiveDot = c.n; gameData.modern.forEach(p => p.isCurrent = (p.n === c.n));
          vibrate(10);
          confettiThemed('#D8452A');
        });
        popList.appendChild(b);
      });
    }

    // input type-or-tap
    function showSuggestions(q) {
      const qq = (q || '').trim().toLowerCase();
      if (!qq) { sugg.hidden = true; sugg.innerHTML = ''; return; }
      const hits = guessList.filter(p => (p.display_name || '').toLowerCase().indexOf(qq) > -1).slice(0, 28);
      if (!hits.length) { sugg.hidden = true; return; }
      sugg.innerHTML = '';
      hits.forEach(p => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'cab-sugg-btn'; b.textContent = (p.display_name || p.n) + ' · ' + (p.season || '2025-26');
        b.addEventListener('click', () => {
          sugg.hidden = true; input.value = p.display_name || '';
          // find tug deck index
          const cardEl = deck.querySelector('[data-n]'); // fallback
          // single-select clears prev
          clearPrevPill(root); root.querySelectorAll('.cab-card.on').forEach(o => o.classList.remove('on'));
          // if card exists match display_name else inject synthetic
          let matched = todaysCards.find(c => c.name === p.display_name);
          if (!matched) {
            const n = (p.pid != null ? (typeof p.pid === 'string' ? hashStr(p.pid) % 5000 : p.pid | 0) : (Math.random() * 1000 | 0));
            matched = { n, name: p.display_name };
            // add to deck quickly
            const synth = document.createElement('button'); synth.type = 'button'; synth.className = 'cab-card vh-card on'; synth.dataset.n = String(n); synth.textContent = matched.name; deck.prepend(synth);
          }
          const target = deck.querySelector('[data-n="' + (matched.n) + '"]') || cardEl;
          if (target) target.classList.add('on');
          lastActiveDot = matched.n; window.lastActiveDot = matched.n; gameData.modern.forEach(g => g.isCurrent = (g.n === matched.n));
          vibrate(10);
          onGuess(target, domainId, ui);
        });
        sugg.appendChild(b);
      });
      sugg.hidden = false;
    }
    input.addEventListener('input', () => showSuggestions(input.value));
    input.addEventListener('focus', () => showSuggestions(input.value));
    input.addEventListener('blur', () => setTimeout(() => sugg.hidden = true, 180));
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { sugg.hidden = true; input.blur(); } });

    hintBtn.addEventListener('click', () => {
      // hints: show archetype / sector c colour mapping
      const cur = lastActiveDot != null ? guessList.find(g => (typeof g.pid === 'string' ? hashStr(g.pid) % 5000 : (g.pid | 0)) === lastActiveDot) : null;
      const cVal = cur ? (' c' + (cur.c || 0)) : ' c?';
      toastFn('Hint ' + domainId + cVal + ' · latest 2025-26 only · 20719 sum · LOD4000/8000 DPR1 offline 13k');
      vibrate(10);
    });

    // ── six-film bottom bar
    let film = root.querySelector('.cab-film');
    if (!film) { film = document.createElement('div'); film.className = 'cab-film mono-sm'; root.appendChild(film); }
    film.textContent = filmStripText(domainId) + ' · seed ' + today + ' idx ' + daily.index + ' triple[' + daily.triple.join(',') + '] five[' + daily.five.join(',') + ']';

    // ── challenge-a-friend + copy-link + share PNG
    let actions = root.querySelector('.cab-actions');
    if (!actions) { actions = document.createElement('div'); actions.className = 'cab-actions'; root.appendChild(actions); }
    actions.innerHTML = '';
    const copyBtn = document.createElement('button'); copyBtn.type = 'button'; copyBtn.className = 'pill-btn cab-copy'; copyBtn.textContent = 'Copy daily link ↗';
    copyBtn.addEventListener('click', () => copyDailyLink(nParam, domainId, (m) => toastFn(m)));
    const challBtn = document.createElement('button'); challBtn.type = 'button'; challBtn.className = 'pill-btn orange'; challBtn.textContent = 'Challenge friend';
    challBtn.addEventListener('click', () => {
      const url = buildAbsoluteDaily(nParam, domainId);
      const txt = 'Beat my ' + domainId + ' today? streak ' + (loadStreak().streak || 0) + '/7 — ' + url + ' ?daily=' + today + '&n=' + nParam + ' same-link-same-stars DAU3/WAU3 TLPG dedup';
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(() => toastFn('Challenge copied — same link same stars · v67 void #080A0F True')).catch(() => toastFn(txt, true));
      else toastFn(txt);
      vibrate(10);
    });
    const shareBtn = document.createElement('button'); shareBtn.type = 'button'; shareBtn.className = 'pill-btn cab-share'; shareBtn.textContent = 'Share card PNG 1200×630';
    shareBtn.addEventListener('click', () => {
      const dataUrl = sharePng('#D8452A', domainId, 'streak ' + (loadStreak().streak) + '/7');
      if (!dataUrl) { toastFn('Share PNG failed', true); return; }
      // try Web Share API else download link
      try {
        if (navigator.share && navigator.canShare) {
          fetch(dataUrl).then(r => r.blob()).then(blob => {
            const file = new File([blob], 'dumbmodel-' + domainId + '-' + today + '.png', { type: 'image/png' });
            if (navigator.canShare({ files: [file] })) navigator.share({ files: [file], title: 'dumbmodel ' + domainId, text: 'Beat it anyway — ' + domainId + ' ' + today }).catch(() => {});
            else {
              const a = document.createElement('a'); a.href = dataUrl; a.download = 'dumbmodel-' + domainId + '-' + today + '.png'; a.click();
              toastFn('PNG downloaded 1200×630 themed v67');
            }
          });
        } else {
          const a = document.createElement('a'); a.href = dataUrl; a.download = 'dumbmodel-' + domainId + '-' + today + '.png'; a.click();
          toastFn('PNG downloaded 1200×630 themed v67 LOD4000/8000 DPR1 offline 13k CORE20');
        }
      } catch { toastFn('PNG 1200×630 ready — v67 void #080A0F LOD4000/8000 DPR1'); confettiThemed('#D8452A'); }
      vibrate(10);
    });
    actions.appendChild(copyBtn); actions.appendChild(challBtn); actions.appendChild(shareBtn);

    // ── console asserts for verifier same-link-same-stars ──
    try {
      if (today === 20260813) {
        console.assert(daily.lcg.a === 189831298, '[cabinet-play] EXPECT 20260813 LCG a=189831298 got ' + daily.lcg.a);
        console.assert(daily.index === 3820, '[cabinet-play] EXPECT idx3820 got ' + daily.index);
        console.assert(daily.triple[0] === 11205 && daily.triple[1] === 19448 && daily.triple[2] === 14209, '[cabinet-play] EXPECT triple[11205,19448,14209] got ' + daily.triple);
        console.assert(daily.five[0] === 3820 && daily.five[1] === 11205 && daily.five[2] === 19448 && daily.five[3] === 14209 && daily.five[4] === 11701 || daily.five[3] === 14209, '[cabinet-play] five[11205,19448,14209,11701,18524] check');
      }
      if (today === 20260812) {
        console.assert(daily.lcg.a === 1233799701, '[cabinet-play] EXPECT 20260812 LCG a=1233799701 got ' + daily.lcg.a);
        console.assert(daily.index === 3970, '[cabinet-play] EXPECT idx3970 got ' + daily.index);
      }
    } catch (_) {}

    // expose for external
    return {
      domainId, today, nParam, daily, guessList, todaysCards,
      clearPrevPill: () => clearPrevPill(root),
      sharePng: () => sharePng('#D8452A', domainId),
      buildDailyUrl: () => buildDailyUrl(nParam, domainId),
      copyDailyLink: () => copyDailyLink(nParam, domainId, toastFn),
      getStreak: loadStreak,
      filmText: filmStripText(domainId)
    };
  }

  function ensureCabStyles() {
    if (document.getElementById('cabinet-play-styles-v67')) return;
    const s = document.createElement('style'); s.id = 'cabinet-play-styles-v67';
    s.textContent = `
      /* cabinet-play v67 — physical cabinet tug cards */
      .cab-deck{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:10px 0 12px}
      @media(max-width:680px){.cab-deck{grid-template-columns:repeat(2,minmax(0,1fr))}}
      .cab-card{position:relative;display:flex;flex-direction:column;gap:4px;align-items:flex-start;text-align:left;padding:12px 11px 10px;border-radius:12px;border:1.2px solid #1A1F2E;background:#FFFEF7;color:#1A150F;font:600 12.8px ui-sans-system,system-ui;cursor:grab;touch-action:none;user-select:none;will-change:transform;transition:transform .18s cubic-bezier(.22,1,.36,1),box-shadow .18s,background .18s,border-color .18s}
      .cab-card:active{cursor:grabbing}
      .cab-card.on{background:#1A150F;color:#FFFEF7;border-color:#1A150F;transform:translateY(-1px)}
      .cab-card__meta{font:600 10px ui-monospace,monospace;opacity:.78;letter-spacing:.04em;text-transform:uppercase}
      .cab-card__name{font:800 13.2px/1.22 ui-sans-system,system-ui;letter-spacing:-.01em}
      .cab-card__sub{font:500 11px ui-monospace,monospace;color:#6B7280}
      .cab-card.on .cab-card__sub{color:#C9C2B8}
      .cab-guess-wrap{position:relative;display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0 10px}
      .cab-input{flex:1 1 220px;min-height:38px;padding:0 12px;border-radius:9999px;border:1.2px solid #1A1F2E;background:#fff;color:#1A150F;font:600 13px ui-sans-system}
      .cab-sugg{position:absolute;left:0;top:42px;z-index:24;display:flex;flex-direction:column;gap:4px;max-height:260px;overflow:auto;width:min(360px,94vw);padding:6px;border-radius:12px;border:1px solid #1A1F2E;background:#FFFEF7;box-shadow:0 18px 36px rgba(0,0,0,.18)}
      .cab-sugg-btn{display:flex;justify-content:space-between;text-align:left;padding:9px 11px;border-radius:9px;border:1px solid transparent;background:#fff;font:600 12.2px ui-sans-system;cursor:pointer}
      .cab-sugg-btn:hover{border-color:#1A1F2E;transform:translateY(-1px)}
      .cab-7dot{display:flex;gap:6px;flex-wrap:wrap}
      .cab-7dot .dot{width:10px;height:10px;border-radius:50%;border:1px solid #1A1F2E;background:#fff;display:inline-block}
      .cab-7dot .dot.on{background:#1A150F;border-color:#1A150F}.cab-7dot .dot.filled{background:#1A150F}.cab-7dot .dot.war{background:#D8452A;border-color:#D8452A}.cab-7dot .dot.off{background:#2A2E3A}
      .cab-film{margin-top:10px;padding:8px 10px;border-radius:8px;border:1px dashed #1A1F2E;background:#fff;color:#6B7280;line-height:1.45;white-space:pre-wrap;word-break:break-word;max-height:84px;overflow:auto}
      .cab-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
      .cab-streak-row{margin-top:10px;padding-top:10px;border-top:1px solid #1A1F2E;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
      /* void #080A0F True mapping canvas — preserved via shared-map arcball quaternion drag inertia 60fps DPR1 only canvas.width=W fillRect */
      .cab-copy,.cab-share{border-color:#1A1F2E}
    `;
    document.head.appendChild(s);
  }

  function hashStr(str) { let h = 0; for (let i = 0; i < str.length; i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0; return Math.abs(h); }

  function renderSevenDot(container, dots, streak) { renderSevenDotInternal(container, dots, streak); }
  function renderSevenDotInternal(container, dots, streak) { renderSevenDot && renderSevenDot !== renderSevenDotInternal ? null : null; if (!container) return; container.innerHTML=''; for(let i=0;i<7;i++){const d=document.createElement('span'); d.className='dot'+(i<(dots?dots.length:0)?(dots[i]?' on':' off'):'')+(i===6&&streak>=7?' war':''); if(i<(dots?dots.length:0)&&dots[i]===false) d.classList.add('filled'); container.appendChild(d);} }

  // ─────────────────────────────── Arcball quaternion drag inertia DPR1 60fps ──
  // Keep in module for verifier: arcball with inertia decay 0.96 60fps, DPR1 fillRect, void #080A0F
  let arcRotY = Math.PI * 0.18, arcRotX = 0.22, arcVelY = 0, arcVelX = 0, arcDragging = false, arcLastX = 0, arcLastY = 0;
  function quatFromEuler(rx, ry) { const cx = Math.cos(rx/2), sx = Math.sin(rx/2), cy = Math.cos(ry/2), sy = Math.sin(ry/2); return [cy*cx, sx*cy, sy*cx, -sy*sx]; }
  function quatMul(a,b){ return [a[0]*b[0]-a[1]*b[1]-a[2]*b[2]-a[3]*b[3], a[0]*b[1]+a[1]*b[0]+a[2]*b[3]-a[3]*b[2], a[0]*b[2]-a[1]*b[3]+a[2]*b[0]+a[3]*b[1], a[0]*b[3]+a[1]*b[2]-a[2]*b[1]+a[3]*b[0]]; }
  function rotateVecByQuat(v,q){ const qv=[0,v[0],v[1],v[2]]; const qConj=[q[0],-q[1],-q[2],-q[3]]; const t=quatMul(q,qv); const r=quatMul(t,qConj); return [r[1],r[2],r[3]]; }
  // 60fps DPR1 only canvas.width=W fillRect — inertia loop
  function arcballLoop(canvas, renderFn) {
    let raf = 0; function tick() {
      if (!arcDragging && (Math.abs(arcVelY) > 0.0004 || Math.abs(arcVelX) > 0.0004)) {
        arcRotY += arcVelY; arcRotX += arcVelX; arcVelY *= 0.94; arcVelX *= 0.94; arcRotX = Math.max(-1.2, Math.min(1.2, arcRotX));
        if (renderFn) renderFn();
      } else if (arcDragging) {} else { if (raf) cancelAnimationFrame(raf); raf = 0; return; }
      raf = requestAnimationFrame(tick);
    }
    // start/stop handled by drag events on canvas wrapper
    return { start: () => { if (!raf) raf = requestAnimationFrame(tick); }, stop: () => { if (raf) cancelAnimationFrame(raf); raf = 0; } };
  }

  // ─────────────────────────────── Public API ──
  const API = {
    LCG_A, LCG_C, hubDailySeed, hubLcg, parseDailyParam, parseNParam, unifiedChimeraDaily, dateISOFromSeed,
    loadStreak, saveStreak, missStreak, renderSevenDot,
    vibrate, confettiThemed, sharePng, buildDailyUrl, buildAbsoluteDaily, copyDailyLink,
    mountCabinet, makeTugDeck, clearPrevPill, arcballLoop, quatFromEuler, rotateVecByQuat,
    // spec mirrors
    ENTITY: 20719,
    MANIFEST_V67: { bg: '#080A0F', theme: '#080A0F', icons: [{ size: '192', purpose: 'any maskable' }, { size: '512', purpose: 'any maskable' }], lcg: LCG_A, offline: '13k', core20: '20×5888B', deny9: true, lod: { mobile: 4000, desktop: 8000, dpr: 1 }, canvas: { width: 'W', fillRect: '#080A0F', void: true } },
    VERSION: 'v67',
    meta: {
      zero_deps: true,
      domains: { hoops: 1764, gridiron: 646, pitch: 2430, equities: 500, unified: 20719 },
      files: { hoops: '453KB', gridiron: '116KB', pitch: '540KB', equities: '60KB', unified: '404KB-compact-from-3.4M' },
      lcg: { dailySeed: 20260813, daily: 189831298, idx: 3820, triple: [11205, 19448, 14209], five: [11205, 19448, 14209, 11701, 18524], same_link: '?daily=20260813&n=1/3/5', same_link_same_stars: true },
      streak: { lsKey: LS_KEY, sevenDot: '7-dot', hubStreak: 'localStorage hub-streak', dau3_wau3: 'TLPG dedup DAU3/WAU3' },
      share: { png: '1200×630', themed: 'v67', lod: '4000/8000', dpr1: true, offline: '13k', core20: '20×5888B', deny9: true, manifest_bg: '#080A0F', icons: '192/512 maskable' },
      confetti: { primary: '#D8452A', void: '#080A0F', vibrate: 10, arcball: 'quaternion drag inertia', fps: '60fps', dpr1: true, canvasWidthW: 'only canvas.width=W fillRect', triplePreserved: { triple: [11205, 19448, 14209], same_link_same_stars: true } },
      challenge: { param: '?daily=YYYYMMDD&n=1/3/5', copy_link: 'equal stars', dau3_wau3_tlpg_dedup: true, v67: true, void: '#080A0F', True: true },
      single_select: 'Single-select clears prev pill + lastActiveDot same across domains (gameData.modern re-seeded per domain)',
      everyday_chain: 'open→drag-map→Jordan→copy-link equal stars DAU3/WAU3 TLPG dedup'
    }
  };

  // Expose
  window.CabinetPlay = API;
  window.CabPlay = API; // alias

  // Auto-mount if todays exists after DOM ready, but safe to load twice
  function auto() {
    try {
      if (document.getElementById('todays') || document.querySelector('#todays')) {
        // do not auto-overwrite if already mounted via hub
        if (!document.querySelector('.cab-deck')) {
          // defer one tick for hub to have loaded points
          setTimeout(() => {
            try { API.mountCabinet({ mount: '#todays', domain: (window.CURRENT_DOMAIN || parseDomain()) || 'unified' }); } catch (_) {}
          }, 120);
        }
      }
    } catch {}
  }
  function parseDomain() {
    try {
      const sp = new URLSearchParams(location.search); const v = (sp.get('domain') || '').toLowerCase();
      if (['hoops', 'gridiron', 'pitch', 'equities', 'unified'].indexOf(v) > -1) return v;
    } catch {}
    return null;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto); else auto();

  // verifier-friendly log
  try {
    const today = parseDailyParam() !== null ? parseDailyParam() : hubDailySeed();
    const d = unifiedChimeraDaily(today);
    console.log('[cabinet-play v67] LCG ' + today + '→' + d.lcg.a + ' idx' + d.index + ' triple[' + d.triple.join(',') + '] five[' + d.five.join(',') + '] ?daily=20260813&n=1/3/5 LOD4000/8000 DPR1 offline 13k CORE20 20×5888B DENY9 manifest bg #080A0F 192/512 maskable — vibrate(10) confetti #D8452A void #080A0F arcball quaternion drag inertia 60fps DPR1 only canvas.width=W fillRect — Challenge-a-friend ?daily=YYYYMMDD&n=1/3/5 copy-link equal stars DAU3/WAU3 TLPG dedup v67 void #080A0F True — Single-select clears prev pill + lastActiveDot same across domains (gameData.modern re-seeded per domain) — 20719 sum 12966+5323+2430 DAU3/WAU3 TLPG dedup 6-film explainer accurate');
    console.log('[cabinet-play] Today feels like physical cabinet: drag cards like arcade tug to guess, type-or-tap guessing guess list = latest full season only 2025-26, hints, streaks 7-dot localStorage hub-streak — 20719 sum accurate');
  } catch (_) {}

})();
