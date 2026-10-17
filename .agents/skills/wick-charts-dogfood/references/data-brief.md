# Data brief (prompt template + rules)

Use a data agent only for NEW datasets. Existing ones are snapshots in `test/dogfood/data/`; if a file
is missing, re-fetch it with the pinned fetchers:

```
node .agents/skills/wick-charts-dogfood/scripts/data/binance.mjs [id...]   # btc-1h-gap pepe-1h stable-1m-flat btc-1m-big
node .agents/skills/wick-charts-dogfood/scripts/data/others.mjs [id...]    # everything else
```

The fetchers pin their time windows, so a re-fetch reproduces the same rows and keeps the visual
baseline valid. FRED is the exception (full history to today): new rows appear at the tail.
New fetch jobs go into those two files (or a new one next to them, importing `lib.mjs`), with a
pinned window, so the dataset becomes reproducible and part of the skill.

## What makes a good dogfood dataset

The point is data a real user would pass in without thinking, whose imperfections a demo dataset
never has. A dataset earns a place when it exercises at least one quirk class from the coverage map that
has thin coverage (`coverage.mjs due`, section 9), or a new class worth adding. Keep each file under ~5 MB
(one deliberate "big" set may reach ~15 MB in the `arrays` row format).

Source notes from earlier sessions:
- Stooq CSV now answers with a JavaScript check page — use the Yahoo chart API for stocks (prices are
  split-adjusted; raw split cliffs are not available there).
- Open-Meteo archive: the default model back-fills recent hours; pass `models=era5` to get the real
  trailing nulls.
- FRED `fredgraph.csv` reports missing values as empty cells (not "." any more).
- npm downloads API reports missing days as `0`, not null.
- Wikimedia REST requires a descriptive `User-Agent`.

## Prompt template

You are the data engineer on a Wick Charts dogfooding session (repo root: {REPO}).
Fetch these real public datasets from free, keyless APIs: {LIST — id, source, what quirk it is for}.

Rules:
- Add a fetch job with a pinned window to `.agents/skills/wick-charts-dogfood/scripts/data/others.mjs`
  (or a new file importing `lib.mjs`), and run it from the repo root; it writes
  `test/dogfood/data/<id>.json`. Touch nothing else.
- DO NOT CLEAN THE DATA. Only convert time to a ms UTC epoch number named `time`, numeric strings to
  numbers, and missing values to `null`. Keep the source order, duplicates, outliers and gaps.
- File format: `{ id, title, source, url, fetchedAt, rowFormat: "objects"|"arrays", columns, units,
  quirks: [...], suggestedCharts: [...], rows | series }`. Compute every number in `quirks` from the
  data (gaps, nulls, duplicates, min/max, negatives, order) — no guesses.
- Append the datasets to `test/dogfood/data/CATALOG.md` (table row + bug-hunting angles).
- If a source fails, pick a comparable one within a few minutes and say so.

Final message (under 250 words): files with rows and sizes, substitutions, and per dataset the quirk
classes it exercises (use the `quirkClasses` names from `coverage.json`; propose a new class if none fits).
