import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { pwa } from './pwa/plugin';

// GitHub Pages serves the site from /<repo-name>/.
export default defineConfig({
  base: '/fortunetelling/',
  plugins: [react(), pwa()],
  build: {
    rolldownOptions: {
      output: {
        // Keep the calculation libraries out of the UI chunk so UI changes stay cache-friendly.
        codeSplitting: {
          groups: [{ name: 'core', test: /packages[\/]core|node_modules[\/](iztro|lunar-javascript)/ }],
        },
      },
    },
  },
});
