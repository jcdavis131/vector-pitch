/* Vector Pitch — game.js
 * Zero deps, zero build. Loads assets/vectors.json and runs "The Chimera":
 * a daily fused player-tournament, 6 guesses, cosine-similarity feedback,
 * a full-pitch zone-presence story, and a 3D league starfield map.
 *
 * Ported from Vector Hoops (assets/game.js in the sibling project) — same
 * core loop, same math, swapped for soccer's 16-dimension vector space.
 *
 * Data contract (assets/vectors.json), produced by pipeline/build_vectors.py:
 *   { built, seasons:["WC 2018","WC 2022"], normalization, features:[16],
 *     featureLabels:{feature->label}, clusters:[8 names],
 *     players:[{id,name,season,team,pos:"DEF"|"MID"|"FWD",v:[16 z-scores],
 *               x,y,z,c}, ...], attribution }
 * x,y,z are PCA(3) map coordinates in [0,1]. This dataset ships no `proj`
 * affine matrix and no `axes` labels, so the 3D map axes are labeled
 * generically (PC1/PC2/PC3) rather than re-derived — honest, not guessed.
 *
 * SPLIT BOUNDARY (half-split chimera): features[0..7] come from player A,
 * features[8..15] from player B. Feature order in vectors.json is:
 *   0 GOALS_P90            8  DRIBBLES_P90
 *   1 XG_P90               9  PRESSURES_P90
 *   2 FINISHING_P90         10 TACKLES_P90
 *   3 KEY_PASSES_P90        11 INTERCEPTIONS_P90
 *   4 ASSISTS_P90           12 RECOVERIES_P90
 *   5 PASSES_CMP_P90        13 CROSSES_P90
 *   6 PASS_CMP_PCT          14 FOULS_WON_P90
 *   7 PROG_CARRY_P90        15 FOULS_CONV_P90
 * Block A (0-7) is the attacking-output & buildup block: shooting, chance
 * creation, and progressive passing/carrying. Block B (8-15) is the
 * duel/defensive/set-piece block: dribbling duels, pressing, tackling,
 * interceptions, recoveries, crossing and fouls. Two of block B's stats
 * (dribbles, crosses) are attacking *actions* rather than defensive ones,
 * but they are duel/individual-skill stats grouped here by the dataset's
 * own column order — the boundary is stated here rather than silently
 * assumed.
 */
