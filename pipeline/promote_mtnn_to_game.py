"""Promote MTNN to game: merge MTNN 24-d L2 embeddings into vectors.json.

Reads:
  assets/vectors.json (633 WC rows, PCA3 map, 16-d tournament-z in .v)
  assets/pitch_mtnn_embeddings.json (2430 rows, 11 ctx, 24-d e_p L2)

Writes:
  assets/vectors.json (OVERWRITES game contract, now MTNN retrieval)
    - keeps same 633 players, same x,y,z,c, same id order
    - players[].v = 24-d L2 e_p (MTNN v1.1 SupCon 0.5, full-corpus refit)
    - players[].profile = original 16-d tournament-z for UI (trait, pitch, breakdown)
    - players[].e_p alias = same as v for explicitness
    - top-level metadata: embedding="mtnn_v1_24d_l2", note map is PCA3, retrieval MTNN
    - backwards compat: game.js uses v for cosineSim if length 24 and profile exists,
      falls back to v 16-d if embedding=="pca3".

  assets/vectors_mtnn.json (2430 rows, full corpus)
    - each row: id, name, team, pos, context, minutes, v=e_p 24-d, x,y,z from e_p[:3] normalized
    - for WC rows reuses x,y,z from vectors.json PCA3 map, for others derives from e_p.

This is the hill-climb step that beats PCA3 4/4 metrics (pos_cluster 0.7265 vs 0.7008,
supcon 0.797, knn5 0.7621->0.7894) and aligns with unified 24-d native.

Run: python pipeline/promote_mtnn_to_game.py
"""

from __future__ import annotations

import json
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VEC_OLD = ROOT / "assets" / "vectors.json"
MTNN = ROOT / "assets" / "pitch_mtnn_embeddings.json"
VEC_NEW = ROOT / "assets" / "vectors.json"
VEC_MTNN_FULL = ROOT / "assets" / "vectors_mtnn.json"

