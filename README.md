# Vector Pitch

A daily World Cup "chimera" puzzle over StatsBomb Open Data (attribution in-app): guess the blend of real player-tournaments behind each day's composite. 633 player-tournaments from the 2018 and 2022 World Cups, per-90 stats z-scored within tournament, embedded with a small multi-tower net (`pipeline/train_mtnn.py`). Sister project to [vector-hoops](https://github.com/jcdavis131/vector-hoops).

Live: https://pitch.dumbmodel.com

> Solo personal project, no connection to employer, built with public/free-tier only.

Static site (plain HTML/JS/canvas), hosted on Vercel. The stats card is localStorage-only — game history stays on the device. The one server-side piece is `api/telemetry.js`, an optional serverless function that forwards anonymous, event-name-only play pings (start/guess/win/loss/share); it is a no-op unless its API key is configured.

## Pipeline

```bash
python pipeline/build_features.py      # StatsBomb open-data -> per-90 tournament-z features
python pipeline/build_vectors.py       # assets/vectors.json game contract
python pipeline/train_mtnn.py          # assets/pitch_mtnn_embeddings.json
python pipeline/build_difficulty.py    # assets/difficulty_calibration.json
```

Difficulty calibration is an embedding-space guessability model targeting a 40–80% expected-solve band. Because there is no gameplay telemetry with user detail, it is a model estimate, not measurement — the site says so on the stats card. `tests/test_difficulty.py` gates the calibration build.

MIT. Solo personal project, no connection to employer, built with public/free-tier only.
