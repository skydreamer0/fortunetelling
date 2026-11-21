import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { pwa } from './pwa/plugin';
import { officialBuildSource } from './release-source';

import { releaseLicenses } from './release-licenses';

// GitHub Pages serves the site from /<repo-name>/.
export default defineConfig({
  base: '/fortunetelling/',
  plugins: [react(), releaseLicenses(), pwa()],
  define: { 'import.meta.env.VITE_FORTUNE_BUILD_SOURCE': JSON.stringify(officialBuildSource() ?? '') },
  build: {
    rolldownOptions: {
      output: {
        // Keep the calculation libraries out of the UI chunk so UI changes stay cache-friendly.
        // The core chunk is only reached through dynamic import() (see src/lib/calendar.ts loadCore),
        // so the home page never downloads it; the offline city table is the one core module the
        // input form needs up front, so it gets its own small chunk ahead of the core group.
        codeSplitting: {
          groups: [
            // Vite's dynamic-import helper would otherwise be captured by `core` and make the entry import it.
            { name: 'preload', test: /vite[\/]preload-helper/, priority: 20 },
            { name: 'cities', test: /packages[\/]core[\/]src[\/]profile[\/]cities/, priority: 10 },
            { name: 'core', test: /packages[\/]core|node_modules[\/](iztro|lunar-javascript)/ },
          ],
        },
      },
    },
  },
});