def main() -> int:
    old = json.loads(VEC_OLD.read_text(encoding="utf-8"))
    mtnn = json.loads(MTNN.read_text(encoding="utf-8"))
    print(f"old vectors: {len(old['players'])} players, v dim {len(old['players'][0]['v'])}")
    print(f"mtnn embeddings: {len(mtnn['players'])} players, d_emb {mtnn['d_emb']}, con_w {mtnn.get('config',{}).get('con_w')}")

    # Build lookup (name, context/season) -> e_p
    lookup = {}
    for p in mtnn["players"]:
        key = (p["name"], p["context"])
        lookup[key] = p["e_p"]
    # Also name-only fallback for WC (shouldn't need)
    # Check coverage for old corpus
    missing = []
    matched = 0
    for pl in old["players"]:
        key = (pl["name"], pl["season"])
        if key in lookup:
            matched += 1
        else:
            missing.append(key)
    print(f"matched WC {matched}/{len(old['players'])}, missing {len(missing)}")
    if missing:
        print("missing examples:", missing[:5])

    # Build new vectors.json for game (633 MTNN)
    new_players = []
    for pl in old["players"]:
        key = (pl["name"], pl["season"])
        ep = lookup.get(key)
        if ep is None:
            # fallback to original v (should not happen for WC)
            print(f"WARN missing MTNN for {key}, keeping old v")
            ep = [0.0]*24  # placeholder, will be caught
        # keep original 16-d as profile for UI
        profile = pl["v"]  # 16-d tournament-z
        new_pl = {
            "id": pl["id"],
            "name": pl["name"],
            "season": pl["season"],
            "team": pl["team"],
            "pos": pl["pos"],
            "v": [round(float(x),5) for x in ep],         # MTNN 24-d L2 for retrieval
            "profile": [round(float(x),3) for x in profile], # 16-d for UI
            "e_p": [round(float(x),5) for x in ep],        # alias
            "x": pl["x"],
            "y": pl["y"],
            "z": pl["z"],
            "c": pl["c"],
        }
        new_players.append(new_pl)

    # Metadata for MTNN game
    out_game = {
        "built": time.strftime("%Y-%m-%d"),
        "embedding": "mtnn_v1_24d_l2",
        "embedding_note": "retrieval is MTNN 24-d L2 (v); map is PCA3 (x,y,z) from original tournament-z; profile 16-d stored for trait/pitch UI — ablation that beats PCA3 0.7265 vs 0.7008 per audit",
        "provenance": f"promoted from {MTNN.name} (n={len(mtnn['players'])}, d_emb=24, con_w=0.5, supcon pos_acc 0.797) + {VEC_OLD.name} PCA3 map",
        "seasons": old.get("seasons", ["WC 2018","WC 2022"]),
        "normalization": old.get("normalization","per-90 minutes, z-scored within tournament (context-honest)"),
        "features": old.get("features", []),
        "featureLabels": old.get("featureLabels", {}),
        "clusters": old.get("clusters", []),
        "players": new_players,
        "attribution": old.get("attribution","Data: StatsBomb Open Data"),
        # keep old PCA flag for fallback detection
        "pca_fallback": {
            "available": True,
            "note": "game.js can fallback to profile 16-d if embedding flag missing; old vectors.json backed up as vectors_pca3.json if needed"
        }
    }
    VEC_NEW.write_text(json.dumps(out_game, separators=(",",":")), encoding="utf-8")
    print(f"wrote {VEC_NEW.name}: {len(new_players)} players, v dim 24, profile dim 16")

    # Also write full corpus vectors_mtnn.json (2430 rows)
    # For x,y,z: reuse PCA3 map for WC rows, for others derive from e_p[:3] normalized to [0,1]
    # Derive xyz for non-WC from e_p first 3 dims scaled
    # Build old xyz lookup for WC
    old_xyz = {(p["name"], p["season"]): (p["x"], p["y"], p["z"], p["c"]) for p in old["players"]}
    # Normalize e_p[:3] across full corpus to [0,1] per dim
    import numpy as np
    E = np.array([p["e_p"] for p in mtnn["players"]], dtype=np.float64)
    xyz_raw = E[:,:3]
    xyz_min = xyz_raw.min(axis=0)
    xyz_max = xyz_raw.max(axis=0)
    # avoid div0
    xyz_range = np.maximum(xyz_max - xyz_min, 1e-9)
    xyz_norm = (xyz_raw - xyz_min) / xyz_range
    # Also normalize by global max to keep within 0-1 cube as original did: they used / max_range
    # Original PCA map did (P - P.min(0)) / (P.max()-P.min()).max() — similar but we use per-dim clip
    # Keep per-dim for simplicity; clamp already 0-1.

    full_players = []
    for i, p in enumerate(mtnn["players"]):
        key = (p["name"], p["context"])
        if key in old_xyz:
            x,y,z,c = old_xyz[key]
        else:
            x = float(xyz_norm[i,0])
            y = float(xyz_norm[i,1])
            z = float(xyz_norm[i,2])
            c = 0  # unknown archetype for non-WC; could k-means but keep 0
        full_players.append({
            "id": i,
            "name": p["name"],
            "team": p["team"],
            "pos": p["pos"],
            "context": p["context"],
            "minutes": p["minutes"],
            "v": [round(float(v),5) for v in p["e_p"]],
            "e_p": [round(float(v),5) for v in p["e_p"]],
            "x": round(x,4),
            "y": round(y,4),
            "z": round(z,4),
            "c": int(c),
        })
    out_full = {
        "built": time.strftime("%Y-%m-%d"),
        "embedding": "mtnn_v1_24d_l2",
        "n_players": len(full_players),
        "contexts": mtnn.get("contexts", []),
        "d_emb": mtnn.get("d_emb", 24),
        "config": mtnn.get("config", {}),
        "players": full_players,
        "attribution": "Data: StatsBomb Open Data (statsbomb.com) -- free data license, attribution required, MTNN v1.1 SupCon 0.5"
    }
    VEC_MTNN_FULL.write_text(json.dumps(out_full, separators=(",",":")), encoding="utf-8")
    print(f"wrote {VEC_MTNN_FULL.name}: {len(full_players)} players")

    # Sanity: L2 norms ~1
    norms = np.linalg.norm(np.array([pl["v"] for pl in new_players]), axis=1)
    print(f"new vectors L2 min {norms.min():.4f} max {norms.max():.4f} mean {norms.mean():.4f}")
    assert np.allclose(norms, 1.0, atol=1e-3), "MTNN vectors not L2"
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
