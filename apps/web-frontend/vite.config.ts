import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
export default defineConfig(({mode})=>{
  const envDir = '../..';
  const port = process.env.PORT ?? loadEnv(mode,envDir,'').PORT ?? '8787';
  const proxy = { '/api': 'http://127.0.0.1:'+port };
  return {
    envDir,
    plugins: [react(),tailwind()],
    server: { host: '127.0.0.1',proxy },
    preview: { proxy },
    build: { rollupOptions: { output: { manualChunks: { charts: ['recharts'] } } } },
  };
});
