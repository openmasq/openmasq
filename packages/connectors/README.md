# @openmasq/connectors — on-device MCP connector tools

Tool definitions for the connectors the desktop runs **in-process** with on-device OAuth
(no broker hop): transport-agnostic, pure TypeScript, `fetch` only. The desktop's MCP
layer decides which are exposed and gates every call.

**Start here.** `src/index.ts`, `src/types.ts`.
