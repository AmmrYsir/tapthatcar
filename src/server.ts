/**
 * Fastify server. Routes are thin wrappers around the engine + source
 * adapters; the engine is unaware of HTTP.
 */

import Fastify, { type FastifyInstance } from 'fastify'
import { runPipeline, type RankOptions } from './engine/pipeline.ts'
import { getAdapter, listAdapters } from './sources/index.ts'
import type { RawListing } from './engine/types.ts'

interface TopQuery {
	source?: string
	limit?: string
	offline?: string
	[k: string]: string | undefined
}

interface RankBody {
	listings: RawListing[]
	limit?: number
	filters?: Record<string, string | number | boolean>
}

const SYSTEM_QUERY_KEYS = new Set(['source', 'limit', 'offline'])

function extractFilters(query: TopQuery): Record<string, string> {
	const out: Record<string, string> = {}
	for (const [k, v] of Object.entries(query)) {
		if (SYSTEM_QUERY_KEYS.has(k)) continue
		if (typeof v === 'string' && v.length) out[k] = v
	}
	return out
}

export function buildServer(): FastifyInstance {
	const fastify = Fastify({ logger: true })

	fastify.get('/', async () => ({
		name: 'tapthatcar',
		ok: true,
		endpoints: ['/health', '/sources', '/listings/top', '/rank', '/schema'],
	}))

	fastify.get('/health', async () => ({ ok: true, ts: new Date().toISOString() }))

	fastify.get('/sources', async () => ({ sources: listAdapters() }))

	/**
	 * GET /listings/top
	 *   Pulls listings from a source adapter, runs the full pipeline,
	 *   and returns the top-N ranked cars together with the discovered
	 *   schema and the weights actually used.
	 *
	 *   Query params: source, limit, offline (truthy), and any other
	 *   key/value pairs are treated as case-insensitive equality filters
	 *   on context fields (e.g. brand=Honda&fuel=Petrol).
	 */
	fastify.get<{ Querystring: TopQuery }>('/listings/top', async (req, reply) => {
		const { source = 'carsome', limit, offline } = req.query
		const adapter = getAdapter(source)
		const fetched = await adapter.fetch({
			limit: limit ? Number(limit) * 5 : undefined, // overfetch so dedupe/outlier filtering still leaves enough
			offline: offline === '1' || offline === 'true',
		})
		const result = runPipeline(adapter.name, fetched.listings, {
			limit: limit ? Number(limit) : 10,
			filters: extractFilters(req.query),
		})
		reply.header('x-source-fallback', String(fetched.usedFallback))
		return {
			...result,
			sourceMeta: {
				name: fetched.source,
				usedFallback: fetched.usedFallback,
				notes: fetched.notes,
			},
		}
	})

	/**
	 * POST /rank
	 *   Score arbitrary listings provided by the caller.
	 *   Body: { listings: [...], limit?: number, filters?: {...} }
	 */
	fastify.post<{ Body: RankBody }>('/rank', async (req, reply) => {
		const body = req.body
		if (!body || !Array.isArray(body.listings)) {
			reply.code(400)
			return { error: 'body.listings must be an array' }
		}
		const opts: RankOptions = { limit: body.limit, filters: body.filters }
		return runPipeline('inline', body.listings, opts)
	})

	/**
	 * GET /schema
	 *   Returns the schema discovered from the default source. Useful
	 *   for clients that want to render dynamic filters.
	 */
	fastify.get<{ Querystring: TopQuery }>('/schema', async (req) => {
		const { source = 'carsome', offline } = req.query
		const adapter = getAdapter(source)
		const fetched = await adapter.fetch({
			offline: offline === '1' || offline === 'true',
		})
		const result = runPipeline(adapter.name, fetched.listings, { limit: 0 })
		return {
			source: adapter.name,
			usedFallback: fetched.usedFallback,
			schema: result.schema,
			weights: result.weights,
		}
	})

	return fastify
}
