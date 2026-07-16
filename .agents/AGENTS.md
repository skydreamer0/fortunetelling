# Project-Scoped Rules (Fortune Telling Platform)

## ⚡ Runtime & Package Manager
- **ALWAYS** use **Bun** for all runtime execution, package management, scripting, and testing.
  - Use `bun install` instead of `npm install`.
  - Use `bun test` instead of `npm test` or `node --test`.
  - Use `bun run build` instead of `npm run build`.
  - Use `bun run dev` instead of `npm run dev`.
- Do **NOT** use `npm`, `npx`, `yarn`, `pnpm`, or raw `node` commands unless explicitly requested by the user.
