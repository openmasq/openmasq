[Français](README.fr.md)

# @openmasq/mcp

**A Model Context Protocol client that keeps real values away from the model.**

Every tool call goes through the conversation's vault in both directions. Arguments are
restored to their real values before they reach the MCP server, because the outside world
needs the real recipient or the real search term. Results are redacted again before the
model sees them. The package is used by `@openmasq/ui`, the desktop app, `apps/proxy` and
`apps/mcp-broker`. It is a private workspace package, not published on npm.

## What's inside

- **`@openmasq/mcp`**: `RedactingMcpClient` (`src/redact/client.ts`), the JSON walk that
  maps every string in arguments and results, and the adapters between MCP tools and the
  Anthropic and OpenAI tool formats (`toProviderTools`, `parseAnthropicToolUse`,
  `parseOpenAIToolCall`). No SDK is loaded by this entry.
- **`@openmasq/mcp/transport`**: connections built on the official MCP SDK: `connectStdio`
  for a local server, `connectHttp` for a remote server over Streamable HTTP, and
  `makeOAuthProvider` for the OAuth sign-in.
- **`@openmasq/mcp/node`**: Node-only helpers for a local MCP host: a loopback server for
  the OAuth redirect and encrypted token storage.

```ts
import { RedactingMcpClient, toProviderTools, parseAnthropicToolUse } from "@openmasq/mcp";
import { connectStdio } from "@openmasq/mcp/transport";

const server = await connectStdio({ id: "files", command: "npx", args: ["some-mcp-server"] });
const mcp = new RedactingMcpClient({ connections: [server], vault });

const tools = toProviderTools("anthropic", await mcp.listTools()); // schemas only
const result = await mcp.callTool(parseAnthropicToolUse(block));    // redacted result
```

## Develop

```bash
pnpm --filter @openmasq/mcp build       # tsup, into dist/
pnpm --filter @openmasq/mcp typecheck
pnpm test packages/mcp                  # from the root
```

> [!IMPORTANT]
> Argument restoration is unconditional, and result redaction runs one call at a time so
> two values never collide on the same substitute (`src/redact/client.test.ts`). Which
> tools may run is decided by the caller: this package runs what it is given.
