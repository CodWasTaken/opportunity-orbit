import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.BASE_PATH || '/opportunity-orbit/',
  build: { target: 'es2022', outDir: 'dist' },
});
