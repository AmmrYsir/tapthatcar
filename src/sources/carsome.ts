/**
 * Carsome.my source adapter.
 *
 * Strategy:
 *   1. Try to fetch one or more buy-car listing pages.
 *   2. Carsome is a Next.js app, so the listings are embedded in the
 *      `<script id="__NEXT_DATA__" type="application/json">` blob on
 *      each page. We extract that JSON and walk it for any object that
 *      "looks like" a car listing (has price + brand/model + year-ish
 *      keys), then flatten into RawListing dictionaries.
 *   3. If anything in the chain fails (network blocked, layout change,
 *      bot wall), fall back to the bundled SAMPLE_LISTINGS so the
 *      engine still produces output — the caller is told via the
 *      `usedFallback` flag.
 *
 * The adapter never imposes a fixed schema; whatever keys carsome
 * exposes on a listing object are passed straight through and the
 * engine discovers the schema downstream.
 */

import type { RawListing } from '../engine/types.ts'
import type { SourceAdapter, SourceFetchOptions, SourceResult } from './types.ts'
import { SAMPLE_LISTINGS } from './sample.ts'

const DEFAULT_PAGES = ['https://www.carsome.my/buy-car']
const USER_AGENT =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

const NEXT_DATA_RE =
	/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i

/** Detect "this object looks like a car listing" without hard-coding fields. */
function looksLikeListing(value: unknown): value is Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false
	const obj = value as Record<string, unknown>
	const keys = Object.keys(obj).map((k) => k.toLowerCase())
	const hasPrice = keys.some((k) => /(price|amount|asking)/.test(k))
	const hasModelLike = keys.some((k) =>
		/(model|make|brand|variant|trim|name|title)/.test(k),
	)
	const hasYearish = keys.some((k) =>
		/(year|mileage|odometer|km|engine|capacity)/.test(k),
	)
	return hasPrice && hasModelLike && hasYearish
}

/** Walk arbitrary JSON, collect every node that looks like a listing. */
function collectListings(node: unknown, acc: Record<string, unknown>[]): void {
	if (!node) return
	if (Array.isArray(node)) {
		for (const item of node) collectListings(item, acc)
		return
	}
	if (typeof node !== 'object') return
	if (looksLikeListing(node)) {
		acc.push(node as Record<string, unknown>)
	}
	for (const v of Object.values(node as Record<string, unknown>)) {
		if (v && typeof v === 'object') collectListings(v, acc)
	}
}

/** Flatten one level of nested objects so the engine sees scalar fields. */
function flatten(obj: Record<string, unknown>, prefix = ''): RawListing {
	const out: RawListing = {}
	for (const [key, value] of Object.entries(obj)) {
		const fullKey = prefix ? `${prefix}_${key}` : key
		if (value === null || value === undefined) {
			out[fullKey] = null
		} else if (
			typeof value === 'string' ||
			typeof value === 'number' ||
			typeof value === 'boolean'
		) {
			out[fullKey] = value
		} else if (Array.isArray(value)) {
			// Convert primitive arrays to a count or join; skip nested object arrays.
			if (value.every((v) => typeof v === 'string' || typeof v === 'number')) {
				out[`${fullKey}_count`] = value.length
				if (value.length <= 8) out[fullKey] = value.join(', ')
			}
		} else if (typeof value === 'object') {
			// One level of recursion to surface common patterns like { price: { value, currency } }.
			const nested = flatten(value as Record<string, unknown>, fullKey)
			Object.assign(out, nested)
		}
	}
	return out
}

async function fetchPage(url: string, signal: AbortSignal): Promise<string | null> {
	try {
		const res = await fetch(url, {
			headers: {
				'User-Agent': USER_AGENT,
				Accept: 'text/html,application/xhtml+xml',
				'Accept-Language': 'en-MY,en;q=0.9',
			},
			signal,
		})
		if (!res.ok) return null
		return await res.text()
	} catch {
		return null
	}
}

function parseListingsFromHtml(html: string): RawListing[] {
	const match = html.match(NEXT_DATA_RE)
	if (!match) return []
	let json: unknown
	try {
		json = JSON.parse(match[1]!)
	} catch {
		return []
	}
	const candidates: Record<string, unknown>[] = []
	collectListings(json, candidates)
	const seen = new Set<string>()
	const out: RawListing[] = []
	for (const c of candidates) {
		const flat = flatten(c)
		const sig = JSON.stringify(flat)
		if (seen.has(sig)) continue
		seen.add(sig)
		out.push(flat)
	}
	return out
}

export class CarsomeAdapter implements SourceAdapter {
	readonly name = 'carsome.my'

	constructor(private readonly pages: string[] = DEFAULT_PAGES) {}

	async fetch(options: SourceFetchOptions = {}): Promise<SourceResult> {
		const fetchedAt = new Date().toISOString()
		if (options.offline) {
			return {
				source: this.name,
				fetchedAt,
				listings: SAMPLE_LISTINGS,
				usedFallback: true,
				notes: 'offline mode — using bundled sample dataset',
			}
		}

		const controller = new AbortController()
		const timer = setTimeout(() => controller.abort(), 15_000)
		const collected: RawListing[] = []
		const errors: string[] = []
		try {
			for (const url of this.pages) {
				const html = await fetchPage(url, controller.signal)
				if (!html) {
					errors.push(`fetch failed: ${url}`)
					continue
				}
				const listings = parseListingsFromHtml(html)
				if (listings.length === 0) {
					errors.push(`no listings parsed from: ${url}`)
					continue
				}
				collected.push(...listings)
				if (options.limit && collected.length >= options.limit) break
			}
		} finally {
			clearTimeout(timer)
		}

		if (collected.length === 0) {
			return {
				source: this.name,
				fetchedAt,
				listings: SAMPLE_LISTINGS,
				usedFallback: true,
				notes: `live fetch unavailable (${errors.join('; ') || 'no data'}) — using bundled sample dataset`,
			}
		}

		return {
			source: this.name,
			fetchedAt,
			listings: options.limit ? collected.slice(0, options.limit) : collected,
			usedFallback: false,
		}
	}
}
