export function fmtPrice(v: unknown): string {
	if (typeof v !== 'number' || !Number.isFinite(v)) return '—'
	return `RM ${v.toLocaleString('en-MY')}`
}

export function fmtKm(v: unknown): string {
	if (typeof v !== 'number' || !Number.isFinite(v)) return '—'
	return `${v.toLocaleString('en-MY')} km`
}

export function fmtNumber(v: unknown): string {
	if (typeof v !== 'number' || !Number.isFinite(v)) return String(v ?? '—')
	return v.toLocaleString('en-MY')
}

export function describeField(name: string): string {
	return name.replace(/[_-]+/g, ' ')
}

/** Pick the first value whose key matches one of the candidate patterns. */
export function pickField(
	listing: Record<string, unknown>,
	candidates: RegExp[],
): unknown {
	for (const re of candidates) {
		for (const [k, v] of Object.entries(listing)) {
			if (re.test(k) && v !== null && v !== undefined && v !== '') return v
		}
	}
	return undefined
}
