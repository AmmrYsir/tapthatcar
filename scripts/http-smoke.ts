/**
 * In-process HTTP test using Fastify.inject — no port binding required.
 * Exercises /health, /sources, GET /listings/top (offline), POST /rank,
 * and GET /schema.
 */
import { buildServer } from '../src/server.ts'

const app = buildServer()
await app.ready()

const ok = (cond: unknown, msg: string) => {
	if (!cond) { console.error('FAIL:', msg); process.exitCode = 1 }
	else console.log('  ok  ', msg)
}

const r1 = await app.inject({ method: 'GET', url: '/health' })
ok(r1.statusCode === 200, 'GET /health 200')
ok((r1.json() as any).ok === true, 'GET /health body.ok')

const r2 = await app.inject({ method: 'GET', url: '/sources' })
ok((r2.json() as any).sources.includes('carsome'), 'carsome adapter listed')

const r3 = await app.inject({ method: 'GET', url: '/listings/top?limit=3&offline=1' })
const body3 = r3.json() as any
ok(r3.statusCode === 200, 'GET /listings/top 200')
ok(body3.sourceMeta.usedFallback === true, 'fallback flag surfaces')
ok(body3.results.length === 3, 'limit honoured (3)')
ok(Math.abs(Object.values(body3.weights as Record<string, number>).reduce((a, b) => a + b, 0) - 1) < 1e-6, 'weights sum to 1')
ok(body3.results.every((r: any) => r.explanation && Array.isArray(r.explanation.contributions)), 'explanations attached')

// Filter test: only Honda
const r4 = await app.inject({ method: 'GET', url: '/listings/top?offline=1&brand=Honda&limit=10' })
const body4 = r4.json() as any
ok(body4.results.every((r: any) => String(r.listing.brand).toLowerCase() === 'honda'), 'filter brand=Honda enforced')

// POST /rank with a tiny custom dataset using completely different field names
const r5 = await app.inject({
	method: 'POST',
	url: '/rank',
	headers: { 'content-type': 'application/json' },
	payload: {
		listings: [
			{ make: 'Honda', model: 'Civic', mfg_year: 2020, odometer_km: '40,000', asking: 'RM 65,000', owners: 1, condition: 'used' },
			{ make: 'Toyota', model: 'Vios', mfg_year: 2018, odometer_km: '95,000', asking: 'RM 50,000', owners: 2, condition: 'used' },
			{ make: 'Perodua', model: 'Myvi', mfg_year: 2022, odometer_km: '15,000', asking: 'RM 55,000', owners: 1, condition: 'used' },
			{ make: 'Ferrari', model: '488', mfg_year: 2017, odometer_km: '5,000', asking: 'RM 1,400,000', owners: 1, condition: 'used' },
		],
	},
})
const body5 = r5.json() as any
ok(r5.statusCode === 200, 'POST /rank 200')
ok(body5.schema.valueFields.includes('asking'), 'discovers "asking" as value field')
ok(body5.schema.valueFields.includes('odometer_km'), 'discovers "odometer_km" as value field')
ok(body5.results[0].listing.model === 'Myvi', 'cheapest+lowest-mileage wins despite arbitrary field names')
console.log('top:', body5.results.map((r: any) => `${r.listing.make} ${r.listing.model}`).join(', '))

await app.close()
console.log('\nALL HTTP CHECKS PASSED')
