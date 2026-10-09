# #18 GitHub-hosted browser regression candidate

Status: **STOCK-CHROME LAUNCH VERIFIED; BROWSER REGRESSION FAILED / NOT ACCEPTED**. The saved Draft #88 checkpoint passed bounded source review and existing repository CI, which did not execute this harness. This continuation adds an exact official Playwright dev dependency, a genuinely Bun-generated lockfile update, and a narrow PR workflow; it selects the runner's preinstalled stable Google Chrome with its sandbox required. The second hosted attempt passed the dedicated typecheck and launched stock Chrome with sandbox enabled, then failed the production update assertion. This candidate corrects the update-wait predicate; independent review and a new live run are still required. Positive offline and negative controls were not reached. Timeout/cleanup failure paths remain NOT RUN.

Initial local dependency preparation used existing Bun 1.4.2 with `bun add --dev --exact --lockfile-only --ignore-scripts playwright@1.64.0`. It resolved official registry metadata/packages into a dedicated cache and generated package/lock changes without creating `node_modules` or running lifecycle scripts. It did not install or launch a browser, install OS packages, or run this harness. No package scripts or application entry points are added. The existing CI and Pages workflows are unchanged. No Actions run is manually dispatched or rerun.

The first hosted attempt at head `b252dd256a968737267b2981b1fa07a04e3d7cff` stopped before browser launch because the command incorrectly assumed a root `node_modules/typescript/bin/tsc`. TypeScript is installed in the web workspace. A subsequent local `bun install --frozen-lockfile --ignore-scripts` installed the locked dependencies without changing package/lock bytes. The corrected workspace command below resolved TypeScript 7.0.2 and passed the real dedicated typecheck. Setup Bun now explicitly has `no-cache: true`; its success-only cache-save post step was skipped in the first failed attempt. That first attempt confirmed stock Chrome 154.0.8037.97, Playwright 1.64.0, Bun 1.4.2, uid 1001 and Ubuntu image 20261004.327.1, but did not launch the sandboxed browser or execute either control.

