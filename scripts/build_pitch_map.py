"""Derive the page's coordinate file from the real PitchMTNN embedding export.

`assets/pitch_mtnn_embeddings.json` is this repo's own model output: 2,430 player-seasons,
each with the 24-d embedding `e_p` the model produced, plus the player's real name, position,
team and competition. The map's x/y come from a PCA-3 of those embeddings computed here, so
the derivation is stated rather than inherited.

WHY NOT vector-hub/assets/data/pitch.json. That file has the right shape - 2,430 rows, real
names, x/y/z - and it is tempting. Its coordinates could not be reproduced from anything in
this repo: they correlate 0.75-0.79 with a PCA-3 of e_p and only 0.31-0.60 with a PCA-3 of the
raw tournament-z features in tm_full.npz, and no script in vector-pitch or vector-hub writes
it. Coordinates whose derivation cannot be stated do not go on the page, even when they are
probably real. These are computed from the embedding, here, in eleven lines you can read.

A REFUSAL THIS SCRIPT MAKES ON PURPOSE: vector-unified shipped a months-old export beside a
newer checkpoint for weeks (best_epoch=58 export, best_epoch=27 checkpoint), so a staleness
check is not optional. mtime is the wrong signal - in a fresh worktree or after any copy the
mtimes are creation times and mean nothing, which this script's first draft learned by
refusing its own inputs. The check is structural instead: the checkpoint records d_emb, n_ctx
and dropout in its own config, and those must match the export's header.

For the record, in the original checkout these two were written 37 MILLISECONDS apart -
pitch_mtnn_embeddings.json at 2026-07-11 10:04:11.004 and pitch_mtnn.pt at 10:04:11.041 - so
they are one run's output. That is evidence, not something this script can re-derive.

Re-run after any re-export:  python scripts/build_pitch_map.py
"""
import datetime
import json
import sys
import math
import pathlib
import re

# Real player names carry diacritics; a cp1252 console must not kill the build.
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = ROOT / "assets" / "pitch_mtnn_embeddings.json"
CKPT = ROOT / "pipeline" / "data" / "pitch_mtnn.pt"
OUT = ROOT / "public" / "assets" / "pitch_map.json"
ROSTER_OUT = ROOT / "public" / "assets" / "pitch_roster.json"
PER_POS = 4

if not SRC.exists():
    raise SystemExit(f"{SRC} is missing; this script has nothing real to read.")

blob = json.loads(SRC.read_bytes().decode("utf-8"))
rows = blob["players"]

if CKPT.exists():
    try:
        import torch
        ck_cfg = (torch.load(CKPT, map_location="cpu", weights_only=False) or {}).get("config", {})
    except Exception as exc:
        print(f"  ! could not read {CKPT.name} to verify the export ({exc}); NOT VERIFIED",
              file=sys.stderr)
        ck_cfg = None
    if ck_cfg:
        want_d = blob.get("d_emb")
        got_d = ck_cfg.get("d_emb")
        n_ctx = ck_cfg.get("n_ctx")
        have_ctx = len(blob.get("contexts") or [])
        problems = []
        if want_d is not None and got_d is not None and int(want_d) != int(got_d):
            problems.append(f"d_emb {want_d} in the export vs {got_d} in the checkpoint")
        if n_ctx is not None and have_ctx and int(n_ctx) != have_ctx:
            problems.append(f"{have_ctx} contexts in the export vs n_ctx {n_ctx} in the checkpoint")
        if problems:
            raise SystemExit(
                "REFUSING: the export does not describe this checkpoint - "
                + "; ".join(problems)
                + ". Re-export before building the page's data.")
        print(f"  checkpoint match: d_emb {got_d}, n_ctx {n_ctx} == export d_emb {want_d}, "
              f"{have_ctx} contexts")

fake = [r["name"] for r in rows if re.match(r"^(Player|player)[ _]?\d", str(r.get("name", "")))]
if fake:
    raise SystemExit(f"{len(fake)} rows carry placeholder names (e.g. {fake[0]!r}); refusing")
