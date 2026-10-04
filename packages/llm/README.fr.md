[English](README.md)

# @openmasq/llm

**Les clients des fournisseurs et le registre des modèles, sur un simple `fetch`.**

Une seule fonction de streaming pour tous les fournisseurs HTTP, l'appel d'outils, et la
liste des modèles avec leur fenêtre de contexte, leur prix et leurs capacités. Ni Electron,
ni React, ni coffre : le paquet envoie ce qu'on lui donne, et le masquage a lieu avant,
dans `packages/ui/src/send/`. Il est utilisé par `@openmasq/ui`, `@openmasq/catalog`,
`@openmasq/credits` et le processus principal de l'application de bureau. C'est un paquet
interne au monorepo, non publié sur npm.

## Contenu

- **`streamChat(options)`** : diffuse une réponse, morceau de texte par morceau de texte,
  depuis OpenAI, Anthropic, Google, Mistral, DeepSeek, OpenRouter, Scaleway ou tout point
  d'accès compatible OpenAI.
- **Appel d'outils** : `completeWithTools` et `streamWithTools` (`src/tools/`).
- **Registre des modèles** : `MODELS`, `PROVIDERS`, `findModel`, les fenêtres de contexte et
  les prix (`src/models/`).
- **`@openmasq/llm/pricing`** : les tables de prix et de contexte seules, sans les clients
  des fournisseurs.
- **`@openmasq/llm/wire`** : le lecteur SSE et les analyseurs d'usage et de texte propres à
  chaque fournisseur, pour lire leurs octets de la même façon sans les réécrire.

```ts
import { streamChat } from "@openmasq/llm";

for await (const delta of streamChat({
  provider: "openai",
  model: "gpt-5.4-mini",
  apiKey,
  messages: [{ role: "user", content: "Bonjour" }],
})) {
  process.stdout.write(delta);
}
```

## Développement

```bash
pnpm --filter @openmasq/llm build       # tsup, vers dist/
pnpm --filter @openmasq/llm typecheck
pnpm test packages/llm                  # depuis la racine
```

> [!NOTE]
> Les abonnements en ligne de commande (Claude Code, Codex, Antigravity) figurent ici parmi
> les fournisseurs, mais `streamChat` ne les sert pas. L'application de bureau les exécute
> dans `apps/desktop/src/main/subscription/`.
