import { defineConfig } from 'vite';

// assets/ をそのまま静的配信する（/stacks/... で参照できる）
export default defineConfig({
  publicDir: 'assets',
  server: { host: '127.0.0.1', port: 5173, open: false },
  test: { include: ['tests/**/*.test.ts'] },
} as any);
