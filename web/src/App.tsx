import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchTop } from './api'
import type { PipelineResponse } from './types'
import { CarCard } from './components/CarCard'
import { SchemaPanel } from './components/SchemaPanel'
import { Toolbar, type ToolbarState } from './components/Toolbar'

const INITIAL: ToolbarState = { limit: 10, offline: false, filters: {} }

export function App() {
	const [state, setState] = useState<ToolbarState>(INITIAL)
	const [data, setData] = useState<PipelineResponse | undefined>()
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | undefined>()

	const load = useCallback(async (s: ToolbarState) => {
		setLoading(true)
		setError(undefined)
		try {
			const res = await fetchTop({ limit: s.limit, offline: s.offline, filters: s.filters })
			setData(res)
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e))
		} finally {
			setLoading(false)
		}
	}, [])

	// Initial fetch + react to filter/limit changes (debounced 250ms).
	useEffect(() => {
		const t = setTimeout(() => void load(state), 250)
		return () => clearTimeout(t)
	}, [load, state])

	const banner = useMemo(() => {
		if (error) return { kind: 'error' as const, msg: error }
		if (data?.sourceMeta.usedFallback) {
			return {
				kind: 'warn' as const,
				msg: `Live source unavailable — showing the bundled sample dataset. ${data.sourceMeta.notes ?? ''}`.trim(),
			}
		}
		return undefined
	}, [data, error])

	return (
		<div className="app">
			<header className="header">
				<div>
					<h1>tapthatcar</h1>
					<div className="sub">
						Schema-discovering, dynamically-weighted ranking of used cars.
						{data ? ` · ${data.results.length} of ${data.schema.keptListings} shown` : null}
					</div>
				</div>
				<div className="sub">
					{data ? `Source: ${data.sourceMeta.name} · fetched ${new Date(data.fetchedAt).toLocaleTimeString()}` : null}
				</div>
			</header>

			<Toolbar state={state} onChange={setState} onRefresh={() => void load(state)} loading={loading} last={data} />

			{banner ? <div className={`banner ${banner.kind === 'error' ? 'error' : ''}`}>{banner.msg}</div> : null}

			<main className="cards">
				{loading && !data ? (
					<>
						<div className="skeleton" />
						<div className="skeleton" />
						<div className="skeleton" />
					</>
				) : data && data.results.length > 0 ? (
					data.results.map((r) => <CarCard key={`${r.rank}-${String(r.listing.id ?? '')}`} item={r} />)
				) : (
					<div className="empty">No listings match these filters.</div>
				)}
			</main>

			<aside className="sidebar">
				{data ? <SchemaPanel schema={data.schema} weights={data.weights} /> : null}
			</aside>
		</div>
	)
}
