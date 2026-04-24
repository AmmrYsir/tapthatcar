import { CarsomeAdapter } from './carsome.ts'
import type { SourceAdapter } from './types.ts'

const adapters = new Map<string, SourceAdapter>()
adapters.set('carsome', new CarsomeAdapter())

export function getAdapter(name = 'carsome'): SourceAdapter {
	const a = adapters.get(name.toLowerCase())
	if (!a) throw new Error(`unknown source adapter: ${name}`)
	return a
}

export function listAdapters(): string[] {
	return [...adapters.keys()]
}

export type { SourceAdapter, SourceFetchOptions, SourceResult } from './types.ts'
