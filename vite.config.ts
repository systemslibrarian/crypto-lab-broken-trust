import { defineConfig, configDefaults } from 'vitest/config';

// GitHub Pages serves this project under /crypto-lab-broken-trust/.
export default defineConfig({
  base: '/crypto-lab-broken-trust/',
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
});
