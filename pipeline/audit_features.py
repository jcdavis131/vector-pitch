"""Audit the pitch MTNN input matrix -- same discipline as vector-hoops' and
vector-gridiron's pipeline/audit_features.py, adapted for this repo's schema
(X/M/ctx_ids, no per-row season/year -- ctx_ids are tournament/league-season
labels, not a clean chronological axis, so no "coverage cliff at newest
season" check here; feature set is small (16), so this is mostly a sanity
check rather than expecting a lot of findings).

Reads pipeline/data/tm_full.npz + feature_manifest_tm_full.json -- NOT the
--matrix default train_matrix.npz. Checked first: train_matrix.npz has 2738
rows across only 10 context ids (missing "WC 2022" entirely), while the
actually-shipped assets/pitch_mtnn_embeddings.json has exactly 2430 rows,
matching tm_full.npz row-for-row. train_matrix.npz is some other/stale
snapshot (same 2026-07-11 batch, but not what produced the shipped artifact,
and possibly not schema-matched to any manifest still on disk) -- auditing it
would describe a file nothing currently depends on. tm_full.npz is the one
that matters.

Read-only. Writes pipeline/data/feature_audit.json.

Run:  python pipeline/audit_features.py
"""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "pipeline" / "data"
MATRIX = DATA / "tm_full.npz"
MANIFEST = DATA / "feature_manifest_tm_full.json"
OUT = DATA / "feature_audit.json"

DUP_R = 0.98
MIN_OVERLAP = 100  # pitch corpus is much smaller (2738 rows) than hoops/gridiron
NEAR_CONST_STD = 0.01


def masked_corr(a, b, ma, mb) -> tuple[float, int]:
    both = (ma > 0) & (mb > 0)
    n = int(both.sum())
    if n < MIN_OVERLAP:
        return 0.0, n
    x, y = a[both].astype(np.float64), b[both].astype(np.float64)
    sx, sy = x.std(), y.std()
    if sx < 1e-9 or sy < 1e-9:
        return 0.0, n
    return float(((x - x.mean()) * (y - y.mean())).mean() / (sx * sy)), n


def main() -> None:
    m = np.load(MATRIX, allow_pickle=True)
    man = json.loads(MANIFEST.read_text(encoding="utf-8"))
    Z, M = m["X"], m["M"]
    feats: list[str] = man["features"]
    fam_of: dict[str, str] = man["families"]
    if Z.shape[1] != len(feats):
        raise SystemExit(f"train_matrix.npz has {Z.shape[1]} cols but manifest lists {len(feats)} "
                         "features -- schema drifted, do not trust this audit until reconciled")

    fam_cols: dict[str, list[int]] = defaultdict(list)
    for j, f in enumerate(feats):
        fam_cols[fam_of.get(f, "?")].append(j)

    report: dict = {"rows": int(Z.shape[0]), "features": len(feats), "families": len(fam_cols)}

    dead = []
    for j, f in enumerate(feats):
        obs = M[:, j] > 0
        cov = float(obs.mean())
        if obs.sum() < MIN_OVERLAP:
            dead.append({"feature": f, "family": fam_of.get(f), "coverage": round(cov, 4),
                         "why": "coverage below usable threshold"})
            continue
        sd = float(Z[obs, j].std())
        if sd < NEAR_CONST_STD:
            dead.append({"feature": f, "family": fam_of.get(f), "coverage": round(cov, 4),
                         "sd": round(sd, 6), "why": "near-constant where observed"})
    report["dead_or_constant"] = dead

    dups = []
    for j in range(len(feats)):
        for k in range(j + 1, len(feats)):
            r, n = masked_corr(Z[:, j], Z[:, k], M[:, j], M[:, k])
            if abs(r) >= DUP_R:
                dups.append({"a": feats[j], "b": feats[k], "family_a": fam_of.get(feats[j]),
                             "family_b": fam_of.get(feats[k]), "r": round(r, 4), "n": n})
    dups.sort(key=lambda d: -abs(d["r"]))
    report["redundant_pairs"] = dups

    fam_red = {}
    for fam, cols in sorted(fam_cols.items()):
        if len(cols) < 2:
            continue
        rs = []
        for i in range(len(cols)):
            for j in range(i + 1, len(cols)):
                r, n = masked_corr(Z[:, cols[i]], Z[:, cols[j]], M[:, cols[i]], M[:, cols[j]])
                if n >= MIN_OVERLAP:
                    rs.append(abs(r))
        if rs:
            fam_red[fam] = {"n_features": len(cols), "mean_abs_r": round(float(np.mean(rs)), 4),
                            "max_abs_r": round(float(np.max(rs)), 4)}
    report["within_family_redundancy"] = fam_red

    # coverage by context (ctx_ids), since there's no clean chronological axis
    ctx_ids = m["ctx_ids"]
    contexts = man.get("contexts", [])
    ctx_cov = {}
    for cid in sorted(set(ctx_ids.tolist())):
        msk = ctx_ids == cid
        label = contexts[cid] if cid < len(contexts) else f"ctx_{cid}"
        ctx_cov[label] = round(float(M[msk].mean()), 4)
    report["coverage_by_context"] = ctx_cov

    OUT.write_text(json.dumps(report, indent=1), encoding="utf-8")

    print(f"rows={report['rows']} features={report['features']} families={report['families']}")
    print(f"dead/near-constant: {len(dead)}")
    for d in dead:
        print(f"  {d['feature']:20s} {d.get('why')}")
    print(f"redundant pairs |r|>={DUP_R}: {len(dups)}")
    for d in dups:
        print(f"  {d['a']:20s} ~ {d['b']:20s} r={d['r']:+.4f} ({d['family_a']}/{d['family_b']})")
    print("family redundancy (mean |r|):")
    for fam, v in sorted(fam_red.items(), key=lambda kv: -kv[1]["mean_abs_r"]):
        print(f"  {fam:14s} n={v['n_features']:2d} mean|r|={v['mean_abs_r']:.3f} max={v['max_abs_r']:.3f}")
    print("coverage by context (mean feature-mask fraction):")
    for label, c in sorted(ctx_cov.items(), key=lambda kv: kv[1]):
        print(f"  {label:28s} {c:.3f}")
    print(f"\nwrote {OUT}")


if __name__ == "__main__":
    main()
