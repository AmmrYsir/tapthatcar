# tapthatcar

A dynamic data-aggregation and decision engine for used car listings,
served by a Bun + Fastify backend and a React + Vite frontend.

The engine pulls listings from configurable sources (carsome.my today),
auto-discovers the schema each run, classifies every field as
`value` / `context` / `auxiliary`, cleans and dedupes the rows,
derives weights from data instead of hard-coding them, and returns
the top-ranked cars with per-listing explanations.

## Layout

```
.
├── index.ts              # Bun entry — spins up Fastify on :3000
├── src/
│   ├── server.ts         # Fastify routes + permissive CORS
│   ├── engine/           # schema discovery, normalise, weights, score
│   ├── sources/          # source adapters (carsome) + bundled sample
│   └── util/             # parsers + stats helpers
├── scripts/
│   ├── smoke.ts          # engine smoke test against bundled sample
│   └── http-smoke.ts     # exercises every HTTP route via Fastify.inject
└── web/                  # Vite + React + TypeScript frontend
    ├── src/
    │   ├── App.tsx
    │   ├── api.ts
    │   ├── types.ts
    │   ├── components/   # CarCard, SchemaPanel, Toolbar
    │   └── util/
    ├── index.html
    └── vite.config.ts
```

## Quick start

```bash
# 1. Backend
bun install
bun run start              # API on http://localhost:3000

# 2. Frontend (separate terminal)
cd web
bun install                # or npm install / pnpm install
bun run dev                # UI on http://localhost:5173
```

The Vite dev server proxies `/api/*` to `http://localhost:3000`, so
the frontend talks to the backend with `fetch('/api/listings/top')`.
For production, run `bun run build` in `web/` and serve `web/dist/`
from any static host.

## HTTP endpoints

| Method | Path                 | Notes                                                                          |
|--------|----------------------|--------------------------------------------------------------------------------|
| GET    | `/health`            | liveness                                                                       |
| GET    | `/sources`           | list of registered source adapters                                             |
| GET    | `/listings/top`      | full pipeline. Query: `source`, `limit`, `offline`, plus arbitrary filters     |
| POST   | `/rank`              | score arbitrary listings supplied in the body                                  |
| GET    | `/schema`            | last-discovered schema + weights                                               |

`GET /listings/top?brand=Honda&fuel=Petrol&limit=5` filters case-insensitively
on any context field discovered in the schema.

`POST /rank` body shape:

```jsonc
{
  "listings": [
    { "make": "Honda", "model": "Civic", "mfg_year": 2020,
      "odometer_km": "40,000", "asking": "RM 65,000", "owners": 1,
      "condition": "used" }
  ],
  "limit": 10,
  "filters": { "make": "Honda" }
}
```

The engine doesn't care that this caller used `make`/`mfg_year`/`asking`
instead of `brand`/`year`/`price` — the schema discovery learns both.

## Pipeline

1. **Source adapter** (`src/sources/`) returns a flat list of
   `Record<string, primitive>` rows. The carsome adapter parses the
   `__NEXT_DATA__` blob from `https://www.carsome.my/buy-car`; if the
   network is unavailable it falls back to `SAMPLE_LISTINGS` and sets
   `usedFallback: true`.
2. **Normalise** (`src/engine/normalize.ts`) coerces messy strings
   (`"RM 45,800"`, `"78,000 km"`) into numbers, drops anything tagged
   as brand-new, removes extreme outliers via Tukey fences, and dedupes
   by `(brand, model, year, mileage, price)` keeping the most complete
   row.
3. **Schema discovery** (`src/engine/schema.ts`) infers a type for
   every key, computes coverage / cardinality / variance, then
   classifies each field:
   * `value` — numeric, contributes to the score (price, mileage, …)
   * `context` — categorical (brand, fuel, location, …)
   * `auxiliary` — ids, urls, descriptions
4. **Dynamic weights** (`src/engine/weights.ts`) combine a
   name-based prior (`price=1.0`, `mileage=0.9`, `year=0.85`, …) with
   the field's coverage and coefficient of variation, then L1-normalise
   so the value-field weights sum to 1. Brand-new value fields get a
   small exploratory weight so they aren't ignored.
5. **Score & explain** (`src/engine/score.ts`) min-max normalises each
   value in the cohort (flipped for lower-better fields like price),
   re-normalises weights per row to ignore missing fields, sums
   `weight * normalised`, and produces a human-readable explanation
   listing the strongest contributors and any cohort-relative weak
   spots.

## Frontend

Built with **React 18 + Vite + TypeScript** — chosen because it's the
default modern stack for this kind of data-driven dashboard, has the
biggest ecosystem, and Vite's dev server gives instant HMR with
near-zero config. Plain CSS (no Tailwind) keeps the dependency tree
small.

The UI re-renders entirely from the API response — there are no
hard-coded fields. Three panels:

* **Toolbar** — limit input, mode toggle (live/offline), plus
  dropdowns auto-generated from any context field with low cardinality
  (e.g. brand, fuel, transmission). Selecting an option re-runs the
  pipeline server-side with that filter applied.
* **Listings** — a card per ranked car with its score badge, the
  engine's natural-language summary, strengths vs cohort, trade-offs,
  and a per-field contribution bar chart.
* **Schema panel** — shows the discovered weights as bars, plus the
  full set of value / context / auxiliary fields the engine found in
  this run. If you point a different source at the engine, this
  refreshes itself.

If the live carsome.my fetch fails (network blocked, layout drift), the
backend returns the bundled sample dataset and sets `usedFallback: true`;
the UI surfaces that as a yellow banner so it's obvious you're not
looking at fresh data.

## Adding a new source

Implement `SourceAdapter` from `src/sources/types.ts`:

```ts
class MyAdapter implements SourceAdapter {
  readonly name = 'mudah'
  async fetch(opts) { /* return { source, fetchedAt, listings, usedFallback } */ }
}
```

Then register it in `src/sources/index.ts`. The engine and the UI
both pick up the new fields automatically.
