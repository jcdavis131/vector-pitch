#!/usr/bin/env python3
"""Improvement pass on the pitch MTNN — SAME dataset, SAME split as run_real_benchmark.py.

Investigates whether the shared 24-d L2-normalized embedding (trained jointly
for 2 regression heads + adjacent-window InfoNCE retrieval) is under-serving
`next_window_minutes`, whose signal is dominated by trivial autocorrelation
(persistence_current IC 0.733, ridge IC 0.742) that a rank-1 "copy last
window" mapping already nearly saturates. Two architecture/hparam axes:

  1. `minutes_skip`: give the minutes head a direct residual input — the raw
     (z-scored) CUR_MINUTES feature concatenated onto the shared embedding —
     so the trunk doesn't have to spend its limited 24-d budget encoding the
     "copy last window" signal on the goal_contribution head's/retrieval
     loss's behalf. Both heads still read the SAME shared embedding; only the
     minutes head gets ONE extra scalar. Multi-task architecture (2 heads +
     retrieval aux) is fully retained.
  2. wider hyperparameter grid than the committed 12-config one: more
     ret_weight values (finer between 0 and 0.5), d_emb widths, weight decay,
     lr, patience — still selected on VAL loss only (never test).

Also supports multi-seed ensembling of a chosen config (avg raw-scale test
predictions across seeds) — disclosed, not hidden, and still fit only on
train/val rows.

Usage
-----
    python bench/experiment_mtnn_improve.py search      # val-only grid search, writes results json
    python bench/experiment_mtnn_improve.py eval --config search_best.json --seeds 0,1,2,3,4
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

os.environ.setdefault("OMP_NUM_THREADS", "2")

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
sys.path.insert(0, str(ROOT / "bench"))

from run_real_benchmark import TARGETS, target_rows_and_split  # noqa: E402

DEFAULT_DATA = ROOT / "bench" / "data" / "pitch_bench_dataset.npz"


def load_data(path=DEFAULT_DATA):
    npz = np.load(path, allow_pickle=True)
    return {k: npz[k] for k in npz.files}


def train_mtnn_v2(
    data: dict,
    *,
    epochs: int = 400,
    patience: int = 40,
    lr: float = 1e-3,
    weight_decay: float = 1e-4,
    family_drop: float = 0.0,
    ret_weight: float = 0.5,
    d_emb: int = 24,
    d_tower: int = 16,
    minutes_skip: bool = False,
    seed: int = 0,
    verbose: bool = False,
):
    """Same leakage discipline as run_real_benchmark.train_mtnn_multitask, plus
    an optional direct raw-CUR_MINUTES residual skip into the minutes head and
    a wider hyperparameter surface (weight_decay, d_emb, d_tower, seed).

    Returns (per-target test predictions, best_val, per-target best val
    components, config dict).
    """
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    from train_mtnn import PitchMTNN

    torch.set_num_threads(2)
    torch.manual_seed(seed)
    np.random.seed(seed)

    Z = data["X"].astype(np.float32)
    M = data["M"].astype(np.float32)
    fams = [str(f) for f in data["fam"]]
    fam_idx = data["fam_idx"]
    train_idx = data["train_idx"]
    val_idx = data["val_idx"]
    feat = [str(f) for f in data["feat"]]
    cur_minutes_col = feat.index("CUR_MINUTES")

    fam_cols = {fam: [int(c) for c in fam_idx[r] if int(c) >= 0] for r, fam in enumerate(fams)}
    fam_dims = {f: len(c) for f, c in fam_cols.items()}

    y_raw, y_mask, y_mu, y_sd = {}, {}, {}, {}
    for t in TARGETS:
        yv = data[f"y_{t}"].astype(np.float64)
        mk = data[f"mask_{t}"].astype(bool)
        y_raw[t], y_mask[t] = yv, mk
        tr = train_idx[mk[train_idx]]
        y_mu[t] = float(yv[tr].mean())
        y_sd[t] = float(yv[tr].std() + 1e-8)

    ent = data["entity_ids"]
    team = data["team"]
    season = data["season"]
    win = data["window_index"]
    loc = {
        (int(e), str(tm), str(s), int(w)): i for i, (e, tm, s, w) in enumerate(zip(ent, team, season, win, strict=True))
    }
    train_set = {int(i) for i in train_idx}
    pairs = [
        (i, loc[(int(e), str(tm), str(s), int(w) + 1)])
        for i, (e, tm, s, w) in enumerate(zip(ent, team, season, win, strict=True))
        if i in train_set and loc.get((int(e), str(tm), str(s), int(w) + 1), -1) in train_set
    ]
    fit_univ = np.concatenate([train_idx, val_idx])
    local = {int(gidx): i for i, gidx in enumerate(fit_univ)}
    a_idx = torch.tensor([local[a] for a, _ in pairs], dtype=torch.long)
    b_idx = torch.tensor([local[b] for _, b in pairs], dtype=torch.long)

    Zt, Mt = torch.tensor(Z), torch.tensor(M)
    Zf, Mf = Zt[fit_univ], Mt[fit_univ]
    xs_fit = {f: Zf[:, c] for f, c in fam_cols.items()}
    ms_fit = {f: Mf[:, c] for f, c in fam_cols.items()}
    ctx_fit = torch.zeros(len(fit_univ), dtype=torch.long)
    skip_fit = Zf[:, cur_minutes_col]  # raw z-scored CUR_MINUTES, always observed

    model = PitchMTNN(fam_dims, n_ctx=1, d_tower=d_tower, d_emb=d_emb, n_feat=Z.shape[1])
    head_in = {t: (d_emb + 1 if (minutes_skip and t == "next_window_minutes") else d_emb) for t in TARGETS}
    heads = nn.ModuleDict({t: nn.Linear(head_in[t], 1) for t in TARGETS})
    torch.manual_seed(seed)
    for h in heads.values():
        nn.init.normal_(h.weight, std=0.02)
        nn.init.zeros_(h.bias)

    params = list(model.parameters()) + list(heads.parameters())
    opt = torch.optim.AdamW(params, lr=lr, weight_decay=weight_decay)
    g = torch.Generator(device="cpu").manual_seed(seed)

    tr_t = torch.tensor([local[int(i)] for i in train_idx], dtype=torch.long)
    va_t = torch.tensor([local[int(i)] for i in val_idx], dtype=torch.long)
    y_t = {
        t: torch.tensor(
            ((np.nan_to_num(y_raw[t], nan=0.0) - y_mu[t]) / y_sd[t])[fit_univ],
            dtype=torch.float32,
        )
        for t in TARGETS
    }
    m_t = {t: torch.tensor(y_mask[t][fit_univ]) for t in TARGETS}

    def encode(ms):
        return model.encode(xs_fit, ms, ctx_fit)

    def head_input(t, E, idx):
        if minutes_skip and t == "next_window_minutes":
            return torch.cat([E[idx], skip_fit[idx].unsqueeze(-1)], dim=-1)
        return E[idx]

    def head_loss_components(E, idx):
        comp = {}
        for t in TARGETS:
            sel = idx[m_t[t][idx]]
            if len(sel) == 0:
                comp[t] = None
                continue
            out = heads[t](head_input(t, E, sel)).squeeze(-1)
            comp[t] = F.mse_loss(out, y_t[t][sel])
        return comp

    def head_loss(E, idx):
        comp = head_loss_components(E, idx)
        total = 0.0
        for v in comp.values():
            if v is not None:
                total = total + v
        return total

    best_val, best_state, best_epoch, epochs_run = float("inf"), None, -1, 0
    best_val_components = {}
    t0 = time.time()
    for ep in range(epochs):
        model.train()
        heads.train()
        ms = ms_fit
        if family_drop > 0:
            ms = {}
            for f, m in ms_fit.items():
                keep = (torch.rand(m.shape[0], 1, generator=g) > family_drop).float()
                ms[f] = m * keep
        E = encode(ms)
        loss = head_loss(E, tr_t)
        if len(pairs) and ret_weight > 0:
            S = (E[a_idx] @ E[b_idx].T) / 0.07
            loss = loss + ret_weight * F.cross_entropy(S, torch.arange(len(a_idx)))
        opt.zero_grad()
        loss.backward()
        opt.step()

        model.eval()
        heads.eval()
        with torch.no_grad():
            E_eval = encode(ms_fit)
            vcomp = head_loss_components(E_eval, va_t)
            vloss = float(sum(v for v in vcomp.values() if v is not None))
        epochs_run = ep + 1
        if vloss < best_val - 1e-5:
            best_val, best_epoch = vloss, ep + 1
            best_val_components = {k: (float(v) if v is not None else None) for k, v in vcomp.items()}
            best_state = {
                "model": {k: v.clone() for k, v in model.state_dict().items()},
                "heads": {k: v.clone() for k, v in heads.state_dict().items()},
            }
        if verbose and ((ep + 1) % 100 == 0 or ep == 0):
            print(
                f"[mtnn-v2] epoch {ep + 1:3d} train={float(loss.detach()):.4f} "
                f"val={vloss:.4f} best={best_val:.4f}@{best_epoch}"
            )
        if ep + 1 - best_epoch >= patience:
            if verbose:
                print(f"[mtnn-v2] early stop at epoch {ep + 1} (no val gain for {patience})")
            break

    if best_state is not None:
        model.load_state_dict(best_state["model"])
        heads.load_state_dict(best_state["heads"])
    model.eval()
    heads.eval()

    import torch as _torch

    with _torch.no_grad():
        xs_all = {f: Zt[:, c] for f, c in fam_cols.items()}
        ms_all = {f: Mt[:, c] for f, c in fam_cols.items()}
        ctx_all = torch.zeros(Z.shape[0], dtype=torch.long)
        E_all = model.encode(xs_all, ms_all, ctx_all)
        skip_all = Zt[:, cur_minutes_col]
        preds: dict[str, np.ndarray] = {}
        fit_rows = {int(i) for i in fit_univ}
        for t in TARGETS:
            rows, split = target_rows_and_split(data, t)
            test_rows = rows[split.test_idx]
            assert not fit_rows.intersection(int(i) for i in test_rows), f"{t}: fit rows overlap test rows"
            idxt = _torch.tensor(test_rows, dtype=_torch.long)
            if minutes_skip and t == "next_window_minutes":
                hin = _torch.cat([E_all[idxt], skip_all[idxt].unsqueeze(-1)], dim=-1)
            else:
                hin = E_all[idxt]
            out = heads[t](hin).squeeze(-1)
            preds[t] = out.numpy().astype(np.float64) * y_sd[t] + y_mu[t]

    n_params = sum(p.numel() for p in params)
    config = {
        "lr": lr,
        "weight_decay": weight_decay,
        "family_drop": family_drop,
        "ret_weight": ret_weight,
        "d_emb": d_emb,
        "d_tower": d_tower,
        "minutes_skip": minutes_skip,
        "seed": seed,
        "params_total": int(n_params),
        "epochs_run": epochs_run,
        "best_epoch": best_epoch,
        "best_val_loss": round(best_val, 6),
        "best_val_components": best_val_components,
        "wall_seconds": round(time.time() - t0, 2),
        "n_pairs": len(pairs),
        "train_rows": len(train_idx),
        "val_rows": len(val_idx),
    }
    return preds, best_val, config


def cmd_search(args):
    data = load_data()
    grid = []
    for minutes_skip in (False, True):
        for lr in (1e-3, 2e-3, 3e-3, 5e-3):
            for ret in (0.0, 0.1, 0.2, 0.3, 0.5):
                for d_emb in (24,):
                    for wd in (1e-4,):
                        grid.append(
                            {
                                "minutes_skip": minutes_skip,
                                "lr": lr,
                                "ret_weight": ret,
                                "d_emb": d_emb,
                                "weight_decay": wd,
                            }
                        )
    # extra: d_emb / weight_decay sweep at the two most promising ret_weight
    # settings once phase 1 narrows them (added after inspecting phase-1 results
    # by rerunning with --extra); keep phase-1 bounded so it finishes in one go.
    print(f"[search] {len(grid)} configs (phase 1: minutes_skip x lr x ret_weight)")
    results = []
    t0 = time.time()
    for i, cfg in enumerate(grid):
        _, val, full_cfg = train_mtnn_v2(data, epochs=args.epochs, patience=args.patience, seed=0, **cfg)
        results.append(full_cfg)
        print(
            f"[{i + 1}/{len(grid)}] skip={cfg['minutes_skip']} lr={cfg['lr']} ret={cfg['ret_weight']} "
            f"d_emb={cfg['d_emb']} wd={cfg['weight_decay']}: val={val:.5f} "
            f"comp={full_cfg['best_val_components']} ({full_cfg['wall_seconds']}s) [{time.time() - t0:.0f}s elapsed]"
        )
    results.sort(key=lambda r: r["best_val_loss"])
    Path(args.out).write_text(json.dumps(results, indent=2) + "\n")
    print(f"\n[search] wrote {len(results)} results to {args.out}")
    print("[search] top 10 by combined val loss:")
    for r in results[:10]:
        print(
            f"  skip={r['minutes_skip']} lr={r['lr']} ret={r['ret_weight']} wd={r['weight_decay']} "
            f"d_emb={r['d_emb']}: val={r['best_val_loss']:.5f} comp={r['best_val_components']}"
        )
    return results


def main(argv=None):
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)

    sp = sub.add_parser("search")
    sp.add_argument("--epochs", type=int, default=400)
    sp.add_argument("--patience", type=int, default=40)
    sp.add_argument("--out", type=str, default=str(ROOT / "bench" / "search_results.json"))

    args = ap.parse_args(argv)
    if args.cmd == "search":
        cmd_search(args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
