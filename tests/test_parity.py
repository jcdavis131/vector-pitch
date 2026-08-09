import json
import pathlib

root = pathlib.Path()


def test_html_exist_and_200():
    for f in [
        "index.html",
        "play.html",
        "model.html",
        "players.html",
        "methods.html",
        "trends.html",
        "leaderboard.html",
        "offline.html",
    ]:
        p = root / f
        assert p.exists(), f"missing {f}"
        txt = p.read_text()
        assert len(txt) > 500, f"{f} too small"
        assert "<nav" in txt, f"{f} missing nav"


def test_manifest():
    j = json.loads((root / "manifest.json").read_text())
    assert j["display"] == "standalone"
    assert "#0A1510" in json.dumps(j) or j.get("theme_color") == "#0A1510"


def test_sw():
    sw = (root / "sw.js").read_text()
    assert "CORE" in sw
    assert "DENY_CACHE" in sw
    assert "v66" in sw
    assert "vector-pitch-v66" in sw


def test_offline():
    assert (root / "offline.html").exists()


def test_site_nav_brand():
    txt = (root / "assets/site-nav.js").read_text()
    assert "VECTOR" in txt and "PITCH" in txt
    assert "LINKS" in txt


def test_no_todo():
    for p in root.rglob("*.html"):
        txt = p.read_text()
        assert "TODO" not in txt and "FIXME" not in txt
    for p in (root / "assets").glob("*.js"):
        txt = p.read_text()
        # allow TODO in comments? task says 0 TODO/FIXME
        assert "TODO" not in txt and "FIXME" not in txt


def test_data_active_8_8():
    count = 0
    for f in [
        "index.html",
        "model.html",
        "players.html",
        "methods.html",
        "trends.html",
        "leaderboard.html",
        "offline.html",
        "dashboard.html",
    ]:
        p = root / f
        if not p.exists():
            continue
        txt = p.read_text()
        if "data-active=" in txt:
            count += 1
    assert count >= 8, f"data-active count {count} <8"


def test_play_daily_pack_sharedmap():
    txt = (root / "play.html").read_text()
    assert "mountSharedMap" in txt
    assert "?pack=" in txt or "parsePackParam" in txt
    assert "deterministic" in txt.lower()
    assert 'data-pack-n="1"' in txt or "pack1" in txt.lower()


def test_trends_scrubber_vorp():
    txt = (root / "trends.html").read_text()
    assert "global-year-slider" in txt
    assert "vorp-slider" in txt.lower()


def test_eval_scoreboard_chips():
    txt = (root / "model.html").read_text()
    assert "eval_scoreboard" in txt
    assert "evsb-pos" in txt


def test_manim_autoplay():
    txt = (root / "model.html").read_text()
    assert "autoplay" in txt and "MTNNFlow" in txt


def test_css_parity():
    css_files = list((root / "assets").glob("*.css"))
    assert len(css_files) >= 5
    total = sum(len(p.read_text()) for p in css_files)
    assert total > 1000


def test_json_tools():
    json.loads((root / "manifest.json").read_text())
    json.loads((root / "assets/eval_scoreboard.json").read_text())
    json.loads((root / "vercel.json").read_text())
