/**
 * End-to-end smoke test for the tapthatcar engine.
 *
 * Runs the full pipeline against the bundled sample dataset and
 * prints schema + weights + top-N + explanations.
 *
 *   bun run scripts/smoke.ts
 *   # or:
 *   node --experimental-strip-types --experimental-transform-types scripts/smoke.ts
 */

import { runPipeline } from '../src/engine/pipeline.ts'
import { CarsomeAdapter } from '../src/sources/carsome.ts'

const adapter = new CarsomeAdapter()
const fetched = await adapter.fetch({ offline: true })
const result = runPipeline(adapter.name, fetched.listings, { limit: 5 })

console.log('source            :', result.source, fetched.usedFallback ? '(sample fallback)' : '(live)')
console.log('listings (raw/kept):', result.schema.totalListings, '/', result.schema.keptListings)
console.log('value fields      :', result.schema.valueFields.join(', '))
console.log('context fields    :', result.schema.contextFields.join(', '))
console.log('aux fields        :', result.schema.auxiliaryFields.join(', '))
console.log()
console.log('weights:')
for (const [k, w] of Object.entries(result.weights)) {
	console.log(`  ${k.padEnd(20)} ${(w * 100).toFixed(1)}%`)
}
const sumW = Object.values(result.weights).reduce((a, b) => a + b, 0)
console.log(`  total              : ${(sumW * 100).toFixed(1)}%`)
console.log()
console.log('top results:')
for (const r of result.results) {
	const l = r.listing
	console.log(`  #${r.rank} ${l.brand} ${l.model} ${l.variant ?? ''} (${l.year}) — RM${l.price_myr} / ${l.mileage_km}km`)
	console.log(`     score=${r.score.toFixed(4)}  ${r.explanation.summary}`)
	if (r.explanation.strengths.length) {
		for (const s of r.explanation.strengths) console.log(`     + ${s}`)
	}
	if (r.explanation.tradeoffs.length) {
		for (const s of r.explanation.tradeoffs) console.log(`     - ${s}`)
	}
}

// Sanity assertions
const assert = (cond: unknown, msg: string) => {
	if (!cond) {
		console.error('ASSERT FAIL:', msg)
		process.exitCode = 1
	}
}
assert(Math.abs(sumW - 1) < 1e-6, 'weights must sum to 1')
assert(result.results.length > 0, 'should produce at least one ranked listing')
assert(
	result.results.every((r) => r.score >= 0 && r.score <= 1),
	'all scores must be in [0,1]',
)
assert(
	!result.results.some((r) => String(r.listing.condition ?? '').toLowerCase().includes('brand new')),
	'brand-new cars must be filtered out',
)
const ferrariStillThere = result.results.some((r) => r.listing.brand === 'Ferrari')
assert(!ferrariStillThere || result.results.length < 5, 'extreme price outlier should normally be dropped')
console.log('\nOK')
