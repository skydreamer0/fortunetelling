# Node.js toolchain migration

Tracking: [#140](https://github.com/skydreamer0/fortunetelling/issues/140).

## Runtime and installation

Use Node.js 24.19.0 (`.nvmrc`) and npm 11.9.0. Run `npm ci` at the repository
root. The prepare script builds core, AI and MCP in dependency order. There is
no Bun runtime, test runner or type dependency. Vitest is the test runner.

`package-lock.json` preserves the existing dependency versions and integrity
values, apart from replacing Bun types with Node 24 types and adding the
explicit test/build tooling. Root overrides retain the original transitive
resolution, including distinct content-type 1.x and 2.x consumers. Future
dependency upgrades must deliberately review these pins and the calculation
dependency identity; this migration does not update calculation metadata.

## Package and MCP consumers

- `@fortune/core`, `@fortune/ai` and its copy/mcp/client entries, and
  `@fortune/mcp` expose built ESM and declarations in `dist`.
- `@fortune/core/pure` exposes exactly the calculator-free bridge previously
  reached through AI's relative imports into core source. It does not load the
  calculator barrel.
- MCP client command: `node`; sole argument:
  `/absolute/path/fortunetelling/packages/mcp/dist/bin.js`.
- Rebuild after source changes: `npm run build:packages`. `npm run dev` and
  `npm run build` do this automatically. `npm run doctor -- --ci` skips desktop
  configuration; set `FORTUNE_PROFILES_DIR` to an isolated directory for
  synthetic checks.
- Packages remain private workspace packages. Building them does not publish
  to npm or select a project license.

## WASM and compatibility

Browser initialization retains the existing binding and Vite-managed WASM
asset. Node loads the same pinned `@swisseph/browser` 1.3.1 WASM from disk and
initializes its wrapper without fetch, stdout logging or global monkey patches.
The adapter uses the pinned binding's internal initialization fields, so a
binding upgrade must revalidate the offline built-package integration test.

Calculation formulas, report versions, calculation identities and archived
golden bytes are not rewritten by the runtime migration. The accompanying
comparison tool contrasts supported BaZi time conventions; it is not a new
school calculation engine or evidence of predictive accuracy.

## Verification

Run `npm test`, `npm run typecheck`,
`node node_modules/typescript/bin/tsc -p scripts/ci/tsconfig.json`,
`npm run doctor -- --ci`, and `npm run build` after a clean install.
Tests include the stock-Node built SDK, real offline WASM parity and built MCP
stdio transport. CI retains explicit file inventories, skip checks, four-TZ
isolation and native OS receipts. Passing Linux checks does not establish
Windows/macOS or hosted Chrome acceptance. See the Issue/PR for actual runs.

Historical ADRs, validation receipts and archived Bun results retain their
original runtime labels; they are historical evidence, not Node pass claims.
This supersedes the runtime/package-manager part of D-025 only.
