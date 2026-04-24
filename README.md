# tapthatcar

A dynamic data-aggregation and decision engine for used car listings,
built on Bun + Fastify.

It pulls listings from configurable sources (carsome.my today),
auto-discovers the schema each run, classifies every field as
`value` / `context` / `auxiliary`, cleans and dedupes the rows,
derives weights from data instead of hard-coding them, and returns
the top-ranked cars with per-listing explanations.

## Run

```bash
bun install
bun run start          # serves on :3000
bun run smoke          # runs the engine against the bundled sample
bun run smoke:http     # exercises every HTTP route in-process
```

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

## Adding a new source

Implement `SourceAdapter` from `src/sources/types.ts`:

```ts
class MyAdapter implements SourceAdapter {
  readonly name = 'mudah'
  async fetch(opts) { /* return { source, fetchedAt, listings, usedFallback } */ }
}
```

Then register it in `src/sources/index.ts`. The engine doesn't need
any changes — schema discovery picks up whatever fields you produce.
