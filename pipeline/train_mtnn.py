"""Vector Pitch MTNN v1 — multi-tower, multi-task soccer embedding.

Residual family towers (masked) -> gated fusion -> L2 embedding -> heads:
  archetype CE (k-means(8) labels) + 16-d profile reconstruction.

Head-to-head vs the shipped PCA(3)+k-means(8) baseline on the SAME matrix, SAME split,
SAME metrics, so "the MTNN beats PCA" is falsifiable, not asserted.

Metrics (role recovery — the point of the embedding):
  - position-cluster acc: k-means(8) on train embedding -> majority position per cluster
    -> predict test position; fraction correct. (ground-truth = DEF/MID/FWD)
  - NN role coherence: nearest train embedding-neighbor of each test player, same pos? (%)
  - profile recon MAE: reconstruct the 16-d input; PCA(3) vs MTNN(d_emb).

Split: leave-one-context-out (each competition-season held out in turn; averaged). On the
starter matrix this is 2 folds (WC2018 / WC2022); grows as the corpus expands.

Honest small-data regime: heavy dropout (0.3), high weight decay (1e-3), small net,
family-drop augmentation. If it can't beat PCA on 633 rows, that confirms the need for
the expanded corpus (already fetching in the background).

Run:  python pipeline/train_mtnn.py [--epochs 200] [--d-emb 24]
Requires: pipeline/data/train_matrix.npz + feature_manifest.json (from build_features.py)
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "pipeline" / "data"
ASSETS = ROOT / "assets"
SEED = 7
N_ARCH = 8  # k-means archetypes (matches the shipped PCA game)


# ---------------------------------------------------------------------------
# Model (matches vector-gridiron/pipeline/train_mtnn.py convention)
# ---------------------------------------------------------------------------


class ResidualTower(nn.Module):
    def __init__(
        self, d_in: int, d_out: int = 16, d_hidden: int = 32, dropout: float = 0.0
    ):
        super().__init__()
        d_cat = d_in * 2
        self.fc1 = nn.Linear(d_cat, d_hidden)
        self.ln1 = nn.LayerNorm(d_hidden)
        self.drop = nn.Dropout(dropout)
        self.fc2 = nn.Linear(d_hidden, d_out)
        self.ln2 = nn.LayerNorm(d_out)
        self.skip = nn.Linear(d_cat, d_out) if d_cat != d_out else nn.Identity()

    def forward(self, x: torch.Tensor, m: torch.Tensor) -> torch.Tensor:
        h = torch.cat([x * m, m], dim=-1)
        return self.ln2(
            self.fc2(self.drop(F.gelu(self.ln1(self.fc1(h))))) + self.skip(h)
        )


class GatedFusion(nn.Module):
    def __init__(
        self,
        n_towers: int,
        d_tower: int,
        n_ctx: int,
        d_ctx: int = 8,
        d_emb: int = 24,
        d_hidden: int = 64,
        dropout: float = 0.2,
    ):
        super().__init__()
        self.ctx_emb = nn.Embedding(n_ctx, d_ctx)
        self.gate = nn.Linear(d_tower, 1)
        self.attn = nn.Sequential(
            nn.Linear(d_tower, d_tower), nn.Tanh(), nn.Linear(d_tower, 1)
        )
        self.fuse = nn.Sequential(
            nn.Linear(d_tower + d_ctx, d_hidden),
            nn.GELU(),
            nn.LayerNorm(d_hidden),
            nn.Dropout(dropout),
            nn.Linear(d_hidden, d_emb),
        )

    def forward(self, tower_stack: torch.Tensor, ctx_ids: torch.Tensor) -> torch.Tensor:
        scores = self.attn(tower_stack).squeeze(-1)
        weights = torch.softmax(scores, dim=-1)
        gates = torch.sigmoid(self.gate(tower_stack).squeeze(-1))
        mixed = (tower_stack * weights.unsqueeze(-1) * gates.unsqueeze(-1)).sum(1)
        c = self.ctx_emb(ctx_ids)
        return F.normalize(self.fuse(torch.cat([mixed, c], dim=-1)), dim=-1)


class PitchMTNN(nn.Module):
    def __init__(
        self,
        fam_dims: dict,
        n_ctx: int,
        d_tower: int = 16,
        d_emb: int = 24,
        n_feat: int = 16,
        n_arch: int = N_ARCH,
        dropout: float = 0.2,
    ):
        super().__init__()
        self.families = sorted(fam_dims)
        self.towers = nn.ModuleDict(
            {
                f: ResidualTower(fam_dims[f], d_out=d_tower, dropout=dropout)
                for f in self.families
            }
        )
        self.fusion = GatedFusion(
            len(self.families), d_tower, n_ctx, d_emb=d_emb, dropout=dropout
        )
        self.arch_head = nn.Linear(d_emb, n_arch)
        self.profile_head = nn.Linear(d_emb, n_feat)

    def encode(self, xs, ms, ctx_ids):
        parts = torch.stack(
            [self.towers[f](xs[f], ms[f]) for f in self.families], dim=1
        )
        return self.fusion(parts, ctx_ids)

    def forward(self, xs, ms, ctx_ids):
        emb = self.encode(xs, ms, ctx_ids)
        return emb, {"arch": self.arch_head(emb), "profile": self.profile_head(emb)}


def supcon_loss(z, labels, temp: float = 0.07):
    """Supervised contrastive (InfoNCE) on L2-normalized z. Positives = same label."""
    if z.shape[0] < 4:
        return z.new_zeros(())
    sim = (z @ z.T) / temp
    B = z.shape[0]
    same = (labels[:, None] == labels[None, :]).float()
    diag = torch.eye(B, device=z.device)
    pos = same * (1.0 - diag)
    sim = sim - sim.max(dim=1, keepdim=True).values.detach()
    denom = (torch.exp(sim) * (1.0 - diag)).sum(dim=1, keepdim=True) + 1e-8
    log_prob = sim - torch.log(denom)
    pos_count = pos.sum(dim=1)
    valid = pos_count > 0
    if not valid.any():
        return z.new_zeros(())
    mean_pos = (pos * log_prob).sum(dim=1) / (pos_count + 1e-8)
    return -mean_pos[valid].mean()


def _pos_ids(pos_arr: np.ndarray) -> np.ndarray:
    if pos_arr.dtype.kind in ("U", "S", "O"):
        return np.array([POS_ORDER.get(str(p), 1) for p in pos_arr], dtype=np.int64)
    return pos_arr.astype(np.int64)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def family_slices(features, families):
    return {fam: [features.index(c) for c in cols] for fam, cols in families.items()}


def split_by_family(X, M, slices, device):
    xs, ms = {}, {}
    for fam, cols in slices.items():
        xs[fam] = torch.tensor(X[:, cols], dtype=torch.float32, device=device)
        ms[fam] = torch.tensor(M[:, cols], dtype=torch.float32, device=device)
    return xs, ms


def kmeans(z: np.ndarray, k: int, seed: int = SEED, iters: int = 60):
    rng = np.random.default_rng(seed)
    n = len(z)
    cent = z[rng.choice(n, k, replace=False)].copy()
    lab = np.zeros(n, dtype=int)
    for _ in range(iters):
        d = ((z[:, None, :] - cent[None]) ** 2).sum(-1)
        lab = d.argmin(1)
        for c in range(k):
            if (lab == c).any():
                cent[c] = z[lab == c].mean(0)
    return lab, cent


POS_ORDER = {"DEF": 0, "MID": 1, "FWD": 2}


def position_cluster_acc(emb_tr, pos_tr, emb_te, pos_te, k=N_ARCH, seed=SEED):
    """k-means on train embedding -> majority position per cluster -> predict test."""
    lab_tr, cent = kmeans(emb_tr, k, seed)
    cluster_pos = {}
    for c in range(k):
        members = pos_tr[lab_tr == c]
        if len(members):
            vals, counts = np.unique(members, return_counts=True)
            cluster_pos[c] = vals[counts.argmax()]
        else:
            cluster_pos[c] = "MID"
    d_te = ((emb_te[:, None, :] - cent[None]) ** 2).sum(-1)
    pred = np.array([cluster_pos[c] for c in d_te.argmin(1)])
    return float(np.mean(pred == pos_te)), cluster_pos


def nn_role_coherence(emb_tr, pos_tr, emb_te, pos_te):
    zn = emb_te / (np.linalg.norm(emb_te, axis=1, keepdims=True) + 1e-9)
    ztr = emb_tr / (np.linalg.norm(emb_tr, axis=1, keepdims=True) + 1e-9)
    sim = zn @ ztr.T
    nn_idx = sim.argmax(1)
    return float(np.mean(pos_tr[nn_idx] == pos_te))


def knn_position_acc(emb_tr, pos_tr, emb_te, pos_te, k=5):
    """Clean role-recovery metric: kNN-k majority-vote position classification on held-out."""
    zn = emb_te / (np.linalg.norm(emb_te, axis=1, keepdims=True) + 1e-9)
    ztr = emb_tr / (np.linalg.norm(emb_tr, axis=1, keepdims=True) + 1e-9)
    sim = zn @ ztr.T
    topk = np.argsort(-sim, axis=1)[:, :k]
    correct = 0
    for i, idxs in enumerate(topk):
        votes = pos_tr[idxs]
        vals, counts = np.unique(votes, return_counts=True)
        if vals[counts.argmax()] == pos_te[i]:
            correct += 1
    return float(correct / len(pos_te))


def pca_recon_mae(X_tr, X_te, k=3):
    mu = X_tr.mean(0)
    C = X_tr - mu
    _, _, Vt = np.linalg.svd(C, full_matrices=False)
    V_k = Vt[:k, :].T  # (d, k) principal directions
    recon_te = mu + (X_te - mu) @ V_k @ V_k.T
    return float(np.mean(np.abs(recon_te - X_te)))


def pca_project(X_tr, X_te, k=3):
    """Project train+test into the top-k PCA subspace (the shipped PCA(3) map space)."""
    mu = X_tr.mean(0)
    C = X_tr - mu
    _, _S, Vt = np.linalg.svd(C, full_matrices=False)
    V_k = Vt[:k, :].T
    return (X_tr - mu) @ V_k, (X_te - mu) @ V_k


# ---------------------------------------------------------------------------
# Train + eval one fold
# ---------------------------------------------------------------------------


def train_fold(
    X,
    M,
    ctx_ids,
    pos,
    slices,
    fam_dims,
    n_ctx,
    feats,
    tr,
    te,
    device,
    epochs,
    d_emb,
    family_drop,
    arch_w=1.0,
    prof_w=0.5,
    con_w=0.0,
    dropout=0.2,
    wd=1e-3,
    lr=2e-3,
    d_tower=16,
):
    torch.manual_seed(SEED)
    np.random.seed(SEED)
    Xtr_t = torch.tensor(X[tr], dtype=torch.float32, device=device)
    Xte_t = torch.tensor(X[te], dtype=torch.float32, device=device)
    # k-means archetype labels on TRAIN only (avoid leakage), assigned to all via centroids
    _arch_lab_tr, arch_cent = kmeans(X[tr], N_ARCH, SEED)
    d_to_cent = ((X[:, None, :] - arch_cent[None]) ** 2).sum(-1)
    arch_lab = d_to_cent.argmin(1)
    arch_tr_t = torch.tensor(arch_lab[tr], dtype=torch.long, device=device)
    pos_ids = _pos_ids(pos)
    pos_tr_t = torch.tensor(pos_ids[tr], dtype=torch.long, device=device)

    model = PitchMTNN(
        fam_dims,
        n_ctx=n_ctx,
        d_emb=d_emb,
        n_feat=len(feats),
        dropout=dropout,
        d_tower=d_tower,
    ).to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=wd)
    ctx_tr = torch.tensor(ctx_ids[tr], dtype=torch.long, device=device)
    ctx_te = torch.tensor(ctx_ids[te], dtype=torch.long, device=device)
    rng = np.random.default_rng(SEED)
    best_loss, best_state, bad, patience = 1e9, None, 0, 30
    n_tr = int(tr.sum())

    def batch_fam(idx):
        xs = {f: Xtr_t[idx][:, slices[f]] for f in slices}
        ms = {f: torch.ones(len(idx), len(slices[f]), device=device) for f in slices}
        return xs, ms

    for _epoch in range(epochs):
        model.train()
        perm = rng.permutation(n_tr)
        for s in range(0, n_tr, 64):
            bi = perm[s : s + 64]
            xs, ms = batch_fam(bi)
            # family-drop augmentation (harden against missing families)
            if family_drop > 0:
                for fam in list(ms.keys()):
                    if rng.random() < family_drop:
                        ms[fam] = torch.zeros_like(ms[fam])
                        xs[fam] = torch.zeros_like(xs[fam])
            sb = ctx_tr[bi]
            ab = arch_tr_t[bi]
            opt.zero_grad()
            emb, out = model(xs, ms, sb)
            loss_arch = F.cross_entropy(out["arch"], ab)
            loss_prof = F.smooth_l1_loss(out["profile"], Xtr_t[bi])
            loss = arch_w * loss_arch + prof_w * loss_prof
            if con_w > 0:
                loss = loss + con_w * supcon_loss(emb, pos_tr_t[bi])
            loss.backward()
            opt.step()
        model.eval()
        with torch.no_grad():
            xs, ms = batch_fam(np.arange(n_tr))
            emb_v, out = model(xs, ms, ctx_tr)
            vl = (
                arch_w * F.cross_entropy(out["arch"], arch_tr_t).item()
                + prof_w * F.smooth_l1_loss(out["profile"], Xtr_t).item()
            )
            if con_w > 0:
                vl = vl + con_w * float(supcon_loss(emb_v, pos_tr_t))
        if vl < best_loss - 1e-4:
            best_loss, bad = vl, 0
            best_state = {
                k: v.detach().cpu().clone() for k, v in model.state_dict().items()
            }
        else:
            bad += 1
            if bad >= patience:
                break
    if best_state:
        model.load_state_dict(best_state)
    model.eval()

    # embeddings
    with torch.no_grad():
        xs_tr, ms_tr = batch_fam(np.arange(n_tr))
        emb_tr = model.encode(xs_tr, ms_tr, ctx_tr).cpu().numpy()
        # test batch
        xs_te = {f: Xte_t[:, slices[f]] for f in slices}
        ms_te = {
            f: torch.ones(Xte_t.shape[0], len(slices[f]), device=device) for f in slices
        }
        emb_te = model.encode(xs_te, ms_te, ctx_te).cpu().numpy()
        prof_te = model.profile_head(model.encode(xs_te, ms_te, ctx_te)).cpu().numpy()

    pos_tr_arr = pos[tr]
    pos_te_arr = pos[te]
    acc_mtnn, _ = position_cluster_acc(emb_tr, pos_tr_arr, emb_te, pos_te_arr)
    nn_mtnn = nn_role_coherence(emb_tr, pos_tr_arr, emb_te, pos_te_arr)
    knn5_mtnn = knn_position_acc(emb_tr, pos_tr_arr, emb_te, pos_te_arr)
    recon_mtnn = float(np.mean(np.abs(prof_te - X[te])))

    # PCA baseline on the SAME split — raw 16-d (full rank, the shipped comps space)
    acc_pca, _ = position_cluster_acc(X[tr], pos_tr_arr, X[te], pos_te_arr)
    nn_pca = nn_role_coherence(X[tr], pos_tr_arr, X[te], pos_te_arr)
    knn5_pca = knn_position_acc(X[tr], pos_tr_arr, X[te], pos_te_arr)
    recon_pca3 = pca_recon_mae(X[tr], X[te], k=3)
    recon_pcaD = pca_recon_mae(X[tr], X[te], k=d_emb)

    # PCA(3) — the SHIPPED pitch-game map/archetype space (the real Gate-1 bar)
    P_tr, P_te = pca_project(X[tr], X[te], k=3)
    acc_pca3, _ = position_cluster_acc(P_tr, pos_tr_arr, P_te, pos_te_arr)
    nn_pca3 = nn_role_coherence(P_tr, pos_tr_arr, P_te, pos_te_arr)
    knn5_pca3 = knn_position_acc(P_tr, pos_tr_arr, P_te, pos_te_arr)

    return {
        "n_tr": n_tr,
        "n_te": int(te.sum()),
        "pos_cluster_acc_mtnn": round(acc_mtnn, 4),
        "pos_cluster_acc_pca3": round(acc_pca3, 4),
        "pos_cluster_acc_pca16": round(acc_pca, 4),
        "knn5_pos_acc_mtnn": round(knn5_mtnn, 4),
        "knn5_pos_acc_pca3": round(knn5_pca3, 4),
        "knn5_pos_acc_pca16": round(knn5_pca, 4),
        "nn_role_mtnn": round(nn_mtnn, 4),
        "nn_role_pca3": round(nn_pca3, 4),
        "nn_role_pca16": round(nn_pca, 4),
        "recon_mae_mtnn": round(recon_mtnn, 4),
        "recon_mae_pca3": round(recon_pca3, 4),
        "recon_mae_pcaD": round(recon_pcaD, 4),
        "best_val_loss": round(best_loss, 4),
    }


# ---------------------------------------------------------------------------
# Final-model training + additive embedding export (the e_p deliverable)
# ---------------------------------------------------------------------------


def train_final_and_export(
    X, M, ctx_ids, meta, slices, fam_dims, n_ctx, feats, args, device
):
    """Train a final MTNN on ALL data (no holdout) and export the L2 embedding.

    Additive: writes assets/pitch_mtnn_embeddings.json (player -> e_p) and the
    state_dict to pipeline/data/pitch_mtnn.pt. Does NOT touch assets/vectors.json
    (the live pitch game keeps its PCA(3)+k-means(8) contract).
    """
    torch.manual_seed(SEED)
    np.random.seed(SEED)
    n = len(X)
    arch_lab, _ = kmeans(X, N_ARCH, SEED)
    Xt = torch.tensor(X, dtype=torch.float32, device=device)
    ctx_t = torch.tensor(ctx_ids, dtype=torch.long, device=device)
    arch_t = torch.tensor(arch_lab, dtype=torch.long, device=device)
    model = PitchMTNN(
        fam_dims,
        n_ctx=n_ctx,
        d_emb=args.d_emb,
        n_feat=len(feats),
        dropout=args.dropout,
        d_tower=args.d_tower,
    ).to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=args.wd)
    rng = np.random.default_rng(SEED)

    def batch_fam(idx):
        xs = {f: Xt[idx][:, slices[f]] for f in slices}
        ms = {f: torch.ones(len(idx), len(slices[f]), device=device) for f in slices}
        return xs, ms

    for _epoch in range(args.epochs):
        model.train()
        perm = rng.permutation(n)
        for s in range(0, n, 64):
            bi = perm[s : s + 64]
            xs, ms = batch_fam(bi)
            if args.family_drop > 0:
                for fam in list(ms.keys()):
                    if rng.random() < args.family_drop:
                        ms[fam] = torch.zeros_like(ms[fam])
                        xs[fam] = torch.zeros_like(xs[fam])
            opt.zero_grad()
            emb, out = model(xs, ms, ctx_t[bi])
            loss = args.arch_w * F.cross_entropy(
                out["arch"], arch_t[bi]
            ) + args.prof_w * F.smooth_l1_loss(out["profile"], Xt[bi])
            if getattr(args, "con_w", 0) > 0:
                # position ids from meta (DEF/MID/FWD)
                pos_bi = torch.tensor(
                    [POS_ORDER.get(meta[i]["pos"], 1) for i in bi],
                    dtype=torch.long,
                    device=device,
                )
                loss = loss + args.con_w * supcon_loss(emb, pos_bi)
            loss.backward()
            opt.step()
    model.eval()
    with torch.no_grad():
        xs, ms = batch_fam(np.arange(n))
        emb = model.encode(xs, ms, ctx_t).cpu().numpy()

    torch.save(
        {
            "state_dict": model.state_dict(),
            "config": {
                "d_emb": args.d_emb,
                "d_tower": args.d_tower,
                "fam_dims": fam_dims,
                "n_ctx": n_ctx,
                "n_feat": len(feats),
                "dropout": args.dropout,
                "families": list(fam_dims),
            },
        },
        DATA / "pitch_mtnn.pt",
    )
    rows = [
        {
            "player_id": m["player_id"],
            "name": m["name"],
            "team": m["team"],
            "pos": m["pos"],
            "context": m["context"],
            "minutes": m["minutes"],
            "e_p": [round(float(v), 5) for v in emb[i]],
        }
        for i, m in enumerate(meta)
    ]
    out = {
        "built": time.strftime("%Y-%m-%d"),
        "model": "PitchMTNN v1",
        "d_emb": args.d_emb,
        "n_players": n,
        "contexts": sorted({m["context"] for m in meta}),
        "config": {
            "arch_w": args.arch_w,
            "prof_w": args.prof_w,
            "con_w": getattr(args, "con_w", 0.0),
            "dropout": args.dropout,
            "wd": args.wd,
            "family_drop": args.family_drop,
        },
        "players": rows,
    }
    ASSETS.mkdir(parents=True, exist_ok=True)
    (ASSETS / "pitch_mtnn_embeddings.json").write_text(
        json.dumps(out, separators=(",", ":")), encoding="utf-8"
    )
    print(
        f"exported {n} embeddings (d_emb={args.d_emb}) "
        f"-> assets/pitch_mtnn_embeddings.json | state_dict -> pipeline/data/pitch_mtnn.pt"
    )
    # sanity: every embedding is unit-norm
    norms = np.linalg.norm(emb, axis=1)
    assert np.allclose(norms, 1.0, atol=1e-4), (
        f"embeddings not L2-normalized: min={norms.min():.4f} max={norms.max():.4f}"
    )
    return out


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=200)
    ap.add_argument("--d-emb", type=int, default=24)
    ap.add_argument("--d-tower", type=int, default=16)
    ap.add_argument("--family-drop", type=float, default=0.15)
    ap.add_argument(
        "--arch-w", type=float, default=1.0, help="archetype CE loss weight"
    )
    ap.add_argument(
        "--prof-w", type=float, default=0.5, help="profile recon loss weight"
    )
    ap.add_argument(
        "--con-w",
        type=float,
        default=0.0,
        help="SupCon weight on position labels (0=off; try 0.5 to close PCA16 oracle gap)",
    )
    ap.add_argument("--dropout", type=float, default=0.2)
    ap.add_argument("--wd", type=float, default=1e-3, help="AdamW weight decay")
    ap.add_argument("--lr", type=float, default=2e-3)
    ap.add_argument(
        "--matrix",
        type=str,
        default="train_matrix.npz",
        help="matrix file in pipeline/data to train on",
    )
    ap.add_argument(
        "--save-final",
        action="store_true",
        help="train a final model on ALL data + export e_p embedding to assets/",
    )
    ap.add_argument(
        "--phase",
        choices=("select", "final-refit", "auto"),
        default="select",
        help="select=LOO CV metrics; final-refit=all-data export; "
        "auto=CV then save-final if beats PCA(3) on >=2/4 metrics",
    )
    ap.add_argument(
        "--skip-cv",
        action="store_true",
        help="skip leave-one-context-out CV (use with --save-final for export-only)",
    )
    ap.add_argument(
        "--tag",
        type=str,
        default="",
        help="optional report suffix (writes {stem}_{tag}_report.json)",
    )
    args = ap.parse_args()
    t0 = time.time()
    torch.manual_seed(SEED)
    np.random.seed(SEED)

    npz = np.load(DATA / args.matrix, allow_pickle=True)
    X = npz["X"]
    M = npz["M"]
    ctx_ids = npz["ctx_ids"]
    stem = args.matrix.replace(".npz", "")
    manifest = json.loads(
        (DATA / f"feature_manifest_{stem}.json").read_text(encoding="utf-8")
    )
    meta = json.loads((DATA / f"meta_{stem}.json").read_text(encoding="utf-8"))
    feats = manifest["features"]
    families = manifest["family_lists"]
    fam_dims = {fam: len(cols) for fam, cols in families.items()}
    slices = family_slices(feats, families)
    n_ctx = int(manifest["n_contexts"])
    np.array([POS_ORDER.get(m["pos"], 1) for m in meta])  # 0/1/2 -> DEF/MID/FWD
    pos_str = np.array([m["pos"] for m in meta])
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"matrix X={X.shape} | contexts={manifest['contexts']} | device={device}")
    print(f"families={list(fam_dims)} | d_emb={args.d_emb} | epochs={args.epochs}")

    # export-only path: skip leave-one-context-out CV, go straight to the final model
    if args.skip_cv:
        if args.save_final:
            print("\n-- final model on ALL data + export e_p (CV skipped) --")
            train_final_and_export(
                X, M, ctx_ids, meta, slices, fam_dims, n_ctx, feats, args, device
            )
        else:
            print("--skip-cv without --save-final: nothing to do")
        return 0

    # leave-one-context-out
    uniq_ctx = sorted(set(ctx_ids.tolist()))
    folds = []
    for hold in uniq_ctx:
        tr = ctx_ids != hold
        te = ctx_ids == hold
        if tr.sum() < 40 or te.sum() < 20:
            continue
        print(
            f"\n-- fold: hold context {manifest['contexts'][hold]} "
            f"(tr={int(tr.sum())}, te={int(te.sum())}) --"
        )
        r = train_fold(
            X,
            M,
            ctx_ids,
            pos_str,
            slices,
            fam_dims,
            n_ctx,
            feats,
            tr,
            te,
            device,
            args.epochs,
            args.d_emb,
            args.family_drop,
            arch_w=args.arch_w,
            prof_w=args.prof_w,
            con_w=args.con_w,
            dropout=args.dropout,
            wd=args.wd,
            lr=args.lr,
            d_tower=args.d_tower,
        )
        r["hold_context"] = manifest["contexts"][hold]
        folds.append(r)
        print(
            f"  pos-cluster acc: MTNN {r['pos_cluster_acc_mtnn']} | "
            f"PCA(3) {r['pos_cluster_acc_pca3']} (shipped) | PCA(16) {r['pos_cluster_acc_pca16']}"
        )
        print(
            f"  knn5 pos-acc:    MTNN {r['knn5_pos_acc_mtnn']} | "
            f"PCA(3) {r['knn5_pos_acc_pca3']} | PCA(16) {r['knn5_pos_acc_pca16']}"
        )
        print(
            f"  NN role: MTNN {r['nn_role_mtnn']} | "
            f"PCA(3) {r['nn_role_pca3']} | PCA(16) {r['nn_role_pca16']}"
        )
        print(
            f"  recon MAE: MTNN {r['recon_mae_mtnn']} | PCA(3) {r['recon_mae_pca3']} | "
            f"PCA({args.d_emb}) {r['recon_mae_pcaD']}"
        )

    if not folds:
        raise SystemExit("no valid folds (too few rows per context)")

    def avg(key):
        return round(float(np.mean([f[key] for f in folds])), 4)

    summary = {
        "built": time.strftime("%Y-%m-%d"),
        "matrix": args.matrix,
        "config": {
            "d_emb": args.d_emb,
            "d_tower": args.d_tower,
            "arch_w": args.arch_w,
            "prof_w": args.prof_w,
            "con_w": args.con_w,
            "dropout": args.dropout,
            "wd": args.wd,
            "lr": args.lr,
            "family_drop": args.family_drop,
            "epochs": args.epochs,
        },
        "n_rows": len(X),
        "n_contexts": n_ctx,
        "contexts": manifest["contexts"],
        "d_emb": args.d_emb,
        "epochs": args.epochs,
        "family_drop": args.family_drop,
        "device": str(device),
        "n_folds": len(folds),
        "pos_cluster_acc_mtnn": avg("pos_cluster_acc_mtnn"),
        "pos_cluster_acc_pca3": avg("pos_cluster_acc_pca3"),
        "pos_cluster_acc_pca16": avg("pos_cluster_acc_pca16"),
        "knn5_pos_acc_mtnn": avg("knn5_pos_acc_mtnn"),
        "knn5_pos_acc_pca3": avg("knn5_pos_acc_pca3"),
        "knn5_pos_acc_pca16": avg("knn5_pos_acc_pca16"),
        "nn_role_mtnn": avg("nn_role_mtnn"),
        "nn_role_pca3": avg("nn_role_pca3"),
        "nn_role_pca16": avg("nn_role_pca16"),
        "recon_mae_mtnn": avg("recon_mae_mtnn"),
        "recon_mae_pca3": avg("recon_mae_pca3"),
        "recon_mae_pcaD": avg("recon_mae_pcaD"),
        "beats_pca3_pos_cluster": avg("pos_cluster_acc_mtnn")
        > avg("pos_cluster_acc_pca3"),
        "beats_pca3_knn5": avg("knn5_pos_acc_mtnn") > avg("knn5_pos_acc_pca3"),
        "beats_pca3_nn_role": avg("nn_role_mtnn") > avg("nn_role_pca3"),
        "beats_pca3_recon": avg("recon_mae_mtnn") < avg("recon_mae_pca3"),
        "beats_pca3_count": int(
            sum(
                [
                    avg("pos_cluster_acc_mtnn") > avg("pos_cluster_acc_pca3"),
                    avg("knn5_pos_acc_mtnn") > avg("knn5_pos_acc_pca3"),
                    avg("nn_role_mtnn") > avg("nn_role_pca3"),
                    avg("recon_mae_mtnn") < avg("recon_mae_pca3"),
                ]
            )
        ),
        "folds": folds,
        "elapsed_s": round(time.time() - t0, 1),
    }
    DATA.mkdir(parents=True, exist_ok=True)
    report_stem = args.matrix.replace(".npz", "")
    if args.tag:
        report_stem = f"{report_stem}_{args.tag}"
    (DATA / f"{report_stem}_report.json").write_text(
        json.dumps(summary, indent=2), encoding="utf-8"
    )
    print("\n=== SUMMARY (MTNN vs PCA, leave-one-context-out) ===")
    print(
        f"  pos-cluster acc: MTNN {summary['pos_cluster_acc_mtnn']} | "
        f"PCA(3) {summary['pos_cluster_acc_pca3']} (shipped) | "
        f"PCA(16) {summary['pos_cluster_acc_pca16']} -> "
        f"{'BEATS' if summary['beats_pca3_pos_cluster'] else 'LOSES'}"
    )
    print(
        f"  knn5 pos-acc:    MTNN {summary['knn5_pos_acc_mtnn']} | "
        f"PCA(3) {summary['knn5_pos_acc_pca3']} | "
        f"PCA(16) {summary['knn5_pos_acc_pca16']} -> "
        f"{'BEATS' if summary['beats_pca3_knn5'] else 'LOSES'}"
    )
    print(
        f"  NN role:         MTNN {summary['nn_role_mtnn']} | "
        f"PCA(3) {summary['nn_role_pca3']} | PCA(16) {summary['nn_role_pca16']} -> "
        f"{'BEATS' if summary['beats_pca3_nn_role'] else 'LOSES'}"
    )
    print(
        f"  recon MAE:       MTNN {summary['recon_mae_mtnn']} | PCA(3) {summary['recon_mae_pca3']} | "
        f"PCA({args.d_emb}) {summary['recon_mae_pcaD']} -> "
        f"{'BEATS' if summary['beats_pca3_recon'] else 'LOSES'}"
    )
    print(
        f"  VERDICT: beats shipped PCA(3) on {summary['beats_pca3_count']}/4 metrics | "
        f"{summary['n_folds']} folds, {summary['elapsed_s']}s"
    )
    summary["metrics_source"] = "leave_one_context_out"
    want_final = args.save_final or args.phase == "final-refit"
    if args.phase == "auto":
        want_final = summary["beats_pca3_count"] >= 2
        if want_final:
            print("  auto: promote (≥2/4 vs PCA) — running final-refit on ALL data")
        else:
            print(
                "  auto: did not beat PCA on ≥2/4 — skipping final-refit / assets export"
            )
    if want_final:
        print("\n-- final model on ALL data + export e_p --")
        summary["deploy"] = {
            "mode": "final_refit_all_data",
            "metrics_source": "leave_one_context_out",
            "note": "CV metrics are held-out; shipped e_p is full-corpus refit.",
        }
        (DATA / f"{report_stem}_report.json").write_text(
            json.dumps(summary, indent=2), encoding="utf-8"
        )
        train_final_and_export(
            X, M, ctx_ids, meta, slices, fam_dims, n_ctx, feats, args, device
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
