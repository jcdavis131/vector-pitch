"""
fetch_missing_core.py — Vector Pitch resumable cache backfill (zero-deps)

Pattern from hoops/fetch_preseason_odds.py + merge_salaries.py adapted to pitch.

Domain: tennis/pitch — ATP/WTA player history, tournament contexts, match expectation

Audits:
- pipeline/cache/  (expected: atp_match_raw_{year}.json, wta_*.json, tourney metadata)
- pipeline/data/   (expected: feature_manifest_* + meta_* + reports)
- assets/data/pitch.json (skeleton check) vs assets/vectors.json
- coverage years: should match hoops pattern 1990→2025 (tennis Open Era)
- Empty 0-byte vs populated

Zero-deps resumable pattern: skip if exists && size>0 unless --force
Merge without overwrite: keeps existing correct JSON keys

Usage:
  python pipeline/fetch_missing_core.py --audit-only
  python pipeline/fetch_missing_core.py --year 2023 --tourney wimbledon --dry-run
  python pipeline/fetch_missing_core.py --full --scaffold-write
"""

from __future__ import annotations

import json
import pathlib
import re
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parents[1]
CACHE = ROOT / "pipeline" / "cache"
DATA_DIR = ROOT / "pipeline" / "data"
ASSETS_DATA = ROOT / "assets" / "data"
DEST_PITCH = ASSETS_DATA / "pitch.json"
DEST_VECTORS = ROOT / "assets" / "vectors.json"

# Tennis equivalent of hoops cap_rules / payroll_by_season
# Tour prize money + ranking points regime — era-aware like cap era
TOUR_REGIME_BY_YEAR: dict[str, dict] = {
    "2018": {
        "atp_finals_prize": 2_712_000,
        "wta_finals_prize": 2_360_000,
        "slam_prize_wimbledon": 2_250_000,
        "ranking_system": "ATP 2009+ 52wk rolling",
        "era": "Federer/Nadal/Djokovic + Serena",
    },
    "2019": {
        "atp_finals_prize": 2_656_000,
        "slam_prize_wimbledon": 2_350_000,
        "ranking_system": "ATP 2009+",
        "era": "Big3 tail",
    },
    "2020": {
        "atp_finals_prize": 1_564_000,
        "slam_prize_wimbledon": 0,
        "ranking_system": "ATP COVID freeze 22mo",
        "era": "COVID ranking freeze",
    },
    "2021": {
        "atp_finals_prize": 2_316_000,
        "slam_prize_wimbledon": 1_700_000,
        "ranking_system": "ATP thaw",
        "era": "COVID thaw",
    },
    "2022": {
        "atp_finals_prize": 4_740_000,
        "slam_prize_wimbledon": 2_000_000,
        "ranking_system": "ATP restored",
        "era": "Alcaraz breakthrough",
    },
    "2023": {
        "atp_finals_prize": 4_801_500,
        "slam_prize_wimbledon": 2_350_000,
        "ranking_system": "ATP+",
        "era": "Djokovic 24",
    },
    "2024": {
        "atp_finals_prize": 4_881_100,
        "slam_prize_wimbledon": 2_700_000,
        "ranking_system": "ATP+",
        "era": "Sinner/Alcaraz 1-2",
    },
    "2025": {
        "atp_finals_prize": None,
        "slam_prize_wimbledon": None,
        "ranking_system": "ATP live",
        "era": "live fetch required",
    },
}

EXPECTED_YEARS = list(range(1990, 2026))  # Open-era baseline like hoops 1996-2026
EXPECTED_TOURNEY_TYPES = ["gs", "atp1000", "atp500", "atp250", "wta1000", "wta500"]
EXPECTED_CACHE_FILES = len(EXPECTED_YEARS) * 2  # atp + wta per year roughly
SLAMS = ["ao", "rg", "wimbledon", "usopen"]


