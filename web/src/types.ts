/** Shapes that mirror the backend responses (kept in sync by hand). */

export type Primitive = string | number | boolean | null | undefined
export type RawListing = Record<string, Primitive>

export type Direction = 'lower-better' | 'higher-better' | 'neutral'
export type FieldRole = 'value' | 'context' | 'auxiliary'
export type InferredType = 'number' | 'integer' | 'string' | 'boolean' | 'date' | 'enum'

export interface FieldStatsBlock {
	min: number
	max: number
	mean: number
	median: number
	p10: number
	p90: number
	variance: number
}

export interface FieldMeta {
	name: string
	type: InferredType
	role: FieldRole
	direction: Direction
	coverage: number
	cardinality: number
	stats?: FieldStatsBlock
	rawWeight: number
	weight: number
	note: string
}

export interface Schema {
	fields: Record<string, FieldMeta>
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
	normalized: number
	contribution: number
	percentile: number
}

export interface Explanation {
	score: number
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

export interface PipelineResponse {
	source: string
	fetchedAt: string
	schema: Schema
	weights: Record<string, number>
	results: ScoredListing[]
	sourceMeta: {
		name: string
		usedFallback: boolean
		notes?: string
	}
}
