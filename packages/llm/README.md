# @openmasq/llm — providers and models

One `streamChat(options)` over `fetch` + SSE for every provider (OpenAI, Anthropic,
Google, DeepSeek, OpenRouter, OpenAI-compatible endpoints, the Claude Code / Codex CLIs),
plus `completeWithTools` / `streamWithTools` for tool calling, and the model registry
(context windows, pricing, capabilities).

**Boundary.** No Electron, no React, no vault: what this package sends is what it is
given — redaction happens before, in `@openmasq/ui/send`. `./wire` exposes the provider
byte formats other workspaces must import rather than re-type; `./pricing` the tariffs.

**Start here.** `src/index.ts`, then `src/models/` (the registry) and one provider client
under `src/providers/` to see the streaming contract.
