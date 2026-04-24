/**
 * Schema discovery.
 *
 * Walks the cleaned listings, infers a type for every key it sees,
 * classifies each field as value/context/auxiliary, and produces the
 * raw weight signal for value fields. The Schema is recomputed on
 * every pipeline run so that new fields are picked up automatically.
 */

import type { Direction, FieldMeta, FieldRole, InferredType, RawListing, Schema } from './types.ts'
import {
	detectFieldKind,
	directionFor,
	isLikelyId,
	isLikelyUrl,
	priorWeightFor,
} from '../util/parse.ts'
import { summarise, variancesignal } from '../util/stats.ts'

interface FieldStats {
	name: string
	total: number
	present: number
	numericValues: number[]
	stringValues: Set<string>
	allInts: boolean
	booleans: number
	urlCount: number
}

function makeStats(name: string, total: number): FieldStats {
	return {
		name,
		total,
		present: 0,
		numericValues: [],
		stringValues: new Set(),
		allInts: true,
		booleans: 0,
		urlCount: 0,
	}
}

function inferType(s: FieldStats): InferredType {
	if (s.numericValues.length === s.present && s.present > 0) {
		return s.allInts ? 'integer' : 'number'
	}
	if (s.booleans === s.present && s.present > 0) return 'boolean'
	// dates we treat as strings unless fields look like numbers
	if (s.stringValues.size > 0 && s.stringValues.size <= Math.max(8, s.present * 0.2)) {
		return 'enum'
	}
	return 'string'
}

function classify(name: string, type: InferredType, stats: FieldStats): {
	role: FieldRole
	direction: Direction
	rawWeight: number
	note: string
} {
	const kind = detectFieldKind(name)
	const isUrl = stats.urlCount > 0 && stats.urlCount === stats.present
	const idLike = isLikelyId(name)

	if (idLike || isUrl || kind === 'url' || kind === 'image' || kind === 'description') {
		return {
			role: 'auxiliary',
			direction: 'neutral',
			rawWeight: 0,
			note: idLike ? 'identifier — preserved, not scored' : 'auxiliary content — preserved, not scored',
		}
	}

	if (type === 'integer' || type === 'number') {
		const direction = directionFor(kind)
		const prior = priorWeightFor(kind)
		// Even unknown numerics get a small exploratory weight if they vary.
		const rawWeight = prior > 0 ? prior : 0.05
		return {
			role: 'value',
			direction: direction === 'neutral' ? 'higher-better' : direction,
			rawWeight,
			note:
				prior > 0
					? `recognised as ${kind}; prior=${prior.toFixed(2)}, direction=${direction}`
					: `unknown numeric — exploratory weight, defaulting to higher-better`,
		}
	}

	// Strings/enums become context. They're useful for filtering/cohort
	// analysis but don't drive the numeric score.
	return {
		role: 'context',
		direction: 'neutral',
		rawWeight: 0,
		note: `categorical (${kind === 'unknown' ? 'unrecognised' : kind})`,
	}
}

/**
 * Build a Schema from cleaned listings. Caller is responsible for
 * passing already-coerced values (numbers as numbers, strings trimmed).
 */
export function discoverSchema(listings: RawListing[]): Schema {
	const total = listings.length
	const fieldStats = new Map<string, FieldStats>()

	for (const row of listings) {
		for (const [key, value] of Object.entries(row)) {
			let s = fieldStats.get(key)
			if (!s) {
				s = makeStats(key, total)
				fieldStats.set(key, s)
			}
			if (value === null || value === undefined || value === '') continue
			s.present++
			if (typeof value === 'number' && Number.isFinite(value)) {
				s.numericValues.push(value)
				if (!Number.isInteger(value)) s.allInts = false
			} else if (typeof value === 'boolean') {
				s.booleans++
			} else {
				const sv = String(value)
				s.stringValues.add(sv)
				if (isLikelyUrl(sv)) s.urlCount++
			}
		}
	}

	const fields: Record<string, FieldMeta> = {}

	for (const s of fieldStats.values()) {
		const type = inferType(s)
		const cls = classify(s.name, type, s)
		const coverage = s.present / Math.max(1, total)
		const meta: FieldMeta = {
			name: s.name,
			type,
			role: cls.role,
			direction: cls.direction,
			coverage,
			cardinality: s.stringValues.size + (s.numericValues.length > 0 ? 1 : 0),
			rawWeight: cls.rawWeight,
			weight: 0,
			note: cls.note,
		}
		if (type === 'integer' || type === 'number') {
			meta.stats = summarise(s.numericValues)
			// Bake variance + coverage into the raw weight before normalisation.
			const varSig = variancesignal(meta.stats)
			meta.rawWeight = meta.rawWeight * (0.5 + 0.5 * coverage) * (0.4 + 0.6 * varSig)
		}
		fields[s.name] = meta
	}

	const valueFields = Object.values(fields)
		.filter((f) => f.role === 'value')
		.sort((a, b) => b.rawWeight - a.rawWeight)
		.map((f) => f.name)

	const contextFields = Object.values(fields)
		.filter((f) => f.role === 'context')
		.map((f) => f.name)

	const auxiliaryFields = Object.values(fields)
		.filter((f) => f.role === 'auxiliary')
		.map((f) => f.name)

	return {
		fields,
		valueFields,
		contextFields,
		auxiliaryFields,
		totalListings: total,
		keptListings: total,
		droppedListings: 0,
	}
}