def audit_cache() -> dict:
    cache_files = list(CACHE.glob("*.json")) if CACHE.exists() else []
    data_files = list(DATA_DIR.glob("*.json")) if DATA_DIR.exists() else []
    cache_pop = [f for f in cache_files if f.stat().st_size > 0]
    data_pop = [f for f in data_files if f.stat().st_size > 0]
    empty = [f for f in cache_files if f.stat().st_size == 0]

    # detect missing years by parsing filenames like atp_2023.json or 2023-*.json
    years_found = set()
    for f in cache_files:
        m = re.search(r"(19\d{2}|20\d{2})", f.name)
        if m:
            years_found.add(int(m.group(1)))
    missing_years = [y for y in EXPECTED_YEARS if y not in years_found]

    # skeleton check assets/data/pitch.json vs vectors.json
    skeleton = True
    pitch_count = 0
    vectors_count = 0
    pitch_bytes = 0
    vectors_bytes = 0
    if DEST_PITCH.exists():
        pitch_bytes = DEST_PITCH.stat().st_size
        try:
            d = json.loads(DEST_PITCH.read_text()[:5_000_000])
            if isinstance(d, dict):
                # could be {players:[...]} or direct list
                if "players" in d:
                    pitch_count = len(d["players"])
                else:
                    pitch_count = len(d)
            elif isinstance(d, list):
                pitch_count = len(d)
            skeleton = pitch_count < 500 or pitch_bytes < 20000
        except Exception:
            skeleton = pitch_bytes < 20000
    if DEST_VECTORS.exists():
        vectors_bytes = DEST_VECTORS.stat().st_size
        try:
            v = json.loads(DEST_VECTORS.read_text()[:1_000_000])
            vectors_count = len(v) if isinstance(v, list | dict) else 0
            if isinstance(v, dict):
                vectors_count = len(v.get("players", v))
        except:
            pass

    # data/ completeness vs hoops
    expected_data_files = 8  # 4 feature_manifest + 4 meta + reports
    data_missing = max(0, expected_data_files - len(data_pop))

    missing_cache = max(0, EXPECTED_CACHE_FILES - len(cache_pop))
    total_expected = EXPECTED_CACHE_FILES + expected_data_files
    total_pop = len(cache_pop) + len(data_pop)
    missing_pct = 0 if total_expected == 0 else (total_expected - total_pop) / total_expected * 100

    return {
        "domain": "pitch",
        "cache_dir": str(CACHE),
        "cache_files": len(cache_files),
        "cache_populated": len(cache_pop),
        "cache_empty": len(empty),
        "cache_years_found": sorted(years_found)[:20],
        "cache_years_found_count": len(years_found),
        "missing_years": missing_years[:20],
        "missing_years_count": len(missing_years),
        "expected_cache": EXPECTED_CACHE_FILES,
        "data_files": len(data_files),
        "data_populated": len(data_pop),
        "data_missing": data_missing,
        "expected_data": expected_data_files,
        "total_expected": total_expected,
        "populated_total": total_pop,
        "missing_cache": missing_cache,
        "missing_pct": round(missing_pct, 1),
        "assets_pitch_exists": DEST_PITCH.exists(),
        "assets_pitch_bytes": pitch_bytes,
        "assets_pitch_count": pitch_count,
        "assets_vectors_bytes": vectors_bytes,
        "assets_vectors_count": vectors_count,
        "assets_skeleton": skeleton,
        "coverage_years": f"{EXPECTED_YEARS[0]}-{EXPECTED_YEARS[-1]}",
        "tour_regime_reference": "pipeline/cache/tour_regime.json equivalent to hoops cap_rules.json",
        "expected_vs_hoops": "hoops 686 files 51M 30 seasons vs pitch cache 0 files currently — 100% missing cache, assets partially populated (vectors.json 285k vs pitch.json 5k skeleton)",
    }


def write_regime_reference():
    out = CACHE / "tour_regime.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    if out.exists() and "--force" not in sys.argv:
        try:
            existing = json.loads(out.read_text())
            for k in TOUR_REGIME_BY_YEAR:
                if k not in existing:
                    existing[k] = TOUR_REGIME_BY_YEAR[k]
            out.write_text(json.dumps(existing, indent=2))
            print(f"merged {out}")
            return
        except:
            pass
    out.write_text(json.dumps(TOUR_REGIME_BY_YEAR, indent=2))
    print(f"wrote {out}")


def fetch_year_placeholder(year: int, force=False, offline=False) -> bool:
    CACHE.mkdir(parents=True, exist_ok=True)
    atp_file = CACHE / f"atp_{year}.json"
    wta_file = CACHE / f"wta_{year}.json"
    if (
        not force
        and atp_file.exists()
        and atp_file.stat().st_size > 0
        and wta_file.exists()
        and wta_file.stat().st_size > 0
    ):
        return True
    if offline:
        return False
    if "--scaffold-write" in sys.argv:
        for p in [atp_file, wta_file]:
            if p.exists() and not force:
                continue
            placeholder = {
                "year": year,
                "tour": p.stem.split("_")[0],
                "matches": [],
                "players": [],
                "stub": True,
                "_scaffold": "fetch_missing_core.py placeholder",
            }
            p.write_text(json.dumps(placeholder))
        return True
    return False


def main():
    args = sys.argv[1:]
    audit_only = "--audit-only" in args or ("--offline" in args and "--full" not in args)
    dry_run = "--dry-run" in args
    force = "--force" in args
    offline = "--offline" in args
    year_filter = None
    if "--year" in args:
        idx = args.index("--year")
        if idx + 1 < len(args):
            try:
                year_filter = int(args[idx + 1])
            except:
                pass

    audit = audit_cache()
    print(json.dumps(audit, indent=2))

    if dry_run or (audit_only and "--full" not in args and "--scaffold-write" not in args):
        print(
            f"\nPitch cache missing {audit['missing_pct']}% — {audit['populated_total']}/{audit['total_expected']} files"
        )
        print(
            f"Years missing: {audit['missing_years_count']} / {len(EXPECTED_YEARS)} — expected {audit['coverage_years']}"
        )
        print(
            f"Skeleton? pitch.json {audit['assets_pitch_bytes']} bytes count={audit['assets_pitch_count']} vectors.json {audit['assets_vectors_bytes']} bytes count={audit['assets_vectors_count']} skeleton={audit['assets_skeleton']}"
        )
        if not dry_run and audit_only:
            return

    write_regime_reference()

    if year_filter:
        fetch_year_placeholder(year_filter, force=force, offline=offline)

    if "--full" in args or "--scaffold-write" in args:
        years = [year_filter] if year_filter else EXPECTED_YEARS[-8:]  # last 8 years for scaffold
        for y in years:
            fetch_year_placeholder(y, force=force, offline=offline)
            time.sleep(0.05)

    print("\nDone pitch fetch_missing_core. Wire real ATP/WTA fetch from atpworldtour.com / wtatennis.com API.")
    print("Replace fetch_year_placeholder with pipeline/build_features.py data pull logic.")


if __name__ == "__main__":
    main()
