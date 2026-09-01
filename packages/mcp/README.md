# @openmasq/mcp — the redacting MCP client

A Model Context Protocol client where **every tool call goes through the vault in both
directions**: arguments leave un-redacted (the outside world gets real values), results
come back re-redacted before the model sees them. `./transport` carries the transports
(stdio, Streamable HTTP) the desktop wires into its process boundary.

**Boundary.** Depends on `@openmasq/redact` only. The desktop decides which tools are
allowed (allow-listed, never deny-listed) — this package executes what it is handed.

**Start here.** `src/index.ts`; the un-redact / re-redact pair is the invariant to keep.
