# @openmasq/desktop — the product

The Electron app: `src/main` (IPC, SQLite, MCP, streaming, the process boundaries),
`src/preload` (`contextBridge` → `window.openmasq`), `src/renderer` (mounts `@openmasq/ui`
and supplies the real `Host`). `e2e/` drives the built app against real providers — it
costs money, never run it casually.

**Boundary.** Every trust boundary of the product is here: IPC handlers, `spawn` /
`utilityProcess`, network egress, secrets at rest, the Python jail, the agent browser. A
change there is not done until the fail-closed property is re-verified and pinned by a
test (root `CLAUDE.md`, rule 7). The renderer is untrusted for security decisions.

**Start here.**
- `src/main/index.ts` — boot; `src/main/ipc/` — the handlers; `src/main/db/` — the local
  database and its migrations; `src/main/mcp/` — connectors, tool gates, the broker.
- `scripts/buildDefines.ts` — every service address a build may receive, and why none has
  a committed default.
- `pnpm dev` from the repo root builds the packages and launches the app against local
  services (`.env.development`).