(function () {
  'use strict';

  var DATA_URL = 'assets/vectors.json';
  var EPOCH_DATE = '2026-07-05'; // puzzle #1
  var MAX_GUESSES = 6;
  var WIN_SIMILARITY = 0.92;
  var LS_KEY = 'vectorPitch.v1';
  var LS_KEY_USER_REF = 'vectorPitch.userRef';
  var SS_KEY_FULLREPORT = 'vectorPitch.fullReportOpen';
  var A_COUNT = 8; // first 8 dims from player A, last 8 from player B
  var POSITION_HINT_AT_GUESS = 3; // reveal position chip after guess #3

  // ---------------------------------------------------------------------
  // Telemetry: fire-and-forget, never blocks gameplay
  // ---------------------------------------------------------------------

  function getUserRef() {
    var ref = null;
    try { ref = localStorage.getItem(LS_KEY_USER_REF); } catch (e) { ref = null; }
    if (!ref) {
      ref = 'u_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
      try { localStorage.setItem(LS_KEY_USER_REF, ref); } catch (e) { /* storage unavailable */ }
    }
    return ref;
  }

  function track(event, detail) {
    try {
      fetch('/api/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: event, userRef: getUserRef(), detail: detail })
      }).catch(function () { /* fire-and-forget */ });
    } catch (e) { /* never block gameplay */ }
  }

  // Feature indices (fixed by pipeline/build_vectors.py FEATURES order)
  var IDX = {
    GOALS: 0, XG: 1, FINISHING: 2, KEY_PASSES: 3, ASSISTS: 4,
    PASSES_CMP: 5, PASS_CMP_PCT: 6, PROG_CARRY: 7,
    DRIBBLES: 8, PRESSURES: 9, TACKLES: 10, INTERCEPTIONS: 11,
    RECOVERIES: 12, CROSSES: 13, FOULS_WON: 14, FOULS_CONV: 15
  };

  // FIFA-style 3-letter team codes for the 40 nations in this dataset
  // (autocomplete display only — the underlying data keeps full names).
  var TEAM_CODE = {
    Argentina: 'ARG', Australia: 'AUS', Belgium: 'BEL', Brazil: 'BRA',
    Cameroon: 'CMR', Canada: 'CAN', Colombia: 'COL', 'Costa Rica': 'CRC',
    Croatia: 'CRO', Denmark: 'DEN', Ecuador: 'ECU', Egypt: 'EGY',
    England: 'ENG', France: 'FRA', Germany: 'GER', Ghana: 'GHA',
    Iceland: 'ISL', Iran: 'IRN', Japan: 'JPN', Mexico: 'MEX',
    Morocco: 'MAR', Netherlands: 'NED', Nigeria: 'NGA', Panama: 'PAN',
    Peru: 'PER', Poland: 'POL', Portugal: 'POR', Qatar: 'QAT',
    Russia: 'RUS', 'Saudi Arabia': 'KSA', Senegal: 'SEN', Serbia: 'SRB',
    'South Korea': 'KOR', Spain: 'ESP', Sweden: 'SWE', Switzerland: 'SUI',
    Tunisia: 'TUN', 'United States': 'USA', Uruguay: 'URU', Wales: 'WAL'
  };

  // ---------------------------------------------------------------------
  // Deterministic PRNG: xmur3 string hash -> mulberry32 generator
  // ---------------------------------------------------------------------

  function xmur3(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return h >>> 0;
    };
  }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seededRng(str) {
    var seedFn = xmur3(str);
    return mulberry32(seedFn());
  }

  // ---------------------------------------------------------------------
  // Vector math
  // ---------------------------------------------------------------------

  function dot(a, b) {
    var s = 0;
    for (var i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  }

  function norm(a) {
    return Math.sqrt(dot(a, a));
  }

  function cosineSim(a, b) {
    var na = norm(a), nb = norm(b);
    if (na === 0 || nb === 0) return 0;
    return dot(a, b) / (na * nb);
  }

  // ---------------------------------------------------------------------
  // Date helpers (UTC — one puzzle per UTC day)
  // ---------------------------------------------------------------------

  function utcDateString(d) {
    d = d || new Date();
    return d.toISOString().slice(0, 10); // YYYY-MM-DD in UTC
  }

  function daysBetweenUTC(fromStr, toStr) {
    var a = Date.parse(fromStr + 'T00:00:00Z');
    var b = Date.parse(toStr + 'T00:00:00Z');
    return Math.round((b - a) / 86400000);
  }

  function puzzleNumber(todayStr) {
    return daysBetweenUTC(EPOCH_DATE, todayStr) + 1;
  }

  // ---------------------------------------------------------------------
  // App state
  // ---------------------------------------------------------------------

  var DATA = null;         // parsed vectors.json
  var CENTROIDS = null;    // [k][16] mean vector per cluster
  var CLUSTER_XYZ = null;  // [k]{x,y,z,n} mean map position per cluster
  var TARGET = null;       // { a, b, vector, clusterIdx, posHint }
  var STATE = null;        // persisted localStorage state
  var TODAY = utcDateString();

  var els = {}; // cached DOM refs, filled in initDom()

  // ---------------------------------------------------------------------
  // Data prep
  // ---------------------------------------------------------------------

  function computeCentroids(players, k, dims) {
    var sums = [];
    var counts = [];
    for (var c = 0; c < k; c++) {
      sums.push(new Array(dims).fill(0));
      counts.push(0);
    }
    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      var s = sums[p.c];
      if (!s) continue;
      for (var d = 0; d < dims; d++) s[d] += p.v[d];
      counts[p.c]++;
    }
    for (c = 0; c < k; c++) {
      var n = counts[c] || 1;
      for (d = 0; d < dims; d++) sums[c][d] /= n;
    }
    return sums;
  }

  function computeClusterXYZ(players, k) {
    var sums = [];
    for (var c = 0; c < k; c++) sums.push({ x: 0, y: 0, z: 0, n: 0 });
    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      var s = sums[p.c];
      if (!s) continue;
      s.x += p.x; s.y += p.y; s.z += p.z; s.n++;
    }
    for (c = 0; c < k; c++) {
      if (sums[c].n > 0) { sums[c].x /= sums[c].n; sums[c].y /= sums[c].n; sums[c].z /= sums[c].n; }
      else { sums[c].x = 0.5; sums[c].y = 0.5; sums[c].z = 0.5; }
    }
    return sums;
  }

  function nearestCentroidIdx(vector, centroids) {
    var best = 0, bestDist = Infinity;
    for (var c = 0; c < centroids.length; c++) {
      var d = 0;
      for (var i = 0; i < vector.length; i++) {
        var diff = vector[i] - centroids[c][i];
        d += diff * diff;
      }
      if (d < bestDist) { bestDist = d; best = c; }
    }
    return best;
  }

  function playerKey(p) {
    var code = TEAM_CODE[p.team] || p.team;
    return p.name + ' (' + p.season + ' · ' + code + ' · ' + p.pos + ')';
  }

  // ---------------------------------------------------------------------
  // Daily Chimera target selection
  // ---------------------------------------------------------------------

  function halfNorm(v, from, to) {
    var s = 0;
    for (var i = from; i < to; i++) s += v[i] * v[i];
    return Math.sqrt(s);
  }

  function buildDailyTarget() {
    var players = DATA.players;
    var rng = seededRng('vector-pitch:' + TODAY);
    var a, b, tries = 0;
    do {
      var ia = Math.floor(rng() * players.length);
      var ib = Math.floor(rng() * players.length);
      a = players[ia];
      b = players[ib];
      tries++;
    } while (
      tries < 2000 &&
      (a === b || cosineSim(a.v, b.v) >= 0.3)
    );

    var vector = new Array(a.v.length);
    for (var i = 0; i < vector.length; i++) {
      vector[i] = i < A_COUNT ? a.v[i] : b.v[i];
    }

    var clusterIdx = nearestCentroidIdx(vector, CENTROIDS);

    // Position hint: whichever donor's half carries the more extreme
    // (higher-magnitude) statistical signature defines the "dominant"
    // position group — an honest heuristic, not a guess at team role.
    var normA = halfNorm(a.v, 0, A_COUNT);
    var normB = halfNorm(b.v, A_COUNT, vector.length);
    var posHint = normA >= normB ? a.pos : b.pos;

    return { a: a, b: b, vector: vector, clusterIdx: clusterIdx, posHint: posHint };
  }

  // ---------------------------------------------------------------------
  // Trait phrasing for the prompt
  // ---------------------------------------------------------------------

  function traitList(indices) {
    return indices.map(function (i) {
      return DATA.featureLabels[DATA.features[i]];
    });
  }

  // Deterministic trait phrasing for the scouting-report opener: top-2
  // positive sigmas become "an elite {noun} and {noun}", the single most
  // negative sigma becomes the "who {verb phrase}" clause.
  var TRAIT_POS_NOUN = {
    GOALS: 'scorer', XG: 'shot generator', FINISHING: 'clinical finisher',
    KEY_PASSES: 'chance creator', ASSISTS: 'playmaker',
    PASSES_CMP: 'high-volume passer', PASS_CMP_PCT: 'clean passer',
    PROG_CARRY: 'progressive carrier', DRIBBLES: 'dribbler',
    PRESSURES: 'presser', TACKLES: 'tackler', INTERCEPTIONS: 'interceptor',
    RECOVERIES: 'ball-winner', CROSSES: 'crosser',
    FOULS_WON: 'foul-magnet', FOULS_CONV: 'enforcer'
  };
  var TRAIT_NEG_VERB = {
    GOALS: 'rarely shoots', XG: 'generates almost no shot quality',
    FINISHING: 'wastes his chances in front of goal',
    KEY_PASSES: 'rarely creates for others', ASSISTS: "isn't the one setting up goals",
    PASSES_CMP: 'barely touches the ball in buildup',
    PASS_CMP_PCT: 'gives the ball away in possession',
    PROG_CARRY: 'never carries the ball forward', DRIBBLES: 'avoids taking players on',
    PRESSURES: "doesn't press", TACKLES: 'rarely wins the ball in the tackle',
    INTERCEPTIONS: "doesn't read the passing lanes",
    RECOVERIES: 'rarely recovers possession', CROSSES: 'never delivers from wide',
    FOULS_WON: 'rarely draws contact', FOULS_CONV: 'stays out of the referee’s book'
  };

  function buildScoutingLine(vector, clusterIdx) {
    var entries = DATA.features.map(function (key, i) {
      return { key: key, v: vector[i] };
    });
    var byDesc = entries.slice().sort(function (a, b) { return b.v - a.v; });
    var byAsc = entries.slice().sort(function (a, b) { return a.v - b.v; });
    var noun1 = TRAIT_POS_NOUN[byDesc[0].key];
    var noun2 = TRAIT_POS_NOUN[byDesc[1].key];
    var negPhrase = TRAIT_NEG_VERB[byAsc[0].key];
    var archetype = DATA.clusters[clusterIdx];
    return "Today's Chimera: an elite " + noun1 + ' and ' + noun2 + ' who ' +
      negPhrase + '. Archetype: ' + archetype + '.';
  }

  function joinOxford(list) {
    if (list.length === 0) return '';
    if (list.length === 1) return list[0];
    if (list.length === 2) return list[0] + ' and ' + list[1];
    return list.slice(0, -1).join(', ') + ', and ' + list[list.length - 1];
  }

  function renderPrompt() {
    var aIdx = [0, 1, 2, 3, 4, 5, 6, 7];
    var bIdx = [8, 9, 10, 11, 12, 13, 14, 15];
    var aPhrase = joinOxford(traitList(aIdx));
    var bPhrase = joinOxford(traitList(bIdx));

    els.puzzleNumber.textContent = 'Vector Pitch #' + puzzleNumber(TODAY);
    els.puzzleDay.textContent = String(puzzleNumber(TODAY));
    els.promptText.innerHTML =
      "Today's Chimera: the <b>" + aPhrase + '</b> profile of one World Cup player fused with the <b>' +
      bPhrase + '</b> profile of another. Same tournament halves, two different careers &mdash; find both.';
  }

  function renderScoutingLine() {
    els.scoutingLine.textContent = buildScoutingLine(TARGET.vector, TARGET.clusterIdx);
  }

  // ---------------------------------------------------------------------
  // localStorage state
  // ---------------------------------------------------------------------

  function defaultState() {
    return { streak: 0, lastWinDate: null, days: {} };
  }

  function loadState() {
    var raw = null;
    try { raw = localStorage.getItem(LS_KEY); } catch (e) { raw = null; }
    var s = defaultState();
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          s.streak = parsed.streak || 0;
          s.lastWinDate = parsed.lastWinDate || null;
          s.days = parsed.days || {};
        }
      } catch (e) { /* corrupt state, fall back to default */ }
    }
    if (!s.days[TODAY]) {
      s.days[TODAY] = { guesses: [], done: false, won: false };
    }
    return s;
  }

  function saveState() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(STATE)); } catch (e) { /* storage unavailable */ }
  }

  function todayRecord() {
    return STATE.days[TODAY];
  }

  function registerCompletion(won) {
    var rec = todayRecord();
    rec.done = true;
    rec.won = won;
    if (won) {
      var yesterday = utcDateString(new Date(Date.now() - 86400000));
      STATE.streak = (STATE.lastWinDate === yesterday) ? STATE.streak + 1 : 1;
      STATE.lastWinDate = TODAY;
      track('vp-win', rec.guesses.length);
    } else {
      STATE.streak = 0;
      track('vp-loss');
    }
    saveState();
    renderStreak();
  }

  function renderStreak() {
    els.streakNum.textContent = String(STATE.streak);
  }

  // ---------------------------------------------------------------------
  // Autocomplete
  // ---------------------------------------------------------------------

  function createAutocomplete(inputEl, listEl, players, onSelect) {
    var activeIdx = -1;
    var currentMatches = [];

    function close() {
      listEl.hidden = true;
      listEl.innerHTML = '';
      inputEl.setAttribute('aria-expanded', 'false');
      activeIdx = -1;
      currentMatches = [];
    }

    function open(matches) {
      currentMatches = matches;
      activeIdx = -1;
      listEl.innerHTML = '';
      if (matches.length === 0) { close(); return; }
      matches.forEach(function (p, idx) {
        var li = document.createElement('li');
        li.setAttribute('role', 'option');
        li.textContent = playerKey(p);
        li.dataset.idx = String(idx);
        li.addEventListener('mousedown', function (ev) {
          ev.preventDefault();
          select(idx);
        });
        listEl.appendChild(li);
      });
      listEl.hidden = false;
      inputEl.setAttribute('aria-expanded', 'true');
    }

    function highlight() {
      var items = listEl.querySelectorAll('li');
      items.forEach(function (li, idx) {
        li.classList.toggle('active', idx === activeIdx);
      });
      if (activeIdx >= 0 && items[activeIdx]) {
        items[activeIdx].scrollIntoView({ block: 'nearest' });
      }
    }

    function select(idx) {
      var p = currentMatches[idx];
      if (!p) return;
      inputEl.value = playerKey(p);
      close();
      onSelect(p);
    }

    // accent-insensitive: "mbappe" finds "Mbappé"
    function foldTerm(s) {
      return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    }

    function search(term) {
      term = foldTerm(term.trim());
      if (!term) { close(); return; }
      var matches = [];
      for (var i = 0; i < players.length && matches.length < 8; i++) {
        var p = players[i];
        if (p._k === undefined) p._k = foldTerm(playerKey(p));
        if (p._k.indexOf(term) !== -1) matches.push(p);
      }
      open(matches);
    }

    inputEl.addEventListener('input', function () { search(inputEl.value); });

    inputEl.addEventListener('keydown', function (ev) {
      if (listEl.hidden) return;
      if (ev.key === 'ArrowDown') {
        ev.preventDefault();
        activeIdx = Math.min(activeIdx + 1, currentMatches.length - 1);
        highlight();
      } else if (ev.key === 'ArrowUp') {
        ev.preventDefault();
        activeIdx = Math.max(activeIdx - 1, 0);
        highlight();
      } else if (ev.key === 'Enter') {
        if (activeIdx >= 0) {
          ev.preventDefault();
          select(activeIdx);
        }
      } else if (ev.key === 'Escape') {
        close();
      }
    });

    inputEl.addEventListener('blur', function () {
      setTimeout(close, 120);
    });

    return { close: close };
  }

  // ---------------------------------------------------------------------
  // Zone math: z-scored features -> pitch zone intensities
  // ---------------------------------------------------------------------
  //
  // The full pitch (105m x 68m, own goal at x=0, attacking goal at x=105)
  // is partitioned into zone regions. Region fill opacity (attack, orange)
  // and hatch opacity (defense, blue) are both linear in sigma:
  // clamp(z / 3, 0, 1) * MAX. Every zone carries its numeric sigma label.
  //
  //   ATTACK (orange fills, near the attacking box / through midfield)
  //     box     = avg( GOALS[0], XG[1] )              box presence
  //     create  = avg( KEY_PASSES[3], ASSISTS[4] )     arcs into the box
  //     wide    = CROSSES[13]                          crossing off the flanks
  //     carry   = avg( PROG_CARRY[7], DRIBBLES[8] )    carrying through midfield
  //   DEFENSE (blue 45-degree hatching / recovery block near own box)
  //     press      = PRESSURES[9]                      pressing, middle+attacking thirds
  //     tackleInt  = avg( TACKLES[10], INTERCEPTIONS[11] )  defensive-third duels
  //     recover    = RECOVERIES[12]                     recoveries near own box

  var ZONE_Z_MAX = 3;         // sigma value that saturates a zone
  var ZONE_FILL_MAX = 0.60;   // fills stay translucent so labels read
  var ZONE_HATCH_MAX = 0.90;

  function zoneT(z) {
    var t = z / ZONE_Z_MAX;
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    return t;
  }

  function zoneRaw(v) {
    return {
      box: (v[IDX.GOALS] + v[IDX.XG]) / 2,
      create: (v[IDX.KEY_PASSES] + v[IDX.ASSISTS]) / 2,
      wide: v[IDX.CROSSES],
      carry: (v[IDX.PROG_CARRY] + v[IDX.DRIBBLES]) / 2,
      press: v[IDX.PRESSURES],
      tackleInt: (v[IDX.TACKLES] + v[IDX.INTERCEPTIONS]) / 2,
      recover: v[IDX.RECOVERIES]
    };
  }

  var OFFENSE_KEYS = ['box', 'create', 'wide', 'carry'];
  var DEFENSE_KEYS = ['press', 'tackleInt', 'recover'];
  var OFFENSE_PHRASE = {
    box: 'lives in the box', create: 'creates from between the lines',
    wide: 'lives out wide', carry: 'carries the ball through midfield'
  };
  var DEFENSE_PHRASE = {
    press: 'presses high up the pitch', tackleInt: 'anchors the defensive third',
    recover: 'mops up around his own box'
  };

  function dominantKey(zones, keys) {
    var bestK = keys[0], bestV = -Infinity;
    keys.forEach(function (k) {
      if (zones[k] > bestV) { bestV = zones[k]; bestK = k; }
    });
    return bestK;
  }

  function entityPhrase(zones) {
    var topOff = dominantKey(zones, OFFENSE_KEYS);
    var topDef = dominantKey(zones, DEFENSE_KEYS);
    return DEFENSE_PHRASE[topDef] + ' and ' + OFFENSE_PHRASE[topOff];
  }

  function storyCaption(targetZones, guessZones) {
    return 'The Chimera ' + entityPhrase(targetZones) + ' — your guess ' + entityPhrase(guessZones) + '.';
  }

  // ---------------------------------------------------------------------
  // Full-pitch diagram (canvas, drawn in code — no assets)
  // ---------------------------------------------------------------------

  // Pitch geometry, all in meters. X() and Y() convert pitch meters to
  // canvas px; y measured up from the bottom touchline (canvas bottom
  // edge), x measured from the own goal line (0) to the attacking goal
  // line (105) — fixed FIFA proportions, 105 x 68.
  function pitchGeometry(w, h) {
    var s = w / 105; // px per meter
    var g = {
      s: s, w: w, h: h,
      LEN: 105, WID: 68,
      BOX_D: 16.5, BOX_W: 40.32, SIX_D: 5.5, SIX_W: 18.32,
      CIRCLE_R: 9.15, PEN_SPOT: 11, CORNER_R: 1, GOAL_W: 7.32
    };
    g.X = function (m) { return m * s; };
    g.Y = function (m) { return h - m * s; };
    g.boxYTop = g.WID / 2 + g.BOX_W / 2; // 54.16
    g.boxYBot = g.WID / 2 - g.BOX_W / 2; // 13.84
    g.sixYTop = g.WID / 2 + g.SIX_W / 2; // 43.16
    g.sixYBot = g.WID / 2 - g.SIX_W / 2; // 24.84
    return g;
  }

  // meter-space rect helper: appends a rect path for x in [x0,x1], y in [y0,y1]
  function rectM(ctx, g, x0, x1, y0, y1) {
    ctx.rect(g.X(x0), g.Y(y1), g.X(x1) - g.X(x0), g.Y(y0) - g.Y(y1));
  }

  // -- region path builders (each appends to the current path) --

  function pathBoxRight(ctx, g) { rectM(ctx, g, g.LEN - g.BOX_D, g.LEN, g.boxYBot, g.boxYTop); }
  function pathThirdDef(ctx, g) { rectM(ctx, g, 0, 35, 0, g.WID); }
  function pathThirdMidAtt(ctx, g) { rectM(ctx, g, 35, g.LEN, 0, g.WID); }
  function pathWideAttack(ctx, g) {
    rectM(ctx, g, 70, g.LEN, 0, g.boxYBot);
    rectM(ctx, g, 70, g.LEN, g.boxYTop, g.WID);
  }
  function pathRecoverBlock(ctx, g) { rectM(ctx, g, 3, 13, 26, 42); }

  function fillRegion(ctx, g, builders, rgb, t) {
    if (t <= 0.02) return;
    ctx.save();
    ctx.beginPath();
    builders.forEach(function (b) { b(ctx, g); });
    ctx.fillStyle = 'rgba(' + rgb + ',' + (t * ZONE_FILL_MAX).toFixed(3) + ')';
    ctx.fill('evenodd');
    ctx.restore();
  }

  // 45-degree engineering hatch clipped to a region — the defense layer.
  function hatchRegion(ctx, g, builders, rgb, t, mirror) {
    if (t <= 0.02) return;
    ctx.save();
    ctx.beginPath();
    builders.forEach(function (b) { b(ctx, g); });
    ctx.clip('evenodd');
    ctx.strokeStyle = 'rgba(' + rgb + ',' + (t * ZONE_HATCH_MAX).toFixed(3) + ')';
    ctx.lineWidth = Math.max(1, g.s * 0.14);
    var step = 2.5 * g.s;
    var span = g.w + g.h;
    ctx.beginPath();
    for (var d = -span; d <= span; d += step) {
      if (mirror) { // 135 degrees
        ctx.moveTo(d, 0);
        ctx.lineTo(d - span, span);
      } else {      // 45 degrees
        ctx.moveTo(d, 0);
        ctx.lineTo(d + span, span);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  // Data accents (validated against both the paper and dark surfaces):
  // orange = the Chimera / attack, blue = your guess / defense.
  var ORANGE_HEX = '#eb6834';
  var BLUE_HEX = '#2a78d6';
  var AMBER_RGB = '235,104,52';   // attack layer (orange)
  var BLUE_RGB = '42,120,214';    // defense layer (blue)
  var INK = '#f5f5f0';
  var MUTED = '#9db29e';

  function drawPitchLines(ctx, g) {
    ctx.save();
    ctx.strokeStyle = 'rgba(245,245,240,0.85)';
    ctx.lineWidth = Math.max(1, g.s * 0.09);

    // outer boundary
    ctx.strokeRect(0.5, 0.5, g.w - 1, g.h - 1);

    // halfway line
    ctx.beginPath();
    ctx.moveTo(g.X(g.LEN / 2), g.Y(0));
    ctx.lineTo(g.X(g.LEN / 2), g.Y(g.WID));
    ctx.stroke();

    // center circle + spot
    ctx.beginPath();
    ctx.arc(g.X(g.LEN / 2), g.Y(g.WID / 2), g.CIRCLE_R * g.s, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(g.X(g.LEN / 2), g.Y(g.WID / 2), 1.2 * g.s, 0, Math.PI * 2);
    ctx.fill();

    // thirds dividers (dashed, subtle)
    ctx.save();
    ctx.strokeStyle = 'rgba(245,245,240,0.35)';
    ctx.setLineDash([3, 4]);
    ctx.lineWidth = 1;
    [35, 70].forEach(function (m) {
      ctx.beginPath();
      ctx.moveTo(g.X(m), g.Y(0));
      ctx.lineTo(g.X(m), g.Y(g.WID));
      ctx.stroke();
    });
    ctx.restore();

    // both ends: penalty area, six-yard box, penalty arc, goal frame
    [0, g.LEN].forEach(function (goalX) {
      var isRight = goalX > 0;
      var boxX0 = isRight ? g.LEN - g.BOX_D : 0;
      var boxX1 = isRight ? g.LEN : g.BOX_D;
      var sixX0 = isRight ? g.LEN - g.SIX_D : 0;
      var sixX1 = isRight ? g.LEN : g.SIX_D;
      ctx.beginPath();
      ctx.rect(g.X(boxX0), g.Y(g.boxYTop), g.X(boxX1) - g.X(boxX0), g.Y(g.boxYBot) - g.Y(g.boxYTop));
      ctx.stroke();
      ctx.beginPath();
      ctx.rect(g.X(sixX0), g.Y(g.sixYTop), g.X(sixX1) - g.X(sixX0), g.Y(g.sixYBot) - g.Y(g.sixYTop));
      ctx.stroke();

      // penalty spot + arc (arc only outside the box)
      var spotX = isRight ? g.LEN - g.PEN_SPOT : g.PEN_SPOT;
      ctx.beginPath();
      ctx.arc(g.X(spotX), g.Y(g.WID / 2), 1 * g.s, 0, Math.PI * 2);
      ctx.fill();
      var edgeX = isRight ? g.LEN - g.BOX_D : g.BOX_D;
      var dx = (edgeX - spotX) * g.s;
      var halfAngle = Math.acos(Math.min(1, Math.abs(dx) / (g.CIRCLE_R * g.s)));
      ctx.beginPath();
      if (isRight) {
        ctx.arc(g.X(spotX), g.Y(g.WID / 2), g.CIRCLE_R * g.s, Math.PI - halfAngle, Math.PI + halfAngle);
      } else {
        ctx.arc(g.X(spotX), g.Y(g.WID / 2), g.CIRCLE_R * g.s, -halfAngle, halfAngle);
      }
      ctx.stroke();

      // goal frame: small rectangle jutting out from the goal line
      var goalDepth = 2 * g.s;
      var goalY0 = g.WID / 2 - g.GOAL_W / 2, goalY1 = g.WID / 2 + g.GOAL_W / 2;
      ctx.beginPath();
      if (isRight) {
        ctx.rect(g.X(g.LEN), g.Y(goalY1), goalDepth, g.Y(goalY0) - g.Y(goalY1));
      } else {
        ctx.rect(g.X(0) - goalDepth, g.Y(goalY1), goalDepth, g.Y(goalY0) - g.Y(goalY1));
      }
      ctx.stroke();
    });

    // corner arcs
    ctx.lineWidth = Math.max(0.75, g.s * 0.06);
    [[0, 0, 0, Math.PI / 2], [g.LEN, 0, Math.PI / 2, Math.PI],
     [0, g.WID, -Math.PI / 2, 0], [g.LEN, g.WID, Math.PI, Math.PI * 1.5]].forEach(function (c) {
      ctx.beginPath();
      ctx.arc(g.X(c[0]), g.Y(c[1]), g.CORNER_R * g.s, c[2], c[3]);
      ctx.stroke();
    });

    ctx.restore();
  }

  // Dimension callouts — the survey layer that makes it read as a diagram.
  function drawPitchDimensions(ctx, g) {
    ctx.save();
    ctx.fillStyle = MUTED;
    ctx.font = '600 ' + Math.max(6.5, 1.3 * g.s) + 'px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText("16.5m", g.X(g.LEN - g.BOX_D / 2), g.Y(g.boxYTop + 3.4));
    ctx.fillText("9.15m", g.X(g.LEN / 2 + 12), g.Y(g.WID / 2 + 11));
    ctx.fillText("105 × 68m", g.X(g.LEN / 2), g.Y(2.5));
    ctx.restore();
  }

  function zoneSigmaLabel(ctx, g, mx, my, name, z, rgbHex, minAbs) {
    if (typeof minAbs === 'number' && Math.abs(z) < minAbs) return;
    var px = g.X(mx), py = g.Y(my);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '600 ' + Math.max(6.5, 1.25 * g.s) + 'px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillStyle = MUTED;
    ctx.textBaseline = 'bottom';
    ctx.fillText(name, px, py - 1);
    ctx.font = '700 ' + Math.max(8, 1.6 * g.s) + 'px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillStyle = rgbHex || INK;
    ctx.textBaseline = 'top';
    ctx.fillText((z >= 0 ? '+' : '−') + Math.abs(z).toFixed(1) + 'σ', px, py + 1);
    ctx.restore();
  }

  function drawZones(ctx, g, offense, defense) {
    // ---- attack: region fills with hard boundaries ----
    fillRegion(ctx, g, [pathBoxRight], AMBER_RGB, zoneT(offense.box));
    fillRegion(ctx, g, [pathWideAttack], AMBER_RGB, zoneT(offense.wide) * 0.85);

    // ---- defense: 45-degree hatch layers ----
    hatchRegion(ctx, g, [pathThirdDef], BLUE_RGB, zoneT(defense.tackleInt), false);
    hatchRegion(ctx, g, [pathThirdMidAtt], BLUE_RGB, zoneT(defense.press) * 0.55, true);

    // ---- recoveries: block near the own six-yard box ----
    var BOX_T = zoneT(defense.recover);
    if (BOX_T > 0.02) {
      ctx.save();
      ctx.beginPath();
      pathRecoverBlock(ctx, g);
      ctx.fillStyle = 'rgba(' + BLUE_RGB + ',' + (BOX_T * ZONE_FILL_MAX + 0.04).toFixed(3) + ')';
      ctx.fill();
      ctx.strokeStyle = 'rgba(' + BLUE_RGB + ',0.9)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }

    // ---- creation: dashed arcs from midfield into the box, arrowheads ----
    var createT = zoneT(offense.create);
    if (createT > 0.05) {
      ctx.save();
      ctx.strokeStyle = 'rgba(' + AMBER_RGB + ',' + Math.min(1, createT + 0.2).toFixed(3) + ')';
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = Math.max(1, g.s * 0.16);
      ctx.setLineDash([4, 3]);
      var o = { x: 58, y: 44 };
      [{ x: 95, y: 22 }, { x: 95, y: 46 }, { x: 92, y: 34 }].forEach(function (t) {
        var dx = g.X(t.x) - g.X(o.x), dy = g.Y(t.y) - g.Y(o.y);
        var len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
        var hx = g.X(t.x) - ux * 4, hy = g.Y(t.y) - uy * 4;
        ctx.beginPath();
        ctx.moveTo(g.X(o.x), g.Y(o.y));
        ctx.lineTo(hx, hy);
        ctx.stroke();
        ctx.save();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(g.X(t.x), g.Y(t.y));
        ctx.lineTo(hx - uy * 2.4, hy + ux * 2.4);
        ctx.lineTo(hx + uy * 2.4, hy - ux * 2.4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      });
      ctx.restore();
    }

    // ---- carrying: straight advancing arrows through the middle third ----
    var carryT = zoneT(offense.carry);
    if (carryT > 0.05) {
      ctx.save();
      ctx.strokeStyle = 'rgba(' + AMBER_RGB + ',' + Math.min(1, carryT + 0.2).toFixed(3) + ')';
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = Math.max(1, g.s * 0.16);
      [{ x0: 22, y0: 14, x1: 82, y1: 14 }, { x0: 22, y0: 54, x1: 82, y1: 54 }].forEach(function (line) {
        var dx = g.X(line.x1) - g.X(line.x0), dy = g.Y(line.y1) - g.Y(line.y0);
        var len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
        var hx = g.X(line.x1) - ux * 4, hy = g.Y(line.y1) - uy * 4;
        ctx.beginPath();
        ctx.moveTo(g.X(line.x0), g.Y(line.y0));
        ctx.lineTo(hx, hy);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(g.X(line.x1), g.Y(line.y1));
        ctx.lineTo(hx - uy * 2.4, hy + ux * 2.4);
        ctx.lineTo(hx + uy * 2.4, hy - ux * 2.4);
        ctx.closePath();
        ctx.fill();
      });
      ctx.restore();
    }
  }

  function drawZoneLabels(ctx, g, offense, defense) {
    zoneSigmaLabel(ctx, g, g.LEN - g.BOX_D / 2, g.WID / 2, 'BOX', offense.box, INK);
    zoneSigmaLabel(ctx, g, 58, 47, 'CREATE', offense.create, INK, 0.3);
    zoneSigmaLabel(ctx, g, 88, 8, 'WIDE', offense.wide, INK, 0.3);
    zoneSigmaLabel(ctx, g, 52, 11, 'CARRY', offense.carry, INK, 0.3);
    zoneSigmaLabel(ctx, g, 58, 62, 'PRESS', defense.press, BLUE_HEX, 0.35);
    zoneSigmaLabel(ctx, g, 17, 62, 'TACKLE', defense.tackleInt, BLUE_HEX, 0.35);
    zoneSigmaLabel(ctx, g, 8, 50, 'RECOVER', defense.recover, BLUE_HEX, 0.35);
  }

  function renderPitch(canvas, vector) {
    var ctx = canvas.getContext('2d');
    // crisp text on high-dpi screens
    var dpr = window.devicePixelRatio || 1;
    var wCss = 315, hCss = 204; // exact 105:68 ratio at 3px/m
    if (canvas.width !== Math.round(wCss * dpr)) {
      canvas.width = Math.round(wCss * dpr);
      canvas.height = Math.round(hCss * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, wCss, hCss);
    ctx.save();
    ctx.fillStyle = '#0d1f13';
    ctx.fillRect(0, 0, wCss, hCss);
    ctx.restore();
    var g = pitchGeometry(wCss, hCss);
    var zones = zoneRaw(vector);
    drawZones(ctx, g, zones, zones);
    drawPitchLines(ctx, g);
    drawPitchDimensions(ctx, g);
    drawZoneLabels(ctx, g, zones, zones);
    return zones;
  }

  // ---------------------------------------------------------------------
  // Dimensional breakdown: diverging two-series bar chart (SVG)
  // 16 labeled rows, x = sigmas vs tournament, zero baseline, hairline grid.
  // ---------------------------------------------------------------------

  var SVG_NS = 'http://www.w3.org/2000/svg';

  function svgEl(tag, attrs, parent) {
    var el = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  }

  function renderBreakdown(targetVector, guessVector, guessName) {
    var host = els.breakdownChart;
    host.innerHTML = '';

    var DIMS = targetVector.length; // 16
    var W = 640, LEFT = 170, RIGHT = 20, TOP = 22;
    var ROW = 26, SEP = 18, BOT = 8;
    var H = TOP + DIMS * ROW + SEP + BOT;
    var plotW = W - LEFT - RIGHT;
    var XMIN = -4, XMAX = 4;

    function xOf(v) {
      if (v < XMIN) v = XMIN;
      if (v > XMAX) v = XMAX;
      return LEFT + (v - XMIN) / (XMAX - XMIN) * plotW;
    }

    var svg = svgEl('svg', {
      viewBox: '0 0 ' + W + ' ' + H,
      'font-family': getComputedStyle(document.body).fontFamily
    }, host);

    // find the biggest-gap dimensions for selective direct labels
    var gaps = [];
    for (var gi = 0; gi < DIMS; gi++) {
      gaps.push({ i: gi, g: Math.abs(targetVector[gi] - guessVector[gi]) });
    }
    gaps.sort(function (a, b) { return b.g - a.g; });
    var labelRows = {};
    labelRows[gaps[0].i] = true;
    labelRows[gaps[1].i] = true;
    labelRows[gaps[2].i] = true;

    function rowY(i) {
      return TOP + i * ROW + (i >= A_COUNT ? SEP : 0);
    }

    // gridlines each sigma; labels every 2
    for (var t = XMIN; t <= XMAX; t++) {
      var gx = xOf(t);
      svgEl('line', {
        x1: gx, y1: TOP - 4, x2: gx, y2: H - BOT,
        stroke: t === 0 ? '#f5f5f0' : '#2a3a2e',
        'stroke-width': t === 0 ? 1.5 : 1
      }, svg);
      if (t % 2 === 0) {
        var tl = svgEl('text', {
          x: gx, y: TOP - 9, 'text-anchor': 'middle',
          'font-size': 10, fill: '#9db29e'
        }, svg);
        tl.textContent = (t > 0 ? '+' : '') + t + 'σ';
      }
    }

    // half separator label between the two 8-dim blocks
    var sepY = TOP + A_COUNT * ROW + SEP / 2;
    svgEl('line', {
      x1: 8, y1: sepY, x2: W - 8, y2: sepY,
      stroke: '#2a3a2e', 'stroke-width': 1, 'stroke-dasharray': '4 4'
    }, svg);
    var sepText = svgEl('text', {
      x: LEFT, y: sepY - 4, 'font-size': 9, fill: '#9db29e',
      'text-anchor': 'start', 'letter-spacing': '0.08em'
    }, svg);
    sepText.textContent = 'ATTACKING-OUTPUT HALF ABOVE · DUEL / DEFENSIVE HALF BELOW';

    var BAR_H = 6, BAR_GAP = 2;

    function bar(y, v, color, title) {
      var x0 = xOf(0), x1 = xOf(v);
      var g = svgEl('g', {}, svg);
      svgEl('rect', {
        x: Math.min(x0, x1), y: y,
        width: Math.max(1, Math.abs(x1 - x0)), height: BAR_H,
        rx: 2, fill: color
      }, g);
      var titleEl = document.createElementNS(SVG_NS, 'title');
      titleEl.textContent = title;
      g.appendChild(titleEl);
      svgEl('rect', {
        x: LEFT, y: y - 2, width: plotW, height: BAR_H + 4,
        fill: 'transparent'
      }, g);
      return g;
    }

    for (var i = 0; i < DIMS; i++) {
      var y = rowY(i);
      var label = DATA.featureLabels[DATA.features[i]];
      var tv = targetVector[i], gv = guessVector[i];

      var lt = svgEl('text', {
        x: LEFT - 8, y: y + BAR_H + BAR_GAP / 2 + 1,
        'text-anchor': 'end', 'font-size': 11, fill: '#c3cec4'
      }, svg);
      lt.textContent = label;

      bar(y, tv, ORANGE_HEX, 'Chimera · ' + label + ': ' +
        (tv >= 0 ? '+' : '') + tv.toFixed(1) + 'σ');
      bar(y + BAR_H + BAR_GAP, gv, BLUE_HEX, (guessName || 'Your guess') +
        ' · ' + label + ': ' + (gv >= 0 ? '+' : '') + gv.toFixed(1) + 'σ');

      if (labelRows[i]) {
        var vt = svgEl('text', {
          x: xOf(tv) + (tv >= 0 ? 4 : -4), y: y + BAR_H - 1,
          'text-anchor': tv >= 0 ? 'start' : 'end',
          'font-size': 9, fill: '#f5f5f0', 'font-weight': 700
        }, svg);
        vt.textContent = (tv >= 0 ? '+' : '') + tv.toFixed(1);
        var vg = svgEl('text', {
          x: xOf(gv) + (gv >= 0 ? 4 : -4), y: y + 2 * BAR_H + BAR_GAP,
          'text-anchor': gv >= 0 ? 'start' : 'end',
          'font-size': 9, fill: '#f5f5f0', 'font-weight': 700
        }, svg);
        vg.textContent = (gv >= 0 ? '+' : '') + gv.toFixed(1);
      }
    }
  }

  // ---------------------------------------------------------------------
  // Chimera mode: guessing + feedback
  // ---------------------------------------------------------------------

  function pctColorClass(sim) {
    if (sim >= 0.85) return 'vp-guess__pct--hot';
    if (sim >= 0.60) return 'vp-guess__pct--warm';
    return 'vp-guess__pct--cold';
  }

  function coachingLine(targetVector, guessVector) {
    var diffs = [];
    for (var i = 0; i < targetVector.length; i++) {
      diffs.push({ i: i, d: targetVector[i] - guessVector[i] });
    }
    diffs.sort(function (a, b) { return Math.abs(b.d) - Math.abs(a.d); });
    var top3 = diffs.slice(0, 3);
    var parts = top3.map(function (entry) {
      var label = DATA.featureLabels[DATA.features[entry.i]];
      var mag = Math.abs(entry.d).toFixed(1);
      return entry.d > 0
        ? 'more ' + label + ' (+' + mag + 'σ)'
        : 'less ' + label + ' (−' + mag + 'σ)';
    });
    return 'You need ' + parts.join(', ') + '.';
  }

  function coachingLineTop1(targetVector, guessVector) {
    var diffs = [];
    for (var i = 0; i < targetVector.length; i++) {
      diffs.push({ i: i, d: targetVector[i] - guessVector[i] });
    }
    diffs.sort(function (a, b) { return Math.abs(b.d) - Math.abs(a.d); });
    var top = diffs[0];
    var label = DATA.featureLabels[DATA.features[top.i]];
    var mag = Math.abs(top.d).toFixed(1);
    return 'Biggest gap: ' + (top.d > 0
      ? 'more ' + label + ' (+' + mag + 'σ).'
      : 'less ' + label + ' (−' + mag + 'σ).');
  }

  function clusterLine(guessPlayer) {
    var guessCluster = DATA.clusters[guessPlayer.c];
    var targetCluster = DATA.clusters[TARGET.clusterIdx];
    if (guessPlayer.c === TARGET.clusterIdx) {
      return "You're already in the Chimera's home archetype: <b>" + targetCluster + '</b>.';
    }
    return "You're in <b>" + guessCluster + '</b>; the Chimera lives in <b>' + targetCluster + '</b>.';
  }

  function isWinningGuess(guessPlayer, sim) {
    if (sim >= WIN_SIMILARITY) return true;
    if (guessPlayer.name === TARGET.a.name && guessPlayer.season === TARGET.a.season) return true;
    if (guessPlayer.name === TARGET.b.name && guessPlayer.season === TARGET.b.season) return true;
    return false;
  }

  function renderGuessRow(entry, idx) {
    var li = document.createElement('li');
    li.className = 'vp-guess';
    var pctClass = pctColorClass(entry.sim);
    var pct = Math.round(entry.sim * 100);
    li.innerHTML =
      '<div class="vp-guess__head">' +
        '<span class="vp-guess__num">' + (idx + 1) + '</span>' +
        '<span class="vp-guess__name">' + entry.name + '</span>' +
        '<span class="vp-guess__pct ' + pctClass + '">' + pct + '%</span>' +
      '</div>';
    return li;
  }

  function renderWarmth(rec) {
    if (rec.guesses.length === 0) {
      els.warmthCard.hidden = true;
      return;
    }
    els.warmthCard.hidden = false;

    var bestIdx = 0, bestSim = -Infinity;
    rec.guesses.forEach(function (g, i) {
      if (g.sim > bestSim) { bestSim = g.sim; bestIdx = i; }
    });
    var lastIdx = rec.guesses.length - 1;
    var lastIsNewBest = lastIdx === bestIdx;

    els.warmthBars.innerHTML = '';
    rec.guesses.forEach(function (g, i) {
      var bar = document.createElement('div');
      bar.className = 'vp-warmth__bar';
      var pct = Math.max(0, Math.round(g.sim * 100));
      bar.style.height = Math.max(3, Math.round(pct * 0.4)) + 'px';
      if (i === lastIdx && lastIsNewBest) bar.classList.add('is-best');
      bar.title = g.name + ': ' + pct + '%';
      els.warmthBars.appendChild(bar);
    });

    var bestEntry = rec.guesses[bestIdx];
    els.warmthClosest.textContent = 'Closest: ' + bestEntry.name + ' — ' +
      Math.round(bestEntry.sim * 100) + '%';
  }

  function renderPositionHint(rec) {
    if (!els.posHintCard) return;
    if (rec.guesses.length < POSITION_HINT_AT_GUESS) {
      els.posHintCard.hidden = true;
      return;
    }
    els.posHintCard.hidden = false;
    els.posHintValue.textContent = TARGET.posHint;
  }

  function renderGuesses() {
    var rec = todayRecord();
    els.guessList.innerHTML = '';
    rec.guesses.forEach(function (entry, idx) {
      els.guessList.appendChild(renderGuessRow(entry, idx));
    });
    var left = Math.max(0, MAX_GUESSES - rec.guesses.length);
    els.guessesLeftNum.textContent = String(left);

    renderWarmth(rec);
    renderPositionHint(rec);

    if (rec.guesses.length > 0) {
      var last = rec.guesses[rec.guesses.length - 1];
      var lastPlayer = DATA.players[last.id];
      els.resultCard.hidden = false;
      els.scoreboardPct.textContent = Math.round(last.sim * 100) + '%';

      var targetZones = renderPitch(els.pitchTarget, TARGET.vector);
      var guessZones = renderPitch(els.pitchGuess, lastPlayer.v);
      els.pitchGuessLabel.textContent = 'Your guess: ' + last.name;
      els.storyCaption.textContent = storyCaption(targetZones, guessZones);
      els.quickCoachingLine.textContent = coachingLineTop1(TARGET.vector, lastPlayer.v);
      renderBreakdown(TARGET.vector, lastPlayer.v, last.name);
      els.clusterLine.innerHTML = clusterLine(lastPlayer);
      els.coachingLine.textContent = coachingLine(TARGET.vector, lastPlayer.v);
    }

    if (rec.done) {
      showReveal(rec);
      lockInput();
    }
  }

  function lockInput() {
    els.chimeraInput.disabled = true;
    els.chimeraSubmit.disabled = true;
  }

  function shareEmojiRow(sim) {
    if (sim >= 0.85) return '🟩'; // green
    if (sim >= 0.60) return '🟨'; // yellow
    return '🟥'; // red
  }

  function buildShareText(rec) {
    var n = puzzleNumber(TODAY);
    var rows = rec.guesses.map(function (g) { return shareEmojiRow(g.sim); }).join('');
    var scoreLabel = rec.won ? String(rec.guesses.length) : 'X';
    return 'Vector Pitch #' + n + ' ' + scoreLabel + '/' + MAX_GUESSES + '\n' + rows;
  }

  function showReveal(rec) {
    els.revealCard.hidden = false;
    els.revealTitle.textContent = rec.won ? 'Solved' : 'The Chimera';
    els.revealBody.innerHTML =
      'Fused from <b>' + playerKey(TARGET.a) + '</b> (' + traitList([0, 1, 2, 3, 4, 5, 6, 7]).join(', ') + ') and <b>' +
      playerKey(TARGET.b) + '</b> (' + traitList([8, 9, 10, 11, 12, 13, 14, 15]).join(', ') + ').';
    els.shareCopied.hidden = true;
  }

  function submitGuess() {
    var p = pendingChimeraSelection;
    if (!p) return;
    var rec = todayRecord();
    if (rec.done || rec.guesses.length >= MAX_GUESSES) return;

    var sim = cosineSim(TARGET.vector, p.v);
    var entry = {
      id: p.id,
      name: playerKey(p),
      sim: sim
    };
    rec.guesses.push(entry);
    track('vp-guess', rec.guesses.length);

    var won = isWinningGuess(p, sim);
    if (won || rec.guesses.length >= MAX_GUESSES) {
      registerCompletion(won);
    } else {
      saveState();
    }

    pendingChimeraSelection = null;
    els.chimeraInput.value = '';
    els.chimeraSubmit.disabled = true;
    renderGuesses();
    renderMapOnce();
  }

  var pendingChimeraSelection = null;

  // ---------------------------------------------------------------------
  // 3D starfield map: manual perspective projection, no libraries
  // ---------------------------------------------------------------------

  // 8 cluster hues, fixed order (reused from Vector Hoops — validated,
  // CVD-checked palette).
  var PALETTE = ['#3987e5', '#199e70', '#c98500', '#008300', '#9085e9',
                 '#e66767', '#d55181', '#d95926'];

  // 3 position hues (DEF MID FWD), subset of Vector Hoops' validated
  // 5-hue position palette — kept maximally spread (blue / green / red).
  var POS_COLOR = { DEF: '#3987e5', MID: '#199e70', FWD: '#e66767' };
  var mapColorMode = 'pos'; // 'pos' | 'cluster'

  function playerColor(p) {
    if (mapColorMode === 'pos') return POS_COLOR[p.pos] || '#6f6e69';
    return PALETTE[p.c % PALETTE.length];
  }

  // Project any 16-dim vector into map space via the affine PCA map the
  // pipeline embeds (proj.W 16x3, proj.b 3), when present. This dataset
  // does not ship `proj`, so this always falls through to the cluster
  // centroid fallback in renderMap() below — stated here, not hidden.
  function projectVector(v) {
    if (!DATA.proj) return null;
    var W = DATA.proj.W, b = DATA.proj.b;
    var dims = v.length;
    var out = [b[0], b[1], b[2]];
    for (var i = 0; i < dims; i++) {
      out[0] += v[i] * W[i][0];
      out[1] += v[i] * W[i][1];
      out[2] += v[i] * W[i][2];
    }
    for (var d = 0; d < 3; d++) out[d] = Math.max(0, Math.min(1, out[d]));
    return { x: out[0], y: out[1], z: out[2] };
  }

  var PREFERS_REDUCED_MOTION = false;
  try {
    PREFERS_REDUCED_MOTION = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) { PREFERS_REDUCED_MOTION = false; }

  var mapCam = {
    yaw: 0.6,
    pitch: 0.28,
    zoom: 1,
    focal: 2.6,
    autoRotate: !PREFERS_REDUCED_MOTION,
    dragging: false,
    lastX: 0,
    lastY: 0,
    pinchDist: null,
    rafId: null
  };

  function resizeSquareCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    var w = Math.max(rect.width, 240);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(w * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, size: w };
  }

  function project3D(x, y, z, size, cam) {
    // center to [-1, 1]-ish cube
    var px = (x - 0.5) * 2;
    var py = (y - 0.5) * 2;
    var pz = (z - 0.5) * 2;

    // rotate around Y (yaw)
    var cosY = Math.cos(cam.yaw), sinY = Math.sin(cam.yaw);
    var x1 = px * cosY + pz * sinY;
    var z1 = -px * sinY + pz * cosY;

    // rotate around X (pitch)
    var cosX = Math.cos(cam.pitch), sinX = Math.sin(cam.pitch);
    var y2 = py * cosX - z1 * sinX;
    var z2 = py * sinX + z1 * cosX;

    var focal = cam.focal / cam.zoom;
    var zc = z2 + focal;
    if (zc < 0.2) zc = 0.2;
    var scale = focal / zc;

    var half = size / 2;
    return {
      sx: half + x1 * scale * half * 0.85,
      sy: half - y2 * scale * half * 0.85,
      scale: scale,
      depth: zc
    };
  }

  // Wireframe axis cube: the unit PCA box, so the starfield reads as a
  // graph with visible dimensions rather than a free-floating cloud.
  var CUBE_CORNERS = [
    [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
    [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]
  ];
  var CUBE_EDGES = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7]
  ];

  function drawAxisCube(ctx, size) {
    var pts = CUBE_CORNERS.map(function (c) {
      return project3D(c[0], c[1], c[2], size, mapCam);
    });
    ctx.save();
    ctx.strokeStyle = 'rgba(157,178,158,0.30)';
    ctx.lineWidth = 1;
    CUBE_EDGES.forEach(function (e) {
      ctx.beginPath();
      ctx.moveTo(pts[e[0]].sx, pts[e[0]].sy);
      ctx.lineTo(pts[e[1]].sx, pts[e[1]].sy);
      ctx.stroke();
    });
    ctx.strokeStyle = 'rgba(157,178,158,0.45)';
    [[1, 0, 0], [0, 1, 0], [0, 0, 1]].forEach(function (axis) {
      for (var t = 0.25; t < 1; t += 0.25) {
        var p = project3D(axis[0] * t, axis[1] * t, axis[2] * t, size, mapCam);
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, 1.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
    // axis labels just past the +1 corner of each axis — labeled honestly
    // as bare principal components since this dataset carries no `axes`
    // metadata to translate them into soccer-specific meaning.
    ctx.fillStyle = 'rgba(230,232,225,0.9)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var ends = [
      project3D(1.1, 0, 0, size, mapCam),
      project3D(0, 1.12, 0, size, mapCam),
      project3D(0, 0, 1.1, size, mapCam)
    ];
    var fam = getComputedStyle(document.body).fontFamily;
    for (var ai = 0; ai < 3; ai++) {
      ctx.font = '700 11px ' + fam;
      ctx.fillText('PC' + (ai + 1), ends[ai].sx, ends[ai].sy - 6);
    }
    ctx.restore();
  }

  // Distinct target marker: an orange diamond crosshair at the Chimera's
  // exact projected position — this is the point you are guessing toward.
  function drawTargetMarker(ctx, size, xyz, label) {
    var pr = project3D(xyz.x, xyz.y, xyz.z, size, mapCam);
    var r = Math.max(7, 10 * pr.scale);
    ctx.save();
    ctx.strokeStyle = ORANGE_HEX;
    ctx.fillStyle = ORANGE_HEX;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pr.sx, pr.sy - r);
    ctx.lineTo(pr.sx + r, pr.sy);
    ctx.lineTo(pr.sx, pr.sy + r);
    ctx.lineTo(pr.sx - r, pr.sy);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pr.sx - r - 6, pr.sy); ctx.lineTo(pr.sx - r - 1, pr.sy);
    ctx.moveTo(pr.sx + r + 1, pr.sy); ctx.lineTo(pr.sx + r + 6, pr.sy);
    ctx.moveTo(pr.sx, pr.sy - r - 6); ctx.lineTo(pr.sx, pr.sy - r - 1);
    ctx.moveTo(pr.sx, pr.sy + r + 1); ctx.lineTo(pr.sx, pr.sy + r + 6);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(pr.sx, pr.sy, 2.2, 0, Math.PI * 2);
    ctx.fill();
    if (label) {
      ctx.font = '700 10px ' + getComputedStyle(document.body).fontFamily;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(label, pr.sx, pr.sy - r - 8);
    }
    ctx.restore();
    return pr;
  }

  function renderMap() {
    if (!DATA) return;
    var canvas = els.map;
    var r = resizeSquareCanvas(canvas);
    var ctx = r.ctx, size = r.size;

    ctx.clearRect(0, 0, size, size);
    drawAxisCube(ctx, size);

    var players = DATA.players;
    var projected = new Array(players.length);
    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      var proj = project3D(p.x, p.y, p.z, size, mapCam);
      projected[i] = proj;
    }

    var order = players.map(function (_, i) { return i; });
    order.sort(function (a, b) { return projected[b].depth - projected[a].depth; });

    var maxDepth = mapCam.focal * 2.2;
    for (var oi = 0; oi < order.length; oi++) {
      var idx = order[oi];
      var pl = players[idx];
      var pr = projected[idx];
      var depthT = Math.max(0, Math.min(1, pr.depth / maxDepth));
      var alpha = 0.55 * (1 - depthT) + 0.05;
      var radius = Math.max(0.6, 2.4 * pr.scale);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = playerColor(pl);
      ctx.beginPath();
      ctx.arc(pr.sx, pr.sy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    var rec = todayRecord();

    // the Chimera itself: exact projection of the fused vector when this
    // dataset ships a `proj` matrix; otherwise the home-cluster centroid.
    var chimeraXYZ = projectVector(TARGET.vector) || CLUSTER_XYZ[TARGET.clusterIdx];
    drawTargetMarker(ctx, size, chimeraXYZ, 'CHIMERA');

    if (rec.done) {
      [TARGET.a, TARGET.b].forEach(function (pl, ci) {
        var pr = project3D(pl.x, pl.y, pl.z, size, mapCam);
        ctx.fillStyle = '#0d1f13';
        ctx.strokeStyle = ORANGE_HEX;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pr.sx, pr.sy, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = ORANGE_HEX;
        ctx.font = 'bold 10px ' + getComputedStyle(document.body).fontFamily;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(ci === 0 ? 'A' : 'B', pr.sx, pr.sy + 1);
      });
    }

    rec.guesses.forEach(function (entry, gi) {
      var pl = players[entry.id];
      if (!pl) return;
      var pr = project3D(pl.x, pl.y, pl.z, size, mapCam);
      ctx.fillStyle = '#f5f5f0';
      ctx.strokeStyle = BLUE_HEX;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pr.sx, pr.sy, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#111111';
      ctx.font = 'bold 10px ' + getComputedStyle(document.body).fontFamily;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(gi + 1), pr.sx, pr.sy + 1);
    });
  }

  var POS_LABEL = { DEF: 'Defender', MID: 'Midfielder', FWD: 'Forward' };

  function renderMapLegend() {
    var entries;
    if (mapColorMode === 'pos') {
      entries = ['DEF', 'MID', 'FWD'].map(function (pos) {
        return { color: POS_COLOR[pos], name: pos + ' · ' + POS_LABEL[pos] };
      });
    } else {
      entries = DATA.clusters.map(function (name, idx) {
        return { color: PALETTE[idx % PALETTE.length], name: name };
      });
    }
    els.mapLegend.innerHTML = entries.map(function (e) {
      return '<span><span class="vp-legend-dot" style="background:' + e.color + '"></span>' + e.name + '</span>';
    }).join('');
  }

  function renderMapAxesInfo() {
    if (!els.mapAxes) return;
    els.mapAxes.textContent = 'PC1 / PC2 / PC3 of the tournament-normalized stat space';
  }

  function mapLoop() {
    if (!mapCam.autoRotate || mapCam.dragging) {
      mapCam.rafId = null;
      return;
    }
    mapCam.yaw += 0.0028;
    renderMap();
    mapCam.rafId = requestAnimationFrame(mapLoop);
  }

  function startMapLoopIfNeeded() {
    if (mapCam.rafId != null) return;
    if (mapCam.autoRotate && !mapCam.dragging) {
      mapCam.rafId = requestAnimationFrame(mapLoop);
    }
  }

  function renderMapOnce() {
    renderMap();
  }

  function setupMapInteraction() {
    var canvas = els.map;

    canvas.addEventListener('pointerdown', function (ev) {
      mapCam.dragging = true;
      mapCam.lastX = ev.clientX;
      mapCam.lastY = ev.clientY;
      try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* noop */ }
    });

    canvas.addEventListener('pointermove', function (ev) {
      if (!mapCam.dragging) return;
      var dx = ev.clientX - mapCam.lastX;
      var dy = ev.clientY - mapCam.lastY;
      mapCam.lastX = ev.clientX;
      mapCam.lastY = ev.clientY;
      mapCam.yaw += dx * 0.008;
      mapCam.pitch += dy * 0.008;
      mapCam.pitch = Math.max(-1.2, Math.min(1.2, mapCam.pitch));
      renderMap();
    });

    function endDrag() {
      if (!mapCam.dragging) return;
      mapCam.dragging = false;
      startMapLoopIfNeeded();
    }
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('pointerleave', function () {
      if (mapCam.dragging) endDrag();
    });

    canvas.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      var factor = Math.exp(-ev.deltaY * 0.001);
      mapCam.zoom = Math.max(0.5, Math.min(3.5, mapCam.zoom * factor));
      renderMap();
    }, { passive: false });

    canvas.addEventListener('touchmove', function (ev) {
      if (ev.touches.length !== 2) return;
      ev.preventDefault();
      var t0 = ev.touches[0], t1 = ev.touches[1];
      var d = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      if (mapCam.pinchDist != null) {
        var factor = d / mapCam.pinchDist;
        mapCam.zoom = Math.max(0.5, Math.min(3.5, mapCam.zoom * factor));
        renderMap();
      }
      mapCam.pinchDist = d;
    }, { passive: false });
    canvas.addEventListener('touchend', function (ev) {
      if (ev.touches.length < 2) mapCam.pinchDist = null;
    });

    els.mapPauseBtn.addEventListener('click', function () {
      mapCam.autoRotate = !mapCam.autoRotate;
      els.mapPauseBtn.textContent = mapCam.autoRotate ? 'Pause' : 'Resume';
      if (mapCam.autoRotate) startMapLoopIfNeeded();
    });
    els.mapPauseBtn.textContent = mapCam.autoRotate ? 'Pause' : 'Resume';

    if (els.mapColorBtn) {
      els.mapColorBtn.addEventListener('click', function () {
        mapColorMode = mapColorMode === 'pos' ? 'cluster' : 'pos';
        els.mapColorBtn.textContent = mapColorMode === 'pos' ? 'Color: position' : 'Color: archetype';
        renderMapLegend();
        renderMap();
      });
      els.mapColorBtn.textContent = mapColorMode === 'pos' ? 'Color: position' : 'Color: archetype';
    }

    window.addEventListener('resize', function () {
      renderMap();
    });

    els.mapDetails.addEventListener('toggle', function () {
      if (els.mapDetails.open) {
        renderMap();
        startMapLoopIfNeeded();
      } else if (mapCam.rafId != null) {
        cancelAnimationFrame(mapCam.rafId);
        mapCam.rafId = null;
      }
    });
  }

  // ---------------------------------------------------------------------
  // Share button
  // ---------------------------------------------------------------------

  function setupShare() {
    els.shareBtn.addEventListener('click', function () {
      var rec = todayRecord();
      var text = buildShareText(rec);
      var shared = false;
      if (navigator.share) {
        navigator.share({ text: text }).catch(function () {});
        shared = true;
      }
      if (!shared && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          els.shareCopied.hidden = false;
        }).catch(function () {});
      } else if (!shared) {
        els.shareCopied.hidden = false;
      }
      track('vp-share');
    });
  }

  // ---------------------------------------------------------------------
  // Full scouting report expander: persisted open/closed per browser session
  // ---------------------------------------------------------------------

  function setupFullReportPersistence() {
    var open = false;
    try { open = sessionStorage.getItem(SS_KEY_FULLREPORT) === '1'; } catch (e) { open = false; }
    els.fullReport.open = open;
    els.fullReport.addEventListener('toggle', function () {
      try {
        sessionStorage.setItem(SS_KEY_FULLREPORT, els.fullReport.open ? '1' : '0');
      } catch (e) { /* storage unavailable */ }
    });
  }

  // ---------------------------------------------------------------------
  // How-to-play modal
  // ---------------------------------------------------------------------

  function openHelp() {
    els.helpBackdrop.hidden = false;
  }
  function closeHelp() {
    els.helpBackdrop.hidden = true;
  }

  function setupHelp() {
    els.helpBtn.addEventListener('click', openHelp);
    els.helpClose.addEventListener('click', closeHelp);
    els.helpBackdrop.addEventListener('click', function (ev) {
      if (ev.target === els.helpBackdrop) closeHelp();
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && !els.helpBackdrop.hidden) closeHelp();
    });
  }

  // ---------------------------------------------------------------------
  // Footer — attribution is required and must be verbatim + linked.
  // ---------------------------------------------------------------------

  function renderFooter() {
    var range = DATA.seasons.join(' + ');
    var attributionHtml = String(DATA.attribution || '')
      .replace('statsbomb.com', '<a href="https://statsbomb.com">statsbomb.com</a>');
    els.footer.innerHTML =
      'Vectors: ' + DATA.normalization + ' · ' + range + ' · built ' + DATA.built +
      ' · no tracking<br>' + attributionHtml;
  }

  // ---------------------------------------------------------------------
  // DOM wiring
  // ---------------------------------------------------------------------

  function initDom() {
    els.puzzleNumber = document.getElementById('puzzle-number');
    els.puzzleDay = document.getElementById('puzzle-day');
    els.promptText = document.getElementById('prompt-text');
    els.chimeraInput = document.getElementById('chimera-input');
    els.chimeraSuggestions = document.getElementById('chimera-suggestions');
    els.chimeraSubmit = document.getElementById('chimera-submit');
    els.guessesLeftNum = document.getElementById('guesses-left-num');
    els.resultCard = document.getElementById('result-card');
    els.scoreboardPct = document.getElementById('scoreboard-pct');
    els.pitchTarget = document.getElementById('pitch-target');
    els.pitchGuess = document.getElementById('pitch-guess');
    els.pitchGuessLabel = document.getElementById('pitch-guess-label');
    els.storyCaption = document.getElementById('story-caption');
    els.breakdownChart = document.getElementById('breakdown-chart');
    els.clusterLine = document.getElementById('cluster-line');
    els.coachingLine = document.getElementById('coaching-line');
    els.guessList = document.getElementById('guess-list');
    els.revealCard = document.getElementById('reveal-card');
    els.revealTitle = document.getElementById('reveal-title');
    els.revealBody = document.getElementById('reveal-body');
    els.shareBtn = document.getElementById('share-btn');
    els.shareCopied = document.getElementById('share-copied');
    els.map = document.getElementById('pitch-map');
    els.mapLegend = document.getElementById('map-legend');
    els.mapPauseBtn = document.getElementById('map-pause-btn');
    els.mapColorBtn = document.getElementById('map-color-btn');
    els.mapAxes = document.getElementById('map-axes');
    els.mapDetails = document.getElementById('map-details');
    els.streakNum = document.getElementById('streak-num');
    els.helpBtn = document.getElementById('help-btn');
    els.helpBackdrop = document.getElementById('help-backdrop');
    els.helpClose = document.getElementById('help-close');
    els.loadingBanner = document.getElementById('loading-banner');
    els.errorBanner = document.getElementById('error-banner');
    els.footer = document.getElementById('footer');

    els.scoutingLine = document.getElementById('scouting-line');
    els.warmthCard = document.getElementById('warmth-card');
    els.warmthBars = document.getElementById('warmth-bars');
    els.warmthClosest = document.getElementById('warmth-closest');
    els.quickCoachingLine = document.getElementById('quick-coaching-line');
    els.fullReport = document.getElementById('full-report');
    els.posHintCard = document.getElementById('pos-hint-card');
    els.posHintValue = document.getElementById('pos-hint-value');
  }

  function setupChimeraInputs() {
    createAutocomplete(els.chimeraInput, els.chimeraSuggestions, DATA.players, function (p) {
      pendingChimeraSelection = p;
      els.chimeraSubmit.disabled = false;
    });
    els.chimeraInput.addEventListener('input', function () {
      pendingChimeraSelection = null;
      els.chimeraSubmit.disabled = true;
    });
    els.chimeraSubmit.addEventListener('click', submitGuess);
    els.chimeraInput.disabled = false;
  }

  function resumeChimeraIfDone() {
    var rec = todayRecord();
    if (rec.done) lockInput();
  }

  // ---------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------

  function init() {
    initDom();
    setupHelp();
    fetch(DATA_URL)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (json) {
        DATA = json;
        var k = DATA.clusters.length;
        var dims = DATA.features.length;
        CENTROIDS = computeCentroids(DATA.players, k, dims);
        CLUSTER_XYZ = computeClusterXYZ(DATA.players, k);
        TARGET = buildDailyTarget();
        STATE = loadState();

        els.loadingBanner.hidden = true;
        renderPrompt();
        renderScoutingLine();
        renderFooter();
        renderStreak();
        renderMapLegend();
        renderMapAxesInfo();
        setupChimeraInputs();
        setupShare();
        setupMapInteraction();
        setupFullReportPersistence();
        renderGuesses();
        resumeChimeraIfDone();
        renderMap();
        startMapLoopIfNeeded();

        if (todayRecord().guesses.length === 0 && !todayRecord().done) {
          openHelp();
          track('vp-start');
        }
      })
      .catch(function (err) {
        els.loadingBanner.hidden = true;
        els.errorBanner.hidden = false;
        els.errorBanner.textContent = 'Could not load vectors.json (' + err.message + '). Is assets/vectors.json built yet?';
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
