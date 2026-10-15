import { defineConfig, mergeConfig } from 'vitest/config';
import base from '../../vitest.config';

// Vite's module runner treats # in the encoded checkout as a URL fragment.
// Keep the real checkout path and run these Node-only suites with native ESM.
// https://vitest.dev/config/experimental#experimental-vitemodulerunner
const tsxApi = import.meta.resolve('tsx/esm/api');
const registerTsx = `import * as tsx from ${JSON.stringify(tsxApi)};tsx.register()`;
export default mergeConfig(base, defineConfig({
  test: {
    experimental: { viteModuleRunner: false },
    execArgv: [`--import=data:text/javascript,${encodeURIComponent(registerTsx)}`],
  },
}));
