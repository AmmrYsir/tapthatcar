import type { PipelineResponse } from './types'

const BASE = '/api'

export interface TopParams {
	limit?: number
	offline?: boolean
	source?: string
	filters?: Record<string, string>
}

export async function fetchTop(params: TopParams = {}): Promise<PipelineResponse> {
	const url = new URL(`${BASE}/listings/top`, window.location.origin)
	if (params.limit) url.searchParams.set('limit', String(params.limit))
	if (params.offline) url.searchParams.set('offline', '1')
	if (params.source) url.searchParams.set('source', params.source)
	for (const [k, v] of Object.entries(params.filters ?? {})) {
		if (v) url.searchParams.set(k, v)
	}
	const res = await fetch(url.pathname + url.search)
	if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`)
	return (await res.json()) as PipelineResponse
}
