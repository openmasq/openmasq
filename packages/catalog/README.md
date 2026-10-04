[Français](README.fr.md)

# @openmasq/catalog

**The single source of the lists an organization can govern.**

Models, MCP connectors, redaction categories and feature flags, each defined once. Every
place that lists or governs one of these ids imports it from here, so they all name the
same things. It is used by `@openmasq/ui`, the desktop app and `apps/proxy`. It is a
private workspace package, not published on npm.

## What's inside

- **Models** (`@openmasq/catalog/models`): `MODEL_CATALOG`, the `@openmasq/llm` registry with
  prices, context windows and capabilities joined by id.
- **Connectors** (`@openmasq/catalog/mcp`): `MCP_CONNECTORS`, their categories, logos and
  sign-in requirements, and `writeRisk`, which rates how risky a tool call is.
- **Redaction categories** (`@openmasq/catalog/redaction`): `REDACTION_CATEGORIES`, their
  defaults and the protection levels.
- **Feature flags** (`src/flags.ts`): `FEATURE_ACCESS`, the sections that can be hidden
  remotely. Exported from the root entry.

## Develop

```bash
pnpm --filter @openmasq/catalog build       # tsup, into dist/
pnpm --filter @openmasq/catalog typecheck
pnpm test packages/catalog                  # from the root
```

> [!NOTE]
> The catalog holds display metadata and ids only. A connector entry never carries a
> command line or OAuth credentials; those stay in `apps/desktop/src/main/mcp/` and
> `apps/mcp-broker/`.