The [second hosted attempt](https://github.com/skydreamer0/fortunetelling/actions/runs/37981961930) at head `75ec00b9245b3fd98f4b807680746cfd721e845e` checked out merge commit `5a40289eddc8da4f5c8526a7fe7957c85c730327`, tree `2050ef94ccc024ab5eee731a66caf886f42f6994`. Its real dedicated typecheck passed and Chrome 154.0.8037.97 launched with `chromiumSandbox: true`, without `--no-sandbox`. The native Vary baseline assertions passed. The update assertion failed because the observed controller was still the original and both v1 and v2 precaches existed. The failure remained nonzero; negative/offline controls were not reached. Normal failure cleanup completed and Chrome exited 0; this does not test forced-timeout cleanup.

Inspection of the installed Playwright 1.64.0 and [its official polling implementation](https://github.com/microsoft/playwright/blob/v1.64.0/packages/playwright-core/src/server/frames.ts) found that `waitForFunction` tests the immediate predicate return for truthiness before adopting its eventual value. An async predicate can therefore end polling on its first Promise even when that Promise resolves false. The replacement predicate synchronously requires a different, activated controller; the full subsequent controller/active-worker, exact cache keys, v2 bytes and sentinel assertions are unchanged. No sleeps, timeout extension, worker edits or relaxed assertions are introduced. This fixes a demonstrated harness coordination defect; a new live run must still determine whether any worker defect remains. The explicit boolean return annotation is checked by the mandatory dedicated typecheck. A local temporary async mutation was rejected with TS1064; byte-for-byte restoration passed that same real typecheck. No browser was launched locally.

## Existing baseline

Continuation base: saved Draft #88 head `7955fb094f9645b4cd556edced4171b6a09eb442`, tree `8d9f39bc4288090ed24db827bb602911f6404ad6`, whose sole parent is master `76cda7983a3c0c6152eaaa8c07503bd8b3a7f0b6`. That saved checkpoint remains available. This continuation changes only root `package.json`, generated `bun.lock`, the harness, this proposal, and a new `.github/workflows/pwa-browser.yml`. Existing lock entries, workspace manifests, production code, the independent tsconfig, and all other files are preserved.

The saved base had no Playwright/Puppeteer dependency or browser test runner. `.github/workflows/ci.yml` uses `ubuntu-latest`, Bun, `contents: read`, unit tests, four typechecks, doctor and build. Pages deployment only runs for master pushes or manual dispatch. The adjacent source regression checks an `ignoreVary` string only. Production `apps/web/pwa/sw.js` is unchanged (3421 bytes; SHA-256 `0d8d8cc6b7469d8a674786cbe3550e86b7f2308761e3cd93e6af5b942e9a808d`). The earlier local baseline capture contains one additional trailing newline (3422 bytes; SHA-256 `225a167e164be9a500d5ce0af4bf6dd50b4e48e0c6c3047beb72892287552af2`); no other source text differs. The harness reads the actual repository worker at execution time.

## Narrow native runner setup

The added workflow uses one standard GitHub-hosted `ubuntu-24.04` job and Bun 1.4.2. It has `contents: read`, checkout `persist-credentials: false`, no supplied secrets, no deployment environment or permissions, no container, and no browser or OS installation step. It does not change existing CI, Pages, branch rules, security settings, or credentials. Pinning the OS avoids the announced `ubuntu-latest` migration to Ubuntu 26.04; it does not freeze the runner image or preinstalled Chrome version.

Dependency: official Microsoft `playwright` package, exact `1.64.0`, plus its exact `playwright-core` dependency in the generated lockfile. Use the library directly with Bun. The earlier unexecuted proposal's `1.56.1` / downloaded Chromium 141 pin is superseded for this stock-Chrome route. Playwright documents installed stable Chrome via `channel: 'chrome'`; the 1.64.0 release reports testing Chrome 155. A hosted image may carry a different stable patch or major version, so record actual versions and require live acceptance; do not infer compatibility from documentation or silently replace the installed browser.

The workflow runs these commands after checking out the reviewed PR tree:

```sh
bun install --frozen-lockfile --ignore-scripts
bun run --cwd apps/web --bun tsc -p tsconfig.pwa-browser.json
PWA_BROWSER_CHECK=1 bun apps/web/scripts/pwa-browser-check.ts
```

`GITHUB_ACTIONS=true` is supplied by the hosted runner. The harness refuses to run without both this flag and the explicit opt-in. Do not set these flags to bypass a denied cloud-browser or local-execution route. Preflight refuses root execution, requires the stock executable `/opt/google/chrome/chrome`, and records its reported version, actual checkout commit, PR head, Bun/Playwright versions, and runner image identifiers. The harness uses `channel: 'chrome'` and `chromiumSandbox: true`, with no fallback. Ubuntu documents a stock Chrome AppArmor profile at that original path; nothing here modifies it, moves a binary, installs a privileged helper, changes sysctl/AppArmor, or adds `--no-sandbox`, `ignoreHTTPSErrors`, custom security permissions or credentials. Missing Chrome, sandbox denial or runtime incompatibility fails the job.

The workflow has only a path-filtered `pull_request` trigger targeting master: `apps/web/pwa/**`, this script, its independent tsconfig, root package/lock, and its own workflow. A new `workflow_dispatch` file would not reliably be dispatchable before it exists on the default branch, so it is not used to validate this unmerged Draft. There are no schedule, deployment, push, manual-dispatch, or `pull_request_target` triggers. The job timeout is 10 minutes; the harness step has a 4-minute cap above its internal 15-second launch and 120-second test limits. Existing cleanup remains required. An always-run step prints `runtime.json` and `results.json` to the job log; browser launch diagnostics are enabled with `DEBUG=pw:browser`. Missing results are explicitly incomplete, never PASS. No `continue-on-error` is used. No artifacts or caches are uploaded, avoiding new retained artifact-storage usage; trace ZIPs and failure screenshots remain runner-local diagnostics and are not claimed as retained evidence.

The independent typecheck is mandatory because the ordinary web tsconfig does not include this script. It must resolve real Playwright and Bun types after dependency installation; no stub types are supplied to fake acceptance. The corrected local and second hosted dedicated typechecks passed. The second hosted attempt launched the Bun/Playwright/Chrome combination, but the complete browser regression remains unaccepted until a new live run passes all controls. Playwright's sandbox default is false, so the explicit true setting must remain. If the stock runner cannot launch with this requirement, record a blocker instead of changing security settings or switching browsers silently.

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
- JSON includes source SHA-256, GitHub checkout and PR head commits, actual Bun/Playwright/browser versions, stock Chrome channel, requested sandbox setting, runner image identifiers, each scenario's native-cache observations, update keys/content, offline outcomes and diagnostics. The requested sandbox setting alone is not a successful-launch claim.
- Per-case runner-local trace ZIP and failure screenshot; `finally` awaits memoized server-stop promises and closes contexts/browser. Server stop rejections remain rejections on repeat cleanup, are recorded, and force failure. All trace/cleanup work settles before that case's result is appended. Timeout-induced browser closure can prevent trace/screenshot completion; any such cleanup error remains visible and cannot yield PASS. A runner-level forced kill may prevent result creation, and must be reported as incomplete, never passing. Only printed JSON and launch logs are retained by this workflow; no trace/screenshot upload is configured.
- Browser/server launch or dependency failures are blockers; do not substitute another restricted environment.

## Acceptance limits and remaining #18 work

This candidate tests native Chromium Vary handling, actual worker cache routing, and a synthetic update lifecycle. It does not run the production app's report form, lunar-calendar controls, full build-generated precache, GitHub Pages offline session or phone PWA. Even a future green runner result cannot close all #18 acceptance criteria or certify iOS/WebKit behavior.

The earlier read-only deployed-header capture separately observed `Vary: Accept-Encoding`, with identical report/core chunk bytes for requests with/without Origin. These observations do not remove the need for a deterministic Vary regression.

No birth profile is needed for this synthetic harness. If an approved future deployed-UI case is added, use an invented profile only (e.g. “QA Synthetic”, 1995-07-16 22:00, male, precise time, Tainan); do not upload real birth data, cookies or browser profiles. The current user direction excludes the local computer.

## Official references

- [Playwright v1.64.0 release and tested stable browser channels](https://github.com/microsoft/playwright/releases/tag/v1.64.0)
- [Playwright installed Google Chrome support](https://playwright.dev/docs/browsers#google-chrome--microsoft-edge)
- [GitHub Ubuntu 24.04 installed software](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md)
- [Chromium explanation of Ubuntu stock Chrome AppArmor handling](https://chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md)
- [GitHub Ubuntu 26 migration announcement](https://github.blog/changelog/2026-09-17-ubuntu-26-generally-available-and-latest-migration/)
- [Playwright CI installation and timeout guidance](https://playwright.dev/docs/ci)
- [Service workers and activation](https://playwright.dev/docs/service-workers)
- [BrowserContext offline mode](https://playwright.dev/docs/api/class-browsercontext#browser-context-set-offline)

These references support the proposed tool APIs; they do not constitute an executed result for this repository.
