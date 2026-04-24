import { buildServer } from './src/server.ts'

const port = Number(process.env.PORT ?? 3000)
const host = process.env.HOST ?? '0.0.0.0'

const fastify = buildServer()

try {
	await fastify.listen({ port, host })
} catch (err) {
	fastify.log.error(err)
	process.exit(1)
}
