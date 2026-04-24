/** Tiny statistics helpers used across the engine. */

export function quantile(sortedAsc: number[], q: number): number {
	if (sortedAsc.length === 0) return NaN
	if (sortedAsc.length === 1) return sortedAsc[0]!
	const pos = (sortedAsc.length - 1) * q
	const base = Math.floor(pos)
	const rest = pos - base
	const a = sortedAsc[base]!
	const b = sortedAsc[base + 1] ?? a
	return a + rest * (b - a)
}

export interface NumericSummary {
	min: number
	max: number
	mean: number
	median: number
	p10: number
	p90: number
	variance: number
}

export function summarise(values: number[]): NumericSummary {
	const sorted = [...values].sort((a, b) => a - b)
	const n = sorted.length
	if (n === 0) {
		return { min: 0, max: 0, mean: 0, median: 0, p10: 0, p90: 0, variance: 0 }
	}
	const sum = sorted.reduce((a, b) => a + b, 0)
	const mean = sum / n
	const variance = sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n
	return {
		min: sorted[0]!,
		max: sorted[n - 1]!,
		mean,
		median: quantile(sorted, 0.5),
		p10: quantile(sorted, 0.1),
		p90: quantile(sorted, 0.9),
		variance,
	}
}

/** Tukey-fence outlier bounds (k * IQR). k=3 is "extreme" outliers only. */
export function outlierBounds(values: number[], k = 3): { low: number; high: number } {
	const sorted = [...values].sort((a, b) => a - b)
	const q1 = quantile(sorted, 0.25)
	const q3 = quantile(sorted, 0.75)
	const iqr = q3 - q1
	return { low: q1 - k * iqr, high: q3 + k * iqr }
}

/** Min-max normalise into [0,1]; collapses to 0.5 for degenerate ranges. */
export function minMax(value: number, min: number, max: number): number {
	if (!Number.isFinite(value)) return 0
	if (max <= min) return 0.5
	const v = (value - min) / (max - min)
	return Math.max(0, Math.min(1, v))
}

/** Coefficient of variation, capped to [0,1] for use as a weight signal. */
export function variancesignal(stats: NumericSummary): number {
	if (stats.mean === 0 || !Number.isFinite(stats.mean)) return 0
	const cv = Math.sqrt(stats.variance) / Math.abs(stats.mean)
	return Math.min(1, cv)
}
