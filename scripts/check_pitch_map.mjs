// Run the page's real load->transform->centroid path against the actual JSON files, outside
// a browser, and check every numeric claim the page's prose makes.
//
//   node scripts/check_pitch_map.mjs
//
// Do NOT pipe it. A pipe has eaten the exit code three times in this project's ledger.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..');
const readPub = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'public', f), 'utf-8'));

let fails = 0;
const ok = (cond, msg) => {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + msg);
  if (!cond) fails++;
};

const map = readPub('assets/pitch_map.json');
const ros = readPub('assets/pitch_roster.json');
const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf-8');

console.log('\n-- file contract --');
ok(Array.isArray(map.rows), 'pitch_map.json has a rows array');
ok(map.rows.length === map.n_rows, `rows ${map.rows.length} == declared ${map.n_rows}`);
ok(map.rows.length === 2430, 'row count is the full 2,430 player-seasons');
ok(map.seasons.length === 11, `11 competitions (${map.seasons.length})`);
ok(JSON.stringify(map.positions) === JSON.stringify(['DEF', 'FWD', 'MID']),
   'positions are DEF, FWD, MID');
ok(ros.tiles.length === 12, '12 roster tiles');

console.log('\n-- no fabricated values --');
ok(map.rows.every(r => Number.isFinite(r.x) && Number.isFinite(r.y)), 'all coordinates finite');
const dxy = new Set(map.rows.map(r => r.x + ',' + r.y)).size;
ok(dxy > map.rows.length * 0.98,
   `each row has its own position (${dxy} distinct of ${map.rows.length})`);
ok(!map.rows.some(r => /^(Player|player)[ _]?\d/.test(r.name)), 'no placeholder names');
ok(map.rows.every(r => r.name && r.pos), 'every row has a name and a position');
const modMap = (html.match(/<script id="mod-map">([\s\S]*?)<\/script>/) || [])[1] || '';
ok(modMap.length > 1000, 'mod-map found for inspection');
ok(!/\blcg\b|Math\.random|box-?muller/i.test(modMap), 'mod-map contains no generator');
ok(/fetch\("assets\/pitch_map\.json"/.test(modMap), 'mod-map fetches the real export');
ok(/loadError/.test(modMap), 'mod-map has an explicit error path');

console.log('\n-- the page claims nothing the data lacks --');
for (const bad of ['633 pitch', 'Six hundred thirty-three', 'synthesized 633']) {
  ok(!html.includes(bad), `page no longer says "${bad}"`);
}
ok(html.includes('2,430'), 'page states the real row count 2,430');

console.log('\n-- provenance --');
ok(/PitchMTNN v1\.1/.test(map.model || ''), `model is PitchMTNN v1.1 (${map.model})`);
ok(map.d_emb === 24, 'embedding is 24-d');
ok(/power iteration/.test(map.coords || ''), 'the coordinate derivation is stated in the file');
ok(typeof map.built_utc === 'string' && /UTC$/.test(map.built_utc),
   `built_utc is a real timestamp (${map.built_utc})`);

console.log('\n-- the view transform --');
let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
for (const r of map.rows) {
  if (r.x < x0) x0 = r.x; if (r.x > x1) x1 = r.x;
  if (r.y < y0) y0 = r.y; if (r.y > y1) y1 = r.y;
}
const dx = (x1 - x0) || 1, dy = (y1 - y0) || 1;
const points = map.rows.map(r => ({ x: (r.x - x0) / dx, y: 1 - (r.y - y0) / dy,
                                    pos: r.pos, name: r.name, season: r.season }));
ok(points.every(p => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1),
   'every transformed point lands in the 0..1 box');

console.log('\n-- position centroids and the prose that quotes them --');
const acc = new Map();
for (const p of points) {
  const a = acc.get(p.pos) || { sx: 0, sy: 0, n: 0 };
  a.sx += p.x; a.sy += p.y; a.n++;
  acc.set(p.pos, a);
}
const centers = [...acc.entries()].map(([pos, a]) => ({ pos, x: a.sx / a.n, y: a.sy / a.n, n: a.n }))
  .sort((p, q) => q.n - p.n);
for (const c of centers) {
  console.log(`    ${c.pos}  x ${c.x.toFixed(3)}  y ${c.y.toFixed(3)}  n ${c.n}`);
}
const D = centers.find(c => c.pos === 'DEF'), M = centers.find(c => c.pos === 'MID'),
      F = centers.find(c => c.pos === 'FWD');
ok(D.n === 1062 && M.n === 819 && F.n === 549, 'counts are 1,062 / 819 / 549 as the steps state');
ok(Math.round(D.n / map.rows.length * 100) === 44, 'step 6: defenders are 44% of the map');
ok(Math.round(F.n / map.rows.length * 100) === 23, 'step 4: forwards are 23% of the map');
ok(D.n === Math.max(...centers.map(c => c.n)), 'step 6: defenders are the largest group');
ok(F.n === Math.min(...centers.map(c => c.n)), 'step 4: forwards are the smallest group');
const between = (M.x - D.x) * (M.x - F.x) < 0 || (M.y - D.y) * (M.y - F.y) < 0;
ok(between, 'step 5: the midfield centroid sits between the other two on at least one axis');
ok(Math.round(map.explained_variance[0] * 100) === 58 &&
   Math.round(map.explained_variance[1] * 100) === 16,
   `step 2: PC1/PC2 carry 58% and 16% (actual ${map.explained_variance.slice(0,2).map(v=>Math.round(v*100)+'%').join(', ')})`);

console.log('\n-- what a cosine means here (the footer quotes these) --');
const cd = map.cosine_distribution || {};
ok(cd.n_pairs > 100000, `cosine distribution computed over ${cd.n_pairs} pairs`);
ok(Math.abs(cd.median - 0.834) < 0.01,
   `footer: a random pair sits at a median cosine of 0.834 (actual ${cd.median})`);
ok(Math.abs(cd.p99 - 0.996) < 0.003,
   `footer: 0.996 is the 99th percentile (actual p99 ${cd.p99})`);

console.log('\n-- roster tiles --');
for (const t of ros.tiles) {
  ok(points.some(p => p.name === t.name && p.season === t.season && p.pos === t.pos),
     `${t.name} (${t.pos}, ${t.season}) is findable on the map`);
}
ok(ros.tiles.every(t => t.nearest_other_competition &&
                        t.nearest_other_competition.season !== t.season),
   'every neighbour really is from a different competition');
ok(ros.tiles.every(t => t.nearest_other_competition.cosine > 0 &&
                        t.nearest_other_competition.cosine <= 1), 'every cosine is in (0, 1]');
for (const p of ['DEF', 'MID', 'FWD']) {
  ok(ros.tiles.filter(t => t.pos === p).length === 4, `4 tiles for ${p}`);
  ok(ros.tiles.filter(t => t.pos === p && t.pick === 'most typical').length === 1,
     `exactly one "most typical" pick for ${p}`);
}
ok(new Set(ros.tiles.map(t => t.nearest_other_competition.name)).size >= 10,
   `neighbours are not degenerate: ${new Set(ros.tiles.map(t => t.nearest_other_competition.name)).size} distinct of 12`);

console.log(fails === 0 ? '\nALL CHECKS PASSED\n' : `\n${fails} CHECK(S) FAILED\n`);
process.exit(fails === 0 ? 0 : 1);
