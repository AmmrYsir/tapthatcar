import type { Schema } from '../types'
import { describeField } from '../util/format'

export function SchemaPanel({ schema, weights }: { schema: Schema; weights: Record<string, number> }) {
	const sortedWeights = Object.entries(weights).sort((a, b) => b[1] - a[1])
	const max = sortedWeights[0]?.[1] ?? 1

	return (
		<>
			<section className="panel">
				<h2>Weights ({sortedWeights.length} value fields)</h2>
				{sortedWeights.map(([name, w]) => (
					<div className="weight-row" key={name}>
						<div className="name">{describeField(name)}</div>
						<div className="pct">{(w * 100).toFixed(1)}%</div>
						<div className="bar">
							<div className="fill" style={{ width: `${(w / max) * 100}%` }} />
						</div>
					</div>
				))}
			</section>

			<section className="panel">
				<h2>Discovered schema</h2>
				<div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
					{schema.keptListings} of {schema.totalListings} listings kept
				</div>
				<div style={{ marginBottom: 10 }}>
					<div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>VALUE</div>
					<div className="field-list">
						{schema.valueFields.map((f) => (
							<span className="pill" key={f}>{describeField(f)}</span>
						))}
					</div>
				</div>
				<div style={{ marginBottom: 10 }}>
					<div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>CONTEXT</div>
					<div className="field-list">
						{schema.contextFields.map((f) => (
							<span className="pill" key={f}>{describeField(f)}</span>
						))}
					</div>
				</div>
				<div>
					<div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>AUXILIARY</div>
					<div className="field-list">
						{schema.auxiliaryFields.map((f) => (
							<span className="pill" key={f}>{describeField(f)}</span>
						))}
					</div>
				</div>
			</section>
		</>
	)
}
