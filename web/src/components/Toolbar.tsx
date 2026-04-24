import { useMemo } from 'react'
import type { PipelineResponse } from '../types'

export interface ToolbarState {
	limit: number
	offline: boolean
	filters: Record<string, string>
}

interface Props {
	state: ToolbarState
	onChange: (next: ToolbarState) => void
	onRefresh: () => void
	loading: boolean
	last?: PipelineResponse
}

/** Fields with low cardinality become dropdowns. */
function dropdownFieldsFrom(last?: PipelineResponse): Array<{ name: string; values: string[] }> {
	if (!last) return []
	const out: Array<{ name: string; values: string[] }> = []
	for (const name of last.schema.contextFields) {
		const meta = last.schema.fields[name]
		if (!meta) continue
		// Collect unique values across the *displayed* listings as a starting point.
		const seen = new Set<string>()
		for (const r of last.results) {
			const v = r.listing[name]
			if (v !== null && v !== undefined && v !== '') seen.add(String(v))
		}
		if (seen.size >= 2 && seen.size <= 24) {
			out.push({ name, values: [...seen].sort() })
		}
	}
	return out
}

export function Toolbar({ state, onChange, onRefresh, loading, last }: Props) {
	const dropdowns = useMemo(() => dropdownFieldsFrom(last), [last])

	const setFilter = (k: string, v: string) => {
		const next = { ...state.filters }
		if (v) next[k] = v
		else delete next[k]
		onChange({ ...state, filters: next })
	}

	return (
		<div className="toolbar">
			<label>
				Limit
				<input
					type="number"
					min={1}
					max={50}
					value={state.limit}
					onChange={(e) => onChange({ ...state, limit: Math.max(1, Math.min(50, Number(e.target.value) || 10)) })}
				/>
			</label>
			{dropdowns.map(({ name, values }) => (
				<label key={name}>
					{name.replace(/[_-]+/g, ' ')}
					<select value={state.filters[name] ?? ''} onChange={(e) => setFilter(name, e.target.value)}>
						<option value="">Any</option>
						{values.map((v) => (
							<option value={v} key={v}>{v}</option>
						))}
					</select>
				</label>
			))}
			<label>
				Mode
				<select
					value={state.offline ? '1' : '0'}
					onChange={(e) => onChange({ ...state, offline: e.target.value === '1' })}
				>
					<option value="0">Live (carsome.my)</option>
					<option value="1">Offline (sample)</option>
				</select>
			</label>
			<button onClick={onRefresh} disabled={loading}>
				{loading ? 'Loading…' : 'Refresh'}
			</button>
			{Object.keys(state.filters).length > 0 ? (
				<button className="secondary" onClick={() => onChange({ ...state, filters: {} })}>
					Clear filters
				</button>
			) : null}
		</div>
	)
}
