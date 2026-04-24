import type { ScoredListing } from '../types'
import { describeField, fmtKm, fmtNumber, fmtPrice, pickField } from '../util/format'

export function CarCard({ item }: { item: ScoredListing }) {
	const l = item.listing as Record<string, unknown>
	const brand = pickField(l, [/^brand$/i, /^make$/i]) as string | undefined
	const model = pickField(l, [/^model$/i]) as string | undefined
	const variant = pickField(l, [/variant|trim/i]) as string | undefined
	const year = pickField(l, [/^year$/i, /mfg_year/i]) as number | undefined
	const mileage = pickField(l, [/mileage|odometer|km$/i])
	const price = pickField(l, [/price|asking|amount/i])
	const transmission = pickField(l, [/trans/i]) as string | undefined
	const fuel = pickField(l, [/^fuel/i]) as string | undefined
	const body = pickField(l, [/^body$/i]) as string | undefined
	const location = pickField(l, [/location|city|state/i]) as string | undefined
	const owners = pickField(l, [/owner/i])

	const pct = Math.round(item.score * 100)

	return (
		<article className="card">
			<div className="rank">#{item.rank}</div>
			<div>
				<h3 className="title">
					{[brand, model].filter(Boolean).join(' ')}
					{variant ? <span className="variant">{variant}</span> : null}
				</h3>
				<div className="subtitle">
					{year ? <span>{year}</span> : null}
					{mileage !== undefined ? (
						<>
							<span className="dot" />
							<span>{fmtKm(mileage)}</span>
						</>
					) : null}
					{owners !== undefined ? (
						<>
							<span className="dot" />
							<span>{fmtNumber(owners)} owner{owners === 1 ? '' : 's'}</span>
						</>
					) : null}
					{location ? (
						<>
							<span className="dot" />
							<span>{location}</span>
						</>
					) : null}
				</div>
				<div>
					{transmission ? <span className="tag">{transmission}</span> : null}
					{fuel ? <span className="tag">{fuel}</span> : null}
					{body ? <span className="tag">{body}</span> : null}
				</div>

				<p className="summary">{item.explanation.summary}</p>

				<div className="bullets">
					<div className="col strengths">
						<h4>Why it ranks well</h4>
						{item.explanation.strengths.length ? (
							<ul>
								{item.explanation.strengths.map((s, i) => (
									<li key={i}>{s}</li>
								))}
							</ul>
						) : (
							<p style={{ fontSize: 12, color: 'var(--muted)' }}>No standout strengths vs cohort.</p>
						)}
					</div>
					<div className="col tradeoffs">
						<h4>Trade-offs</h4>
						{item.explanation.tradeoffs.length ? (
							<ul>
								{item.explanation.tradeoffs.map((s, i) => (
									<li key={i}>{s}</li>
								))}
							</ul>
						) : (
							<p style={{ fontSize: 12, color: 'var(--muted)' }}>No notable weaknesses.</p>
						)}
					</div>
				</div>

				<div className="contrib">
					{item.explanation.contributions.slice(0, 5).map((c) => (
						<div className="row" key={c.field}>
							<div className="name">{describeField(c.field)}</div>
							<div className="bar">
								<div className="fill" style={{ width: `${Math.round(c.normalized * 100)}%` }} />
							</div>
							<div className="pct">{Math.round(c.contribution * 100)}%</div>
						</div>
					))}
				</div>
			</div>
			<div className="score-pill">
				<div className="pct">{pct}</div>
				<div className="label">{fmtPrice(price)}</div>
			</div>
		</article>
	)
}
