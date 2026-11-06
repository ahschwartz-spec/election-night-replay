# Election night 2026: a replay

A replay of the dashboard I built and ran on election night, November 3, 2026: county benchmarks
and a needle-style win probability for 27 Senate and Governor races, refreshed from official state
results feeds through the night.

**Interim version.** Not yet buttoned up: counts after the night are unofficial, and a "How it
works" page is still to come.

## What you can do

- **Play the night** from 7 PM to 3 AM Eastern (Play, ◀ ▶, the slider, or the ← → keys), then a
  last **Final count** step.
- **Switch the needle** between how it ran on election night and a revised version built after
  the night (heavier-tailed probabilities, a 99% cap, a guard for higher-than-expected turnout).
- **Pick any race** for its county table, vote-share chart and benchmarks; sort counties by
  demographic traits.

Races entered by hand on the night are shown as typed, with the stretches between saves filled in
and labeled "reconstructed".

## Viewing it

It's a static page: no server code. Locally:

```
python -m http.server 8110
```

then open http://127.0.0.1:8110. Online, GitHub Pages serves this folder as it is.

Built by `tools/export_replay.py` in the (private) election-night repository; regenerate there and
copy `site/` here to update.
