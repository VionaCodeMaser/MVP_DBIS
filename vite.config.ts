import { defineConfig } from 'vite'
export default defineConfig({ build: { rollupOptions: { input: { watch: 'index.html', report: 'report.html' } } } })
