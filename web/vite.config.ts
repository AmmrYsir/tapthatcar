import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite proxies /api/* to the Fastify backend on :3000 during dev.
// In production you can serve web/dist statically from any host.
export default defineConfig({
	plugins: [react()],
	server: {
		port: 5173,
		proxy: {
			'/api': {
				target: 'http://localhost:3000',
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/api/, ''),
			},
		},
	},
	build: {
		outDir: 'dist',
		sourcemap: true,
	},
})
