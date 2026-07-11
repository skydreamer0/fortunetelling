# Cross-validation, CI, and GitHub Pages Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add reproducible public-reference integration tests, pull-request CI, and verified GitHub Pages deployment from `main`.

**Architecture:** Test data lives in a versioned fixture module with explicit provenance and confidence metadata. Integration tests enter only through the public `analyze()` API and assert deterministic contracts plus independently recomputable values. CI and Pages use separate least-privilege workflows; Pages rebuilds and retests before uploading `dist`.

**Tech Stack:** Bun 1.3.14, Node test runner (via Bun scripts), Vite 8, GitHub Actions, GitHub Pages, Dependabot.

---

### Task 1: Standardize Bun automation

**Files:**
- Modify: `package.json`
- Modify only if required: `bun.lock`
- Modify: `docs/DECISIONS.md`
- Modify: `docs/HARNESS_SPEC.md`

**Step 1: Record the precondition**

Run: `bun --version; Test-Path bun.lock; Test-Path package-lock.json`

Expected: Bun `1.3.14`, then `True`, then `False`.

**Step 2: Add automation metadata**

Add to `package.json`:

```json
"packageManager": "bun@1.3.14",
"engines": { "node": ">=22", "bun": ">=1.3.14" },
"scripts": {
  "dev": "vite",
  "build": "vite build --base=./",
  "preview": "vite preview",
  "test": "node --test \"tests/**/*.test.js\"",
  "test:integration": "node --test tests/integration.test.js",
  "test:automation": "node --test tests/automationConfig.test.js",
  "check": "bun run test && bun run build"
}
```

Add a new decision that supersedes only D-013's package-manager clause: Bun is mandatory for install and script invocation; Node ≥22 remains the authoritative `node:test` runtime. Update HARNESS_SPEC environment commands accordingly.

The relative Vite base makes assets work both at `/` and at `/OWNER/REPO/` on GitHub Pages.

**Step 3: Verify the existing lockfile**

Run: `bun install --frozen-lockfile`

Expected: install succeeds without changing `bun.lock`; `package-lock.json` remains absent.

**Step 4: Verify clean installation and check command**

Run: `bun install --frozen-lockfile && bun run check`

Expected: all tests pass and Vite build exits 0.

**Step 5: Commit**

```bash
git add package.json bun.lock docs/DECISIONS.md docs/HARNESS_SPEC.md
git commit -m "build: standardize Bun automation"
```

### Task 2: Add provenance-aware public fixtures

**Files:**
- Create: `tests/fixtures/integrationCases.js`
- Create: `tests/integration.test.js`

**Step 1: Write the failing fixture-contract test**

Create an integration test that imports `INTEGRATION_CASES` and requires every case to contain:

```js
{
  id: 'stable-id',
  kind: 'golden' | 'public-reference',
  input: { year, month, day, hour, minute, gender, name, longitude, latitude },
  asOf: 'YYYY-MM-DD',
  provenance: {
    sourceUrl: 'https://...',
    accessedOn: '2026-07-11',
    birthTimeConfidence: 'exact' | 'approximate' | 'unknown',
    notes: '...'
  },
  expected: { /* only independently supportable facts */ }
}
```

Require unique ids, HTTPS source URLs for public cases, explicit `asOf`, and no email/address/private identifier fields.

**Step 2: Verify RED**

Run: `bun run test:integration`

Expected: FAIL because `tests/fixtures/integrationCases.js` does not exist.

**Step 3: Add minimal fixtures**

Include:

- Existing 1986-05-29 08:00 golden vector from `docs/TASKS.md`.
- Existing 1991-10-05 14:00 full-report golden vector.
- At least two public-reference cases whose source URLs and birth-time confidence have been manually checked before committing.

For uncertain public birth times, keep `expected` limited to date-based outputs such as numerology and lunar-date conversion; do not assert Ziwei or hour-pillar values.

**Step 4: Verify GREEN**

Run: `bun run test:integration`

Expected: fixture contract test passes.

**Step 5: Commit**

```bash
git add tests/fixtures/integrationCases.js tests/integration.test.js
git commit -m "test: add sourced integration fixtures"
```

### Task 3: Cross-validate the public analyze contract

**Files:**
- Modify: `tests/integration.test.js`

**Step 1: Write failing per-case contract assertions**

For every fixture, call:

```js
const report = analyze(testCase.input, { asOf: testCase.asOf });
```

Assert:

- exact Schema v1 top-level keys;
- `asOf` equals fixture value;
- expected engine ids exist;
- unexpected engine errors fail the case;
- `radars.length >= 3` for complete-time fixtures;
- each radar axis ruleId occurs in `report.scoringRules`;
- `stateTable.pending`, `evolution.pending`, and `honesty.pending` are false;
- `honesty.violations` is empty;
- fixture-specific `expected` values match.

Add a deliberately impossible expected value to prove the test fails for the intended assertion, then remove only that impossible value after observing RED.

**Step 2: Verify RED**

Run: `bun run test:integration`

Expected: FAIL at the deliberate fixture expectation.

**Step 3: Complete the real assertions**

Implement helpers only inside the test file:

- `rulesById(report)`
- `engineComponent(report, engineId, category)`
- `stableReport(report)` removing only `generatedAt`

Do not copy engine implementation formulas except the already documented independent recomputation formulas.

**Step 4: Verify GREEN**

Run: `bun run test:integration`

Expected: all integration cases pass.

**Step 5: Commit**

```bash
git add tests/integration.test.js
git commit -m "test: cross-validate public report contract"
```

### Task 4: Prove deterministic output

**Files:**
- Modify: `tests/integration.test.js`

**Step 1: Write the determinism test**

