import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The engines are pure TypeScript with no React Native imports, so they run
    // directly under node. UI is verified separately by the Metro web export.
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
