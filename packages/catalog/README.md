# @openmasq/catalog — the governable lists

The single source of truth for what the product exposes and lets an organisation govern:
models (`./models`), MCP connectors (`./mcp`), redaction categories (`./redaction`) and
feature flags (`src/flags.ts`). Both the desktop and the admin tooling read these lists;
neither owns a copy.

**Boundary.** Data and pure helpers only — a list, its ids, its ordering. Copy lives in
`@openmasq/i18n`; behaviour lives in whoever consumes the list.

**Start here.** `src/index.ts`, then the folder of the list you need.
