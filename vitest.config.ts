import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: [
    { find: /^@fortune\/core\/pure$/, replacement: fileURLToPath(new URL("./packages/core/src/pure.ts", import.meta.url)) },
    { find: /^@fortune\/core$/, replacement: fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)) },
    { find: /^@fortune\/ai$/, replacement: fileURLToPath(new URL("./packages/ai/src/index.ts", import.meta.url)) },
    ...["copy", "mcp", "client"].map(name => ({ find: `@fortune/ai/${name}`, replacement: fileURLToPath(new URL(`./packages/ai/src/${name}.ts`, import.meta.url)) })),
  ] },
  test: {
    // Match the audited inventory, including legacy underscore naming.
    include: ['**/*{.,_}{test,spec}.{js,jsx,ts,tsx,mjs,cjs,mts,cts}'],
    exclude: ['**/node_modules/**', '**/.*/**'],
    environment: 'node',
    isolate: true,
    // Stateful clocks, module mocks and WASM runtimes must not share files.
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
