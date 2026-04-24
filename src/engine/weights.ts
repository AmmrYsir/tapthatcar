/**
 * Final weight assignment.
 *
 * Schema discovery has already produced a `rawWeight` for each value
 * field that combines a name-based prior with coverage and variance.
 * This module L1-normalises across value fields so the weights sum to
 * 1, mutating `Schema.fields[*].weight`.
 *
 * If no recognised value fields exist, we promote the most-varying
 * unknown numeric fields so the engine still produces a ranking.
 */

import type { Schema } from './types.ts'

export function assignWeights(schema: Schema): Record<string, number> {
	let valueNames = schema.valueFields.slice()

	// Defensive: if every prior was zero (e.g. brand-new domain), bootstrap
	// from any numeric fields we have.
	if (valueNames.length === 0) {
		valueNames = Object.values(schema.fields)
			.filter((f) => (f.type === 'number' || f.type === 'integer') && f.role !== 'auxiliary')
			.map((f) => {
				f.role = 'value'
				f.rawWeight = Math.max(f.rawWeight, 0.05)
				if (f.direction === 'neutral') f.direction = 'higher-better'
				return f.name
			})
	}

	const total = valueNames.reduce((acc, n) => acc + (schema.fields[n]?.rawWeight ?? 0), 0)
	const weights: Record<string, number> = {}
	for (const name of valueNames) {
		const meta = schema.fields[name]
		if (!meta) continue
		meta.weight = total > 0 ? meta.rawWeight / total : 1 / valueNames.length
		weights[name] = meta.weight
	}

	// Re-sort valueFields by final weight desc.
	schema.valueFields = valueNames
		.slice()
		.sort((a, b) => (schema.fields[b]?.weight ?? 0) - (schema.fields[a]?.weight ?? 0))

	return weights
}
