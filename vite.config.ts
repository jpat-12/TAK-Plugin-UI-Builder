/// <reference types="vitest" />
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  // Relative base so the static build works from any subpath (GitHub Pages, infra-TAK) — PLAN.md D6
  base: './',
  // Emitter tests write a tsconfig into .emit-tmp/; without this the dev server sees it and
  // force-reloads the open page mid-edit whenever `npm test` runs.
  server: { watch: { ignored: ['**/.emit-tmp/**'] } },
  test: {
    include: ['test/**/*.test.ts'],
  },
});