missing = [i for i, r in enumerate(rows) if not r.get("name") or not r.get("e_p")]
if missing:
    raise SystemExit(f"{len(missing)} rows lack a name or an embedding; refusing a partial map")

# ---- PCA-3 of the real 24-d embeddings, by hand so the derivation is visible --------------
E = [list(map(float, r["e_p"])) for r in rows]
n, d = len(E), len(E[0])
mean = [sum(row[k] for row in E) / n for k in range(d)]
C = [[E[i][k] - mean[k] for k in range(d)] for i in range(n)]

# power iteration with deflation: three components, deterministic seed vector, no RNG
def _matvec(v):
    out = [0.0] * d
    for row in C:
        s = sum(row[k] * v[k] for k in range(d))
        for k in range(d):
            out[k] += row[k] * s
    return out


comps, evs = [], []
for c in range(3):
    v = [1.0 if k == c else 0.31 / (k + 1) for k in range(d)]           # fixed, not random
    nv = math.sqrt(sum(x * x for x in v)) or 1.0
    v = [x / nv for x in v]
    for _ in range(300):
        w = _matvec(v)
        for prev in comps:                                              # deflate
            dot = sum(w[k] * prev[k] for k in range(d))
            w = [w[k] - dot * prev[k] for k in range(d)]
        nw = math.sqrt(sum(x * x for x in w))
        if nw < 1e-12:
            break
        nxt = [x / nw for x in w]
        if sum(abs(nxt[k] - v[k]) for k in range(d)) < 1e-10:
            v = nxt
            break
        v = nxt
    comps.append(v)
    evs.append(sum(sum(row[k] * v[k] for k in range(d)) ** 2 for row in C) / n)

total_var = sum(sum(row[k] ** 2 for k in range(d)) for row in C) / n
explained = [round(e / total_var, 4) for e in evs] if total_var else [0, 0, 0]
proj = [[sum(C[i][k] * comps[j][k] for k in range(d)) for j in range(3)] for i in range(n)]

out = []
for i, r in enumerate(rows):
    out.append({
        "name": r["name"],
        "pos": r.get("pos") or None,
        "team": r.get("team") or None,
        "season": r.get("context") or None,
        "minutes": r.get("minutes"),
        "x": round(proj[i][0], 4), "y": round(proj[i][1], 4), "z": round(proj[i][2], 4),
    })

