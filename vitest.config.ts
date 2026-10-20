import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: false,
    allowOnly: false,
    environment: 'node',
    pool: 'threads',
    setupFiles: ['./tests/setup.ts'],
    projects: [
      {
        extends: true,
        test: {
          name: 'core',
          include: ['src/core/**/*.test.ts', 'src/storage/**/*.test.ts', 'src/app/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'ui',
          include: ['src/ui/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          testTimeout: 15_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'repo',
          include: ['tests/**/*.test.ts'],
          environment: 'node',
        },
      },
    ],
  },
});
