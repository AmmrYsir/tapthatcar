/**
 * Core types for the tapthatcar engine.
 *
 * The engine is schema-agnostic. A "raw listing" is just an object of
 * unknown keys/values from a source adapter; the engine discovers the
 * schema, decides what counts as a value/context/auxiliary field, and
 * scores rows accordingly.
 */

export type Primitive = string | number | boolean | null | undefined

export type RawListing = Record<string, Primitive>

/** Direction the field pulls the score in. */
export type Direction = 'lower-better' | 'higher-better' | 'neutral'

/** What role a discovered field plays in scoring. */
export type FieldRole =
	| 'value' // numeric, contributes to score (price, mileage, year, ...)
	| 'context' // categorical descriptors (brand, model, location, ...)
	| 'auxiliary' // ids, urls, descriptions — kept but unused for scoring

export type InferredType = 'number' | 'integer' | 'string' | 'boolean' | 'date' | 'enum'

export interface FieldMeta {
	name: string
	type: InferredType
	role: FieldRole
	direction: Direction
	/** 0..1 — fraction of rows where the field is non-null after cleaning. */
	coverage: number
	/** raw count of distinct non-null values. */
	cardinality: number
	/** dataset-level statistics, only populated for numeric fields. */
	stats?: {
		min: number
		max: number
		mean: number
		median: number
		p10: number
		p90: number
		variance: number
	}
	/** raw weight before normalisation; 0 for non-value fields. */
	rawWeight: number
	/** weight after L1-normalisation across value fields. */
	weight: number
	/** human-readable note about how this field was classified. */
	note: string
}

export interface Schema {
	fields: Record<string, FieldMeta>
	/** Order of value fields by descending weight. */
	valueFields: string[]
	contextFields: string[]
	auxiliaryFields: string[]
	totalListings: number
	keptListings: number
	droppedListings: number
}

export interface ScoreContribution {
	field: string
	weight: number
	rawValue: Primitive
	normalized: number // 0..1 after direction handling
	contribution: number // weight * normalized
	percentile: number // 0..1 vs cohort
}

export interface Explanation {
	score: number // 0..1
	summary: string
	strengths: string[]
	tradeoffs: string[]
	contributions: ScoreContribution[]
}

export interface ScoredListing {
	listing: RawListing
	score: number
	rank: number
	explanation: Explanation
}

export interface PipelineResult {
	source: string
	fetchedAt: string
	schema: Schema
	weights: Record<string, number>
	results: ScoredListing[]
}
