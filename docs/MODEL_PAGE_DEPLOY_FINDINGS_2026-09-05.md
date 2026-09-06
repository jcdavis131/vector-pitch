# /model 404 investigation — vector-pitch, 2026-09-05

Written by the weekend frontend-fix lane. No shipped file was changed — see "Why no code
fix" below. Every claim here was verified by a command; the command list is inline.

## Starting facts (as given to this lane)

`https://pitch.dumbmodel.com/` returns 200; `/model`, `/assets/mtnn_meta.json`,
`/assets/eval_scoreboard.json` return 404. Expectation was a hoops-style relative-path or
`outputDirectory` bug in `model.html` fixable with a small patch.

## What actually happened, in order

1. **The home checkout (`C:\Users\jcdav\vector-pitch`) was 104 commits behind `origin/master`**
   (`git rev-list --count 064a827..origin/master` = 104; `git fetch origin --prune` pulled in
   ~30 remote branches this clone had never seen). All investigation below is against
   `origin/master` (`42411cc`), fetched read-only. The stale local `master` is not what's live.

2. **The live root page is byte-identical to `origin/master:public/index.html`**
   (both 38190 bytes, `diff` empty; blob `d09ddbff…` also matches `index.html` and
   `public/index.html` at `ce42c11`/`42411cc`/`d5cc607`/`74e34d8` — every commit carrying this
   exact page). So the live deploy genuinely tracks current `origin/master`, not an old one.

3. **Upstream already retired the multi-page site `/model` was supposed to live on.**
   `34fdee9` ("fix: vercel.json map-first japandi v4 — outputDirectory public", 2026-08-21)
   changed `outputDirectory` from `.` to `public` and replaced the old per-page rewrites
   (`/model → /model.html`, `/players → /players.html`, …) with a catch-all
   (`/model`, `/players`, `/play`, `/trends`, `/lab`, `/dfs`, `/(.*)` → `/index.html`).
   `public/` on `origin/master` today contains only `index.html` and `assets/news/*` — a
   single-page "Japandi v4 Pudding" embedding-map app. `model.html`, `players.html`,
   `methods.html`, `trends.html`, `leaderboard.html`, `dashboard.html`, and every asset
   `model.html` fetches (`assets/vectors_mtnn.json`, `assets/eval_scoreboard.json`,
   `assets/data/model_zoo_eval.json`, `assets/data/provenance_status.json`, …) still exist and
   are real, but only at the **repo root**, outside `public/`. This is a deliberate product
   decision two weeks old, not an accident — reversing it (making `/model` serve the cockpit
   again) is a call for the operator, not a bugfix.

4. **Separately, the live deploy does not appear to be applying `vercel.json` at all.**
   `origin/master:vercel.json` has a catch-all rewrite (`/(.*) → /index.html`) that should make
   *every* path 200. It does not:
   ```
   curl -s -o /dev/null -w "%{http_code}" https://pitch.dumbmodel.com/nonexistent-route-xyz
   → 404
   ```
   A path that cannot possibly fail to match `/(.*)` still 404s. Serving the worktree's own
   `public/` directory with a bare static server (no vercel.json interpretation at all)
   reproduces the *exact* same 200/404 split as production:
   | path | live | `python -m http.server --directory public` (this worktree) |
   |---|---|---|
   | `/` | 200 | 200 |
   | `/assets/news/news_features.json` | 200 | 200 |
   | `/model` | 404 | 404 |
   | `/assets/vectors.json` | 404 | 404 |
   | `/players` | 404 | 404 |
   | `/nonexistent-route-xyz` | 404 | 404 |

   That match is the signature of "the deploy root is `public/` served flat, with
   `vercel.json`'s `rewrites` not reaching production" — not a source bug. Grepped the repo for
   an explicit mechanism (`vercel --prod`, a `Root Directory` note, a deploy script) and found
   none (`git grep -i vercel -- '*.sh' '*.py' '*.yml' '*.md'` on `origin/master`: only docs
   referencing the intent, no script that would explain a partial config). This is not
   determinable from the repository; it needs the Vercel dashboard (Project → Settings → check
   which deployment is aliased to `pitch.dumbmodel.com`, its Git ref, and whether Root
   Directory / ignored-build-step settings differ from `vercel.json`).

