/**
 * Generic value parsers. Used by the normaliser to coerce strings like
 * "RM 45,800" or "78,000 km" into numbers without hard-coding which
 * field they came from.
 */

const NUM_RE = /-?\d{1,3}(?:[,\s]\d{3})*(?:\.\d+)?|-?\d+(?:\.\d+)?/

/** Strip currency, units, commas; return a number or null. */
export function parseNumber(input: unknown): number | null {
	if (input === null || input === undefined) return null
	if (typeof input === 'number') return Number.isFinite(input) ? input : null
	if (typeof input === 'boolean') return input ? 1 : 0
	const s = String(input).trim()
	if (!s) return null
	const match = s.match(NUM_RE)
	if (!match) return null
	const cleaned = match[0].replace(/[,\s]/g, '')
	const n = Number(cleaned)
	return Number.isFinite(n) ? n : null
}

/** Year between 1950 and (current + 1). */
export function parseYear(input: unknown): number | null {
	const n = parseNumber(input)
	if (n === null) return null
	const yr = Math.round(n)
	const max = new Date().getUTCFullYear() + 1
	if (yr < 1950 || yr > max) return null
	return yr
}

/** Trim, lowercase, collapse whitespace. Returns null for empty. */
export function normalizeString(input: unknown): string | null {
	if (input === null || input === undefined) return null
	const s = String(input).trim().replace(/\s+/g, ' ')
	return s.length ? s : null
}

export function isLikelyUrl(s: string): boolean {
	return /^https?:\/\//i.test(s)
}

export function isLikelyId(name: string): boolean {
	return /(^|_)id$|^id$|uuid|slug/i.test(name)
}

/** Detect the canonical "kind" of a field by name. Pure heuristic. */
export type FieldKind =
	| 'price'
	| 'mileage'
	| 'year'
	| 'age'
	| 'owners'
	| 'engine'
	| 'power'
	| 'seats'
	| 'doors'
	| 'features_count'
	| 'rating'
	| 'fuel_efficiency'
	| 'condition'
	| 'brand'
	| 'model'
	| 'variant'
	| 'transmission'
	| 'fuel'
	| 'body'
	| 'colour'
	| 'location'
	| 'url'
	| 'id'
	| 'image'
	| 'description'
	| 'unknown'

// IMPORTANT: order matters. Auxiliary patterns (id/url/image/description)
// run FIRST so they short-circuit before substring-y patterns like /age/
// (which would otherwise match "image", "mileage", etc.).
//
// Built with the RegExp constructor instead of regex literals so Node's
// experimental TS strip-types parser doesn't mis-tokenise alternations.
const re = (pattern: string): RegExp => new RegExp(pattern, 'i')
const KIND_PATTERNS: Array<[RegExp, FieldKind]> = [
	[re('(^|_)id($|_)|^id$|uuid|slug'), 'id'],
	[re('^url$|link|href|permalink|website'), 'url'],
	[re('(^|_)(image|photo|thumbnail|picture|img)($|_|s$)'), 'image'],
	[re('description|about|^notes?$|details$'), 'description'],
	[re('(^|_)price($|_)|amount|cost|asking|rrp|msrp'), 'price'],
	[re('mileage|odometer|(^|_)km($|_)|kilometres|kilometers'), 'mileage'],
	[re('(^|_)year($|_)|manufactured|model_year|reg_year'), 'year'],
	[re('owner'), 'owners'],
	[re('(^|_)age($|_)|years_old'), 'age'],
	[re('engine|displacement|(^|_)cc($|_)'), 'engine'],
	[re('horsepower|(^|_)hp($|_)|(^|_)power($|_)|torque|(^|_)kw($|_)'), 'power'],
	[re('(^|_)seats?($|_)'), 'seats'],
	[re('(^|_)doors?($|_)'), 'doors'],
	[re('features?_?count|num_features'), 'features_count'],
	[re('rating|stars|(^|_)score($|_)'), 'rating'],
	[re('fuel_?eff|economy|mpg|l_?per_?100'), 'fuel_efficiency'],
	[re('condition|new_used|(^|_)status($|_)'), 'condition'],
	[re('brand|make'), 'brand'],
	[re('^model$|model_name'), 'model'],
	[re('variant|trim|grade'), 'variant'],
	[re('trans(mission)?|gearbox'), 'transmission'],
	[re('fuel(_type)?$'), 'fuel'],
	[re('body|chassis|type$'), 'body'],
	[re('colou?r'), 'colour'],
	[re('location|city|state|region|branch'), 'location'],
]

export function detectFieldKind(name: string): FieldKind {
	for (const [re2, kind] of KIND_PATTERNS) {
		if (re2.test(name)) return kind
	}
	return 'unknown'
}

/**
 * Heuristic prior for how heavily a field should weigh the score before
 * data-driven adjustments. Lower-better fields and "newer is better"
 * fields like year get strong priors. Anything unknown gets a small
 * exploratory weight so new fields aren't ignored.
 */
export function priorWeightFor(kind: FieldKind): number {
	switch (kind) {
		case 'price':
			return 1.0
		case 'mileage':
			return 0.9
		case 'year':
			return 0.85
		case 'age':
			return 0.85
		case 'owners':
			return 0.4
		case 'fuel_efficiency':
			return 0.35
		case 'rating':
			return 0.3
		case 'features_count':
			return 0.2
		case 'power':
			return 0.15
		case 'engine':
			return 0.1
		default:
			return 0
	}
}

export function directionFor(kind: FieldKind): 'lower-better' | 'higher-better' | 'neutral' {
	switch (kind) {
		case 'price':
		case 'mileage':
		case 'owners':
		case 'age':
			return 'lower-better'
		case 'year':
		case 'fuel_efficiency':
		case 'rating':
		case 'features_count':
		case 'power':
			return 'higher-better'
		default:
			return 'neutral'
	}
}
