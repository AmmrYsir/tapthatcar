/**
 * Cleaning, normalisation, outlier removal, and deduplication.
 *
 * - Coerces messy strings ("RM 45,800", "78,000 km") to numbers.
 * - Filters out listings that look brand-new when a condition field
 *   exists (we want second-hand only).
 * - Drops extreme outliers per numeric field via Tukey fences.
 * - Dedupes by a (brand, model, year, mileage, price) signature,
 *   preferring the row with more populated fields.
 */

import type { RawListing } from './types.ts'
import { detectFieldKind, normalizeString, parseNumber, parseYear } from '../util/parse.ts'
import { outlierBounds } from '../util/stats.ts'

const NEW_CONDITION_RE = /\b(brand[\s-]?new|new car|0\s*km|unregistered)\b/i

function isSecondHand(row: RawListing): boolean {
	for (const [k, v] of Object.entries(row)) {
		const kind = detectFieldKind(k)
		if (kind !== 'condition') continue
		if (v === null || v === undefined) continue
		const s = String(v).toLowerCase()
		if (NEW_CONDITION_RE.test(s)) return false
		if (s === 'new') return false
	}
	return true
}

/** Coerce values per field-name heuristic. */
export function cleanListing(raw: RawListing): RawListing {
	const out: RawListing = {}
	for (const [key, value] of Object.entries(raw)) {
		const kind = detectFieldKind(key)
		if (value === null || value === undefined) {
			out[key] = null
			continue
		}
		switch (kind) {
			case 'price':
			case 'mileage':
			case 'engine':
			case 'power':
			case 'seats':
			case 'doors':
			case 'owners':
			case 'features_count':
			case 'rating':
			case 'fuel_efficiency':
			case 'age': {
				out[key] = parseNumber(value)
				break
			}
			case 'year': {
				out[key] = parseYear(value)
				break
			}
			case 'url':
			case 'image':
			case 'id':
			case 'description': {
				out[key] = normalizeString(value)
				break
			}
			default: {
				if (typeof value === 'number' || typeof value === 'boolean') {
					out[key] = value
				} else {
					// Try to coerce to number first; fall back to string.
					const n = parseNumber(value)
					out[key] = n !== null && /^\s*[-+]?[\d.,]+\s*$/.test(String(value))
						? n
						: normalizeString(value)
				}
			}
		}
	}
	return out
}

/** Drop rows where any value-field is outside Tukey fences (k=3). */
export function dropOutliers(listings: RawListing[]): RawListing[] {
	if (listings.length < 6) return listings
	const numericFields = new Map<string, number[]>()
	for (const row of listings) {
		for (const [k, v] of Object.entries(row)) {
			if (typeof v !== 'number' || !Number.isFinite(v)) continue
			const kind = detectFieldKind(k)
			if (kind === 'unknown' || kind === 'id' || kind === 'image' || kind === 'url') continue
			const arr = numericFields.get(k) ?? []
			arr.push(v)
			numericFields.set(k, arr)
		}
	}
	const bounds = new Map<string, { low: number; high: number }>()
	for (const [k, vals] of numericFields) {
		if (vals.length < 6) continue
		bounds.set(k, outlierBounds(vals, 3))
	}
	return listings.filter((row) => {
		for (const [k, v] of Object.entries(row)) {
			if (typeof v !== 'number' || !Number.isFinite(v)) continue
			const b = bounds.get(k)
			if (!b) continue
			if (v < b.low || v > b.high) return false
		}
		return true
	})
}

function signature(row: RawListing): string {
	const parts: string[] = []
	for (const [k, v] of Object.entries(row)) {
		const kind = detectFieldKind(k)
		if (
			kind === 'brand' ||
			kind === 'model' ||
			kind === 'variant' ||
			kind === 'year' ||
			kind === 'mileage' ||
			kind === 'price'
		) {
			parts.push(`${kind}=${String(v ?? '')}`)
		}
	}
	return parts.sort().join('|')
}

function completeness(row: RawListing): number {
	let n = 0
	for (const v of Object.values(row)) {
		if (v !== null && v !== undefined && v !== '') n++
	}
	return n
}

export function dedupe(listings: RawListing[]): RawListing[] {
	const best = new Map<string, RawListing>()
	for (const row of listings) {
		const sig = signature(row)
		if (!sig) {
			// Without a signature we keep the row but key by reference.
			best.set(`__row_${best.size}`, row)
			continue
		}
		const existing = best.get(sig)
		if (!existing || completeness(row) > completeness(existing)) {
			best.set(sig, row)
		}
	}
	return [...best.values()]
}

export interface NormaliseResult {
	listings: RawListing[]
	dropped: { secondhand: number; outliers: number; duplicates: number }
}

export function normalise(raw: RawListing[]): NormaliseResult {
	const cleaned = raw.map(cleanListing)
	const secondhand = cleaned.filter(isSecondHand)
	const noOutliers = dropOutliers(secondhand)
	const deduped = dedupe(noOutliers)
	return {
		listings: deduped,
		dropped: {
			secondhand: cleaned.length - secondhand.length,
			outliers: secondhand.length - noOutliers.length,
			duplicates: noOutliers.length - deduped.length,
		},
	}
}
