import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  // The API port comes from the project-root .env (PORT), unless API_URL is given.
  const rootEnv = loadEnv(mode, '..', '');
  const API = process.env.API_URL ?? `http://localhost:${rootEnv.PORT || 4000}`;
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      proxy: {
        '/api': API,
        '/media': API,
      },
    },
    build: {
      target: 'es2020',
      chunkSizeWarningLimit: 1000, // three.js lives in its own lazy chunk (hero only)
    },
  };
});