For each fixture, call `analyze()` twice with the same explicit `asOf`, remove only `generatedAt`, and deep-compare the reports.

**Step 2: Verify the test catches nondeterminism**

Temporarily retain `generatedAt` in `stableReport()` and run:

Run: `bun run test:integration`

Expected: FAIL because generation timestamps differ.

**Step 3: Apply the intended normalization**

Remove only `generatedAt`; do not normalize, sort, or discard any computed domain field.

**Step 4: Verify GREEN**

Run: `bun run test:integration`

Expected: determinism test passes.

**Step 5: Commit**

```bash
git add tests/integration.test.js
git commit -m "test: enforce deterministic reports"
```

### Task 5: Add pull-request CI

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `tests/automationConfig.test.js`

**Step 1: Write a failing workflow-contract test**

Read `.github/workflows/ci.yml` as text and assert it contains:

- `pull_request`, `push`, and `workflow_dispatch` triggers;
- `contents: read`;
- `actions/checkout@v6`, `actions/setup-node@v6`, and `oven-sh/setup-bun@v2`;
- Node 22 plus Bun version resolved from `package.json`;
- `bun install --frozen-lockfile` and `bun run check`;
- a finite `timeout-minutes`;
- no `pull_request_target`.

**Step 2: Verify RED**

Run: `bun run test:automation`

Expected: FAIL because `ci.yml` does not exist.

**Step 3: Create the workflow**

Use one `verify` job on `ubuntu-latest`, least-privilege permissions, Node 22, Bun 1.3.14, and a 15-minute timeout. Trigger pushes only for `main`.

**Step 4: Verify GREEN and full check**

Run: `bun run test -- tests/automationConfig.test.js && bun run check`

Expected: workflow contract and project check pass.

**Step 5: Commit**

```bash
git add .github/workflows/ci.yml tests/automationConfig.test.js
git commit -m "ci: verify pull requests and main"
```

### Task 6: Add verified GitHub Pages deployment

**Files:**
- Create: `.github/workflows/deploy-pages.yml`
- Modify: `tests/automationConfig.test.js`

**Step 1: Write the failing Pages workflow test**

Assert the workflow contains:

- push to `main` and `workflow_dispatch`;
- concurrency with cancellation;
- build job: checkout, setup-node 22, setup-bun, frozen install, `bun run check`, `configure-pages@v5`, `upload-pages-artifact@v4` with `path: ./dist`;
- deploy job with `needs: build`, `github-pages` environment, `pages: write`, `id-token: write`, and `deploy-pages@v4`;
- no deployment on pull requests.

**Step 2: Verify RED**

Run: `bun run test:automation`

Expected: FAIL because `deploy-pages.yml` does not exist.

**Step 3: Create the Pages workflow**

Follow GitHub's current custom Pages workflow contract. Keep elevated permissions on the deploy job only.

**Step 4: Verify generated assets are relative**

Run: `bun run build`

Then assert `dist/index.html` uses `./assets/` rather than `/assets/`.

Expected: build passes and asset URLs are repository-subpath safe.

**Step 5: Verify GREEN**

Run: `bun run test -- tests/automationConfig.test.js && bun run check`

Expected: all automation contracts and project checks pass.

**Step 6: Commit**

```bash
git add .github/workflows/deploy-pages.yml tests/automationConfig.test.js
git commit -m "ci: deploy verified build to Pages"
```

### Task 7: Add dependency maintenance and public-project safeguards

**Files:**
- Create: `.github/dependabot.yml`
- Create: `SECURITY.md`
- Modify: `README.md`
- Modify: `tests/automationConfig.test.js`

**Step 1: Write the failing maintenance-config test**

Assert Dependabot contains weekly entries for `bun` and `github-actions`, both rooted at `/`, with a bounded `open-pull-requests-limit`.

**Step 2: Verify RED**

Run: `bun run test:automation`

Expected: FAIL because `.github/dependabot.yml` does not exist.

**Step 3: Add maintenance and security files**

`SECURITY.md` must include:

- supported version policy;
- private vulnerability reporting guidance;
- warning not to post private birth data, credentials, or precise personal information in public issues.

README must include:

- CI badge using an owner/repository placeholder documented for replacement;
- `bun install --frozen-lockfile` and `bun run check` contributor commands;
- GitHub Pages setup: Settings → Pages → Source → GitHub Actions;
- note that only `main` deploys.

**Step 4: Verify GREEN**

Run: `bun run test -- tests/automationConfig.test.js && bun run check`

Expected: all tests and build pass.

**Step 5: Commit**

```bash
git add .github/dependabot.yml SECURITY.md README.md tests/automationConfig.test.js
git commit -m "chore: prepare public repository automation"
```

### Task 8: Final public-release audit

**Files:**
- Modify only if verification exposes a defect.

**Step 1: Scan tracked files for accidental secrets and private fixtures**

Run focused searches for common token prefixes, private keys, emails, and local absolute paths. Review every match; do not print secret values if any are found.

Expected: no credential or unauthorized private-data findings.

**Step 2: Run the clean-install gate**

Run: `bun install --frozen-lockfile && bun run check`

Expected: all tests pass and production build exits 0.

**Step 3: Inspect repository state**

Run: `git status --short && git log --oneline -8`

Expected: clean working tree and one focused commit per task.

**Step 4: Complete GitHub-side setup after publishing**

In the public repository:

1. Make `main` the default branch.
2. Settings → Pages → Source → GitHub Actions.
3. Add a `github-pages` environment protection rule allowing `main` only.
4. Add a branch protection/ruleset requiring the CI `verify` check before merge.
5. Confirm the first Pages workflow reports its deployed URL.

These are repository-admin actions and cannot be validated locally before a GitHub repository exists.
