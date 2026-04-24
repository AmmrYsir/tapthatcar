/**
 * End-to-end orchestration: raw listings → cleaned → schema → weights →
 * scored. Pure function (no I/O) so it's trivial to test and reuse.
 */

import type { PipelineResult, RawListing } from './types.ts'
import { normalise } from './normalize.ts'
import { discoverSchema } from './schema.ts'
import { assignWeights } from './weights.ts'
import { scoreListings } from './score.ts'

export interface RankOptions {
	/** Cap the result set returned to the caller (after scoring). */
	limit?: number
	/** Optional case-insensitive equality filters on context fields. */
	filters?: Record<string, string | number | boolean>
}

function applyFilters(rows: RawListing[], filters?: RankOptions['filters']): RawListing[] {
	if (!filters) return rows
	const entries = Object.entries(filters)
	if (entries.length === 0) return rows
	return rows.filter((row) => {
		for (const [k, v] of entries) {
			const rv = row[k]
			if (rv === null || rv === undefined) return false
			if (String(rv).toLowerCase() !== String(v).toLowerCase()) return false
		}
		return true
	})
}

export function runPipeline(
	source: string,
	raw: RawListing[],
	options: RankOptions = {},
): PipelineResult {
	const { listings, dropped } = normalise(raw)
	const filtered = applyFilters(listings, options.filters)
	const schema = discoverSchema(filtered)
	schema.totalListings = raw.length
	schema.keptListings = filtered.length
	schema.droppedListings =
		raw.length - filtered.length // total removed from raw → final
	const weights = assignWeights(schema)
	const scored = scoreListings(schema, filtered)

	// Annotate dropped breakdown into the schema for transparency.
	;(schema as unknown as { droppedBreakdown: typeof dropped }).droppedBreakdown = dropped

	const limited = options.limit ? scored.slice(0, options.limit) : scored
	return {
		source,
		fetchedAt: new Date().toISOString(),
		schema,
		weights,
		results: limited,
	}
}