## Why no code fix was made

- Fixing (3) by pointing `/model` back at the cockpit reverses a deliberate two-week-old
  redesign. That's a product call, not a bugfix, and the guardrails for this lane forbid
  restructuring pages or making that kind of decision unilaterally.
- Fixing (4) (e.g. rewriting `vercel.json` to copy everything into `public/`) cannot be verified
  without deploying, and this lane is explicitly forbidden from deploying or running the
  `vercel` CLI. Shipping an unverified config change under those guardrails would be worse than
  reporting the finding.
- No `fetch()` path bug exists in the current `model.html`/`index.html` sources themselves:
  every relative asset path in both resolves correctly for the route depth it's served at
  (`urljoin('https://pitch.dumbmodel.com/model', 'assets/vectors_mtnn.json')` →
  `.../assets/vectors_mtnn.json`, verified with Python's `urllib.parse.urljoin`). The 404s are
  not caused by a wrong `../` or a missing leading `/`.

## Decisions for the operator

1. **Product direction for `/model`**: keep it as the single-page embedding map
   (`public/index.html`, already live-shaped) and delete/retire the now-orphaned
   `model.html`/`players.html`/`methods.html`/`trends.html`/`leaderboard.html`/`dashboard.html`
   — or restore per-page routing and copy those files + their assets into `public/`. Either is
   a real content decision.
2. **Deploy mechanism**: find out why `pitch.dumbmodel.com` isn't honoring `vercel.json`'s
   `rewrites` even though it's honoring `outputDirectory`/headers-shaped responses — check the
   Vercel dashboard's Production deployment and Git integration settings directly; nothing in
   the repository explains it.

## Data actually backing the historical "v1.1, pos_cluster_acc 0.797" number

Still real and still committed, just unreachable from the live site:
- `assets/eval_scoreboard.json` → `evaluation.mtnn_v1_1_con05.pos_cluster_acc = 0.797`,
  `.composite = 0.7785` (this file's own top-level `built`/`model` fields have since moved on
  to a newer v3 arch, `built: 2026-08-18T20:36Z`, `composite: 0.86` — the 0.797 row is retained
  in the same file as a historical baseline, not fabricated for this report).
- `assets/vectors_mtnn.json` (874,484 bytes, valid JSON, `n_players: 2430`, `d_emb: 24`,
  `embedding: mtnn_v1_24d_l2`).
- `assets/vectors.json`, `assets/difficulty_calibration.json`,
  `assets/pitch_mtnn_embeddings.json` — all present, all valid JSON/committed.
- `pipeline/data/pitch_mtnn_report.json`, `pipeline/data/tm_9ctx_con05_report.json`,
  `pipeline/eval_reports/eval_pitch_latest.json` — the training-side reports these numbers were
  computed from.
- The current `model.html` (root, not `public/`) embeds the same number directly in its own
  `<meta description>`: `"pos_cluster0.797"` — so whichever generation of the cockpit ships,
  it agrees with the committed artifact.

## Commands run (all read-only against `origin/master` / this worktree; none touched
`C:\Users\jcdav\.gpuscratch` or `C:\Users\jcdav\herdmux`)

```
git -C C:\Users\jcdav\vector-pitch fetch origin --prune
git -C C:\Users\jcdav\vector-pitch rev-list --count 064a827..origin/master        # 104
git -C C:\Users\jcdav\vector-pitch show origin/master:vercel.json
git -C C:\Users\jcdav\vector-pitch log --all --oneline -S "Japandi v4 Pudding"
git -C C:\Users\jcdav\vector-pitch ls-tree origin/master:public --name-only
curl -sI https://pitch.dumbmodel.com/
curl -s -o /dev/null -w "%{http_code}" https://pitch.dumbmodel.com/nonexistent-route-xyz
python -m http.server 8765 --directory public   # from this worktree
python -m pytest tests/ -q                       # from this worktree
```