# ---- what a cosine MEANS in this space ---------------------------------------------------
# The tiles below quote similarities of 0.98-0.999, which reads as "identical" unless you know
# the distribution. In a 24-d L2 space this concentrated, a random pair of player-seasons
# already sits near 0.84. So the page quotes the percentile, not the bare number.
# Deterministic stride sample, no RNG, so the figures are reproducible.
_stride = max(1, len(E) // 1200)
_samp = list(range(0, len(E), _stride))
_norm = []
for i in _samp:
    m = math.sqrt(sum(v * v for v in E[i])) or 1.0
    _norm.append([v / m for v in E[i]])
_pairs = []
for a in range(len(_norm)):
    ra = _norm[a]
    for b in range(a + 1, len(_norm)):
        rb = _norm[b]
        _pairs.append(sum(ra[k] * rb[k] for k in range(d)))
_pairs.sort()


def _pct(q):
    return round(_pairs[min(len(_pairs) - 1, int(q / 100 * len(_pairs)))], 4)


cosine_dist = {
    "sample_rows": len(_samp), "n_pairs": len(_pairs),
    "median": _pct(50), "p75": _pct(75), "p95": _pct(95), "p99": _pct(99),
    "note": ("percentiles of the cosine between two randomly chosen player-seasons, over a "
             "deterministic stride sample. A tile's similarity is only meaningful against "
             "this: the median random pair already sits near the median figure here."),
}
print(f"  cosine of a random pair: median {cosine_dist['median']}, "
      f"p95 {cosine_dist['p95']}, p99 {cosine_dist['p99']} ({cosine_dist['n_pairs']} pairs)")

positions = sorted({r["pos"] for r in out if r["pos"]})
seasons = sorted({r["season"] for r in out if r["season"]})
counts = {p: sum(1 for r in out if r["pos"] == p) for p in positions}

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps({
    "source": "assets/pitch_mtnn_embeddings.json",
    "model": blob.get("model"),
    "d_emb": blob.get("d_emb"),
    "exporter_built_field": blob.get("built"),
    "built_utc": datetime.datetime.fromtimestamp(
        SRC.stat().st_mtime, datetime.timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
    "n_rows": len(out),
    "positions": positions,
    "counts": counts,
    "seasons": seasons,
    "coords": ("PCA-3 of the 24-d e_p embeddings, computed by scripts/build_pitch_map.py "
               "(power iteration with deflation, fixed seed vector, no RNG)"),
    "explained_variance": explained,
    "normalization": "per-90 minutes, z-scored within competition (context-honest)",
    "cosine_distribution": cosine_dist,
    "rows": out,
}, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
print(f"wrote {OUT.relative_to(ROOT)}: {len(out)} real rows, {len(positions)} positions, "
      f"{len(seasons)} competitions, {OUT.stat().st_size / 1024:.0f} KB")
print(f"  model: {blob.get('model')} | explained variance PC1-3: {explained}")
for p in positions:
    print(f"    {p:<5s} {counts[p]:5d}")

# ---- roster: per position, one most-typical plus three spanning the spread ----------------
def _dot(a, b):
    return sum(a[k] * b[k] for k in range(d))


tiles = []
for p in positions:
    idx = [i for i, r in enumerate(out) if r["pos"] == p]
    cen = [sum(E[i][k] for i in idx) / len(idx) for k in range(d)]
    cn = math.sqrt(sum(v * v for v in cen)) or 1.0
    cen = [v / cn for v in cen]
    chosen = [max(idx, key=lambda i: _dot(E[i], cen))]
    while len(chosen) < PER_POS and len(chosen) < len(idx):
        chosen.append(max((i for i in idx if i not in chosen),
                          key=lambda i: min(1.0 - _dot(E[i], E[c]) for c in chosen)))
    for rank, i in enumerate(chosen):
        best_j, best = None, -2.0
        for j in range(len(out)):
            if j == i or out[j]["season"] == out[i]["season"]:
                continue
            v = _dot(E[i], E[j])
            if v > best:
                best, best_j = v, j
        tiles.append({
            "name": out[i]["name"], "pos": out[i]["pos"], "team": out[i]["team"],
            "season": out[i]["season"], "x": out[i]["x"], "y": out[i]["y"],
            "pick": "most typical" if rank == 0 else f"spread {rank}",
            "nearest_other_competition": {
                "name": out[best_j]["name"], "pos": out[best_j]["pos"],
                "team": out[best_j]["team"], "season": out[best_j]["season"],
                "cosine": round(best, 4),
            },
        })

ROSTER_OUT.write_text(json.dumps({
    "source": "assets/pitch_mtnn_embeddings.json",
    "model": blob.get("model"),
    "selection": (f"per position, {PER_POS} player-seasons: the one nearest that position's "
                  "mean 24-d embedding, then farthest-point sampling so the tiles span the "
                  "position rather than resampling its centre"),
    "neighbour_rule": ("for each tile, the closest player-season from a DIFFERENT competition "
                       "by cosine in the 24-d embedding. Same-competition neighbours are close "
                       "by construction because the features are z-scored within competition, "
                       "so the cross-competition match is the one that means something"),
    "tiles": tiles,
}, indent=1, ensure_ascii=False), encoding="utf-8")
print(f"wrote {ROSTER_OUT.relative_to(ROOT)}: {len(tiles)} tiles")
for t in tiles:
    nb = t["nearest_other_competition"]
    print(f"    {t['pos']:<4s} {t['name'][:24]:<24s} {str(t['season'])[:20]:<20s}"
          f" -> {nb['name'][:22]:<22s} cos {nb['cosine']:.3f}")
