import { defineConfig } from 'vite';

// GitHub Pages serves this project under /crypto-lab-broken-trust/.
export default defineConfig({
  base: '/crypto-lab-broken-trust/',
  test: {
    globals: true,
    environment: 'node',
  },
});
