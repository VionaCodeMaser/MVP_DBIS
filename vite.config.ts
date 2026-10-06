import { defineConfig } from 'vite'
export default defineConfig({ base: process.env.DEMO_BASE_PATH || '/', build: { rollupOptions: { input: { watch: 'index.html', report: 'report.html' } } } })
