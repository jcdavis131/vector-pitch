# Vector Pitch

Daily World Cup chimera over StatsBomb Open Data (attribution in-app).
633 player-tournaments (WC 2018+2022), per-90, tournament-z-scored.

Difficulty calibration: `python pipeline/build_difficulty.py` -> `assets/difficulty_calibration.json`
(embedding-space guessability model targeting a 40-80% expected-solve band; zero-backend, so it is
a model estimate, not telemetry). On-device stats card: localStorage only, nothing leaves the page.

> Solo personal project, no connection to employer, built with public/free-tier only.
> **Built in raw WebGPU / WebGL / Canvas — no Unity/Unreal, just browser graphics APIs straight.** Zero engine, raw buffers + custom shaders, static hosting.

Live: https://pitch.dumbmodel.com

