# Project-Scoped Rules (Fortune Telling Platform)

## Runtime & package manager
- Use Node.js 24 LTS and npm 11 for runtime, package management and scripts.
- Use `npm ci` with the committed `package-lock.json`; do not regenerate or upgrade unrelated dependencies.
- Use `npm test` (Vitest), `npm run typecheck`, `npm run build`, and `npm run dev`.
- MCP runs compiled ESM: `node packages/mcp/dist/bin.js`; build packages before invoking it.
- Preserve calculation algorithms, fixtures, golden snapshots and locked forecast records during tooling changes.


## Work principle

Less attention taken. More value delivered.

Reduce unnecessary questions and narration; deliver useful, verified results. Preserve required approvals, risk disclosures, and blocker reports. This principle does not expand authorization or override safety and project rules.
