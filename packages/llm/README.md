[Français](README.fr.md)

# @openmasq/llm

**Provider clients and the model registry, over plain `fetch`.**

One streaming function for every HTTP provider, tool calling, and the list of models with
their context windows, prices and capabilities. No Electron, no React and no vault: the
package sends what it is given, and redaction happens before, in `packages/ui/src/send/`.
It is used by `@openmasq/ui`, `@openmasq/catalog`, `@openmasq/credits` and the desktop main
process. It is a private workspace package, not published on npm.

## What's inside

- **`streamChat(options)`**: streams a reply as text deltas from OpenAI, Anthropic, Google,
  Mistral, DeepSeek, OpenRouter, Scaleway or any OpenAI-compatible endpoint.
- **Tool calling**: `completeWithTools` and `streamWithTools` (`src/tools/`).
- **Model registry**: `MODELS`, `PROVIDERS`, `findModel`, context windows and prices
  (`src/models/`).
- **`@openmasq/llm/pricing`**: the price and context tables alone, without the provider
  clients.
- **`@openmasq/llm/wire`**: the SSE reader and the per-provider usage and text parsers, for
  code that must read provider bytes the same way without retyping them.

```ts
import { streamChat } from "@openmasq/llm";

for await (const delta of streamChat({
  provider: "openai",
  model: "gpt-5.4-mini",
  apiKey,
  messages: [{ role: "user", content: "Hello" }],
})) {
  process.stdout.write(delta);
}
```

## Develop

```bash
pnpm --filter @openmasq/llm build       # tsup, into dist/
pnpm --filter @openmasq/llm typecheck
pnpm test packages/llm                  # from the root
```

> [!NOTE]
> The CLI subscriptions (Claude Code, Codex, Antigravity) are listed as providers here, but
> `streamChat` does not serve them. The desktop runs them in
> `apps/desktop/src/main/subscription/`.
