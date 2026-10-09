# #18 GitHub-hosted browser regression candidate

Status: **BROWSER EXECUTION NOT RUN / NOT ACCEPTED**. Bun syntax/transpilation and bounded independent source review of candidate v2 passed. Real dependency typecheck, sandboxed browser execution, positive/negative controls, update lifecycle, and timeout/cleanup failure paths are still NOT RUN. No Playwright package or browser was installed, no browser/server was launched, and no workflow changed. A real runner execution remains required before browser acceptance.

This Draft checkpoint adds only the harness, its independent typecheck configuration, and this proposal. It does not wire the harness into any package script, workflow, or application entry point. Opening the Draft may run the repository's unchanged existing PR CI automatically; that CI does not execute or typecheck this harness and cannot establish browser acceptance. No Actions run is manually dispatched or rerun for this checkpoint.

## Existing baseline

Checkpoint base: master `76cda7983a3c0c6152eaaa8c07503bd8b3a7f0b6`, tree `d21c306f98e238f27a6ea54a67975189cbabfbd4`, verified on 2026-10-09. The earlier proposal snapshot used `441c6dbce703b3bb6c001719cecfd9bb0424e59e`; its statements that #85/#87 were Drafts are historical and do not describe the checkpoint base. No existing files are changed by this checkpoint.

The repository at this base has no Playwright/Puppeteer dependency or browser test runner. `.github/workflows/ci.yml` uses `ubuntu-latest`, Bun, `contents: read`, unit tests, four typechecks, doctor and build. Pages deployment only runs for master pushes or manual dispatch. The adjacent source regression checks an `ignoreVary` string only. Production `apps/web/pwa/sw.js` is unchanged by this checkpoint (3421 bytes; SHA-256 `0d8d8cc6b7469d8a674786cbe3550e86b7f2308761e3cd93e6af5b942e9a808d`). The earlier local baseline capture contains one additional trailing newline (3422 bytes; SHA-256 `225a167e164be9a500d5ce0af4bf6dd50b4e48e0c6c3047beb72892287552af2`); no other source text differs. The harness reads the actual repository worker at execution time.

## Proposed runner setup, subject to explicit approval

Use an additional narrowly scoped standard GitHub-hosted Ubuntu job, not a desktop, Codex/Work container or paid custom runner. Preserve `contents: read`; do not grant new permissions, use secrets, publish a site, alter branch rules, or deploy. The existing successful CI need not be manually rerun.

Proposed dependency: official Microsoft `playwright` package, exact `1.56.1`, whose official release pins Chromium `141.0.7390.37`. This is an explicitly pinned reproducibility baseline, not a claim it is the newest release. A reviewer can choose a newer verified pin before installation; package version, lockfile and browser binary must stay matched. Use the Playwright library, not a second test runner or a hand-written Cache polyfill.

After approval, dependency preparation would use `bun add --dev --exact playwright@1.56.1` at the repository root and review/commit the resulting package.json and bun.lock. Those changes are NOT included or fabricated in this candidate. CI would then use:

```sh
bun install --frozen-lockfile
bun node_modules/typescript/bin/tsc -p apps/web/tsconfig.pwa-browser.json
bun node_modules/playwright/cli.js install --with-deps chromium
PWA_BROWSER_CHECK=1 bun apps/web/scripts/pwa-browser-check.ts
```

`GITHUB_ACTIONS=true` is supplied by the hosted runner. The harness refuses to run without both this flag and the explicit opt-in. Do not set these flags to bypass a denied cloud-browser or local-execution route. Installing Chromium and its standard OS libraries is runner preparation, not changing the user's computer or weakening browser sandbox settings. Do not add `--no-sandbox`, `ignoreHTTPSErrors`, custom security permissions or credentials.

The additional job can be limited to changes affecting `apps/web/pwa/**`, this script, its independent `tsconfig.pwa-browser.json`, its dependency/lock, and its eventual workflow. Set a job timeout comfortably above the script's 120-second test timeout and installation budget (e.g. 10 minutes). Upload `pwa-browser-results/` with an always-run artifact step, including failure results and trace; do not mark failures continue-on-error. No workflow YAML is written here because that change requires review first.

The independent typecheck is mandatory because the ordinary web tsconfig does not include this script. It must resolve real Playwright and Bun types after dependency installation; no stub types are supplied to fake acceptance. This candidate's typecheck is NOT RUN. The launch explicitly uses `chromiumSandbox: true`; do not rely on Playwright's default or fall back to an unsandboxed launch. If the chosen standard runner cannot launch with this requirement, record a blocker instead of changing security settings.

