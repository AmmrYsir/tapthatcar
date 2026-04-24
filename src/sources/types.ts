import type { RawListing } from '../engine/types.ts'

export interface SourceFetchOptions {
	/** Maximum listings to return from the source. */
	limit?: number
	/** Optional source-specific query (e.g. {brand: 'toyota'}). */
	query?: Record<string, string>
	/** Skip network and use whatever offline fallback the adapter has. */
	offline?: boolean
}

export interface SourceResult {
	source: string
	fetchedAt: string
	listings: RawListing[]
	/** True when the adapter fell back to its bundled sample. */
	usedFallback: boolean
	notes?: string
}

export interface SourceAdapter {
	readonly name: string
	fetch(options?: SourceFetchOptions): Promise<SourceResult>
}
