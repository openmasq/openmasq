[English](README.md)

# @openmasq/mcp

**Un client Model Context Protocol qui tient les vraies valeurs à l'écart du modèle.**

Chaque appel d'outil passe par le coffre de la conversation, dans les deux sens. Les
arguments retrouvent leurs vraies valeurs avant d'atteindre le serveur MCP, car le monde
extérieur a besoin du vrai destinataire ou du vrai terme de recherche. Les résultats sont
masqués de nouveau avant que le modèle ne les voie. Le paquet est utilisé par
`@openmasq/ui`, l'application de bureau, `apps/proxy` et `apps/mcp-broker`. C'est un paquet
interne au monorepo, non publié sur npm.

## Contenu

- **`@openmasq/mcp`** : `RedactingMcpClient` (`src/redact/client.ts`), le parcours JSON qui
  transforme chaque chaîne des arguments et des résultats, et les adaptateurs entre les
  outils MCP et les formats d'outils d'Anthropic et d'OpenAI (`toProviderTools`,
  `parseAnthropicToolUse`, `parseOpenAIToolCall`). Ce point d'entrée ne charge aucun SDK.
- **`@openmasq/mcp/transport`** : les connexions bâties sur le SDK MCP officiel :
  `connectStdio` pour un serveur local, `connectHttp` pour un serveur distant en Streamable
  HTTP, et `makeOAuthProvider` pour la connexion OAuth.
- **`@openmasq/mcp/node`** : des outils réservés à Node pour un hôte MCP local : un serveur
  en boucle locale pour la redirection OAuth et un stockage chiffré des jetons.

```ts
import { RedactingMcpClient, toProviderTools, parseAnthropicToolUse } from "@openmasq/mcp";
import { connectStdio } from "@openmasq/mcp/transport";

const server = await connectStdio({ id: "files", command: "npx", args: ["some-mcp-server"] });
const mcp = new RedactingMcpClient({ connections: [server], vault });

const tools = toProviderTools("anthropic", await mcp.listTools()); // les schémas seulement
const result = await mcp.callTool(parseAnthropicToolUse(block));    // un résultat masqué
```

## Développement

```bash
pnpm --filter @openmasq/mcp build       # tsup, vers dist/
pnpm --filter @openmasq/mcp typecheck
pnpm test packages/mcp                  # depuis la racine
```

> [!IMPORTANT]
> La restauration des arguments est inconditionnelle, et le masquage des résultats traite
> un appel à la fois pour que deux valeurs ne tombent jamais sur le même substitut
> (`src/redact/client.test.ts`). C'est l'appelant qui décide quels outils peuvent
> s'exécuter : ce paquet exécute ce qu'on lui confie.