## What the candidate actually tests

The added script is `apps/web/scripts/pwa-browser-check.ts`. It starts a loopback Bun fixture server **only on the approved runner**, using `/fortunetelling/` and a fresh Playwright browser context for each scenario. Each context owns isolated native Chromium CacheStorage and service-worker registrations and is destroyed afterward. No saved user profile or personal data is used.

1. Serve the actual production `apps/web/pwa/sw.js`, replacing only its existing VERSION and PRECACHE placeholders for the positive case. Serve a tiny synthetic HTML page and a JavaScript module. This is intentionally not a fake cache and not a clone of worker logic.
2. The JavaScript response has `Vary: X-PWA-Variant`. Precache installation has no such request header. A subsequent request with that header must miss native `Cache.match` by default and hit when `ignoreVary: true`. These baseline assertions ensure there is a real native Vary mismatch rather than a string assertion or an incidental HTTP-cache hit. The header is a deterministic controllable fixture, not a claim that deployment returns this Vary value or a browser always sends Origin.
3. Update the same worker URL from v1 to v2, with a changed fixture module and cache version. Retain the original controller object; await a distinct controller that is also the registration's activated worker. Verify v1's precache is gone, v2 has its new module, and independently populated runtime/unrelated caches keep their contents. Cache-key changes alone do not prove client takeover.
4. Stop the server and put the browser context offline. A never-cached request must fail. Production worker must still satisfy the header-mismatched JS request with v2 bytes; also execute a genuine dynamic module import and reload the cached synthetic shell offline.
5. In a separate fresh context, serve a deliberate negative-control copy that removes exactly one `ignoreVary: true` option. Nothing in the repository worker is changed. Native baseline checks must still hold, and the offline header-mismatched fetch must now fail. If it succeeds, the harness exits nonzero. This negative control is explicitly a test mutation, never the positive implementation or a deployed asset.

The positive worker's functional source remains unchanged. Fixture version changes model two installations; they do not certify that the production build plugin correctly hashes all real assets. The negative control demonstrates the test's sensitivity to the original Vary omission only.

## Evidence and failure behavior

- Explicit registration/activation/controller-replacement waits and bounded browser waits; 120-second test deadline after the separately bounded 15-second browser launch. On deadline, close the browser to interrupt pending commands, await the actual checks and timeout cleanup, then write results. There is no dangling Promise.race loser writing later.
- Failure returns a nonzero process exit code, including absent negative-control sensitivity and cleanup failures. No skipped browser check can become PASS.
- JSON includes source SHA-256, GitHub commit, Bun version, each scenario's native-cache observations, update keys/content, offline outcomes and diagnostics.
- Per-case trace ZIP and failure screenshot; `finally` awaits memoized server-stop promises and closes contexts/browser. Server stop rejections remain rejections on repeat cleanup, are recorded, and force failure. All trace/cleanup work settles before that case's result is appended. Timeout-induced browser closure can prevent trace/screenshot completion; any such cleanup error remains visible and cannot yield PASS. A runner-level forced kill may prevent artifacts, and must be reported as incomplete, never passing.
- Browser/server launch or dependency failures are blockers; do not substitute another restricted environment.

## Acceptance limits and remaining #18 work

This candidate tests native Chromium Vary handling, actual worker cache routing, and a synthetic update lifecycle. It does not run the production app's report form, lunar-calendar controls, full build-generated precache, GitHub Pages offline session or phone PWA. Even a future green runner result cannot close all #18 acceptance criteria or certify iOS/WebKit behavior.

The earlier read-only deployed-header capture separately observed `Vary: Accept-Encoding`, with identical report/core chunk bytes for requests with/without Origin. These observations do not remove the need for a deterministic Vary regression.

No birth profile is needed for this synthetic harness. If an approved future deployed-UI case is added, use an invented profile only (e.g. “QA Synthetic”, 1995-07-16 22:00, male, precise time, Tainan); do not upload real birth data, cookies or browser profiles. The current user direction excludes the local computer.

## Official references

- [Playwright v1.56.1 release and bundled browser versions](https://github.com/microsoft/playwright/releases/tag/v1.56.1)
- [Playwright CI installation and timeout guidance](https://playwright.dev/docs/ci)
- [Service workers and activation](https://playwright.dev/docs/service-workers)
- [BrowserContext offline mode](https://playwright.dev/docs/api/class-browsercontext#browser-context-set-offline)

These references support the proposed tool APIs; they do not constitute an executed result for this repository.
