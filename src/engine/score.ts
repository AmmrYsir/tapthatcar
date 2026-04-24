/**
 * Per-listing scoring + human-readable explanations.
 *
 * For each listing:
 *   1. Pull each value field, normalise to [0,1] using the field's
 *      dataset min/max, flipping for lower-better fields.
 *   2. Re-normalise the weights of *present* fields so missing fields
 *      don't bias the score downward.
 *   3. Sum weight * normalised value → final score in [0,1].
 *   4. Produce an explanation that calls out the top contributing
 *      strengths and any weak areas relative to the cohort.
 */

import type { Explanation, RawListing, ScoreContribution, ScoredListing, Schema } from './types.ts'
import { minMax } from '../util/stats.ts'

function percentileOf(value: number, sortedAsc: number[]): number {
	if (sortedAsc.length === 0) return 0.5
	let lo = 0
	let hi = sortedAsc.length
	while (lo < hi) {
		const mid = (lo + hi) >>> 1
		if (sortedAsc[mid]! < value) lo = mid + 1
		else hi = mid
	}
	return lo / sortedAsc.length
}

interface FieldCohort {
	sorted: number[]
}

function buildCohorts(schema: Schema, listings: RawListing[]): Map<string, FieldCohort> {
	const cohorts = new Map<string, FieldCohort>()
	for (const name of schema.valueFields) {
		const arr: number[] = []
		for (const row of listings) {
			const v = row[name]
			if (typeof v === 'number' && Number.isFinite(v)) arr.push(v)
		}
		arr.sort((a, b) => a - b)
		cohorts.set(name, { sorted: arr })
	}
	return cohorts
}

function describeField(name: string): string {
	return name.replace(/[_-]+/g, ' ')
}

function summaryFor(score: number, contributions: ScoreContribution[]): string {
	const pct = Math.round(score * 100)
	if (contributions.length === 0) return `Score ${pct}/100 — no scorable fields.`
	const top = contributions[0]!
	return `Score ${pct}/100 — strongest signal: ${describeField(top.field)} (contributed ${(top.contribution * 100).toFixed(1)} pts).`
}

export function scoreListings(schema: Schema, listings: RawListing[]): ScoredListing[] {
	const cohorts = buildCohorts(schema, listings)
	const scored: ScoredListing[] = []

	for (const listing of listings) {
		const contributions: ScoreContribution[] = []
		const presentWeights: number[] = []

		for (const name of schema.valueFields) {
			const meta = schema.fields[name]
			if (!meta || !meta.stats) continue
			const v = listing[name]
			if (typeof v !== 'number' || !Number.isFinite(v)) continue

			let normalized = minMax(v, meta.stats.min, meta.stats.max)
			if (meta.direction === 'lower-better') normalized = 1 - normalized

			presentWeights.push(meta.weight)
			contributions.push({
				field: name,
				weight: meta.weight,
				rawValue: v,
				normalized,
				contribution: 0, // filled in after re-normalisation
				percentile: percentileOf(v, cohorts.get(name)?.sorted ?? []),
			})
		}

		const weightSum = presentWeights.reduce((a, b) => a + b, 0)
		let score = 0
		for (const c of contributions) {
			const w = weightSum > 0 ? c.weight / weightSum : 0
			c.weight = w
			c.contribution = w * c.normalized
			score += c.contribution
		}

		contributions.sort((a, b) => b.contribution - a.contribution)
		const explanation: Explanation = {
			score,
			summary: summaryFor(score, contributions),
			strengths: contributions
				.filter((c) => c.normalized >= 0.7)
				.slice(0, 3)
				.map((c) => `${describeField(c.field)} is in the top ${(100 - c.percentile * 100).toFixed(0)}% of comparable listings`),
			tradeoffs: contributions
				.filter((c) => c.normalized <= 0.3 && c.weight > 0.05)
				.slice(0, 3)
				.map((c) => `${describeField(c.field)} weak vs cohort (bottom ${(c.percentile * 100).toFixed(0)}%)`),
			contributions,
		}

		scored.push({ listing, score, rank: 0, explanation })
	}

	scored.sort((a, b) => b.score - a.score)
	scored.forEach((s, i) => {
		s.rank = i + 1
	})
	return scored
}
