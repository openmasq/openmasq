# @openmasq/llm — providers and models

<sub>**English** · [Français](#openmasqllm--fournisseurs-et-modèles) · [openmasq.com](https://openmasq.com)</sub>

One `streamChat(options)` over `fetch` + SSE for every provider (OpenAI, Anthropic,
Google, DeepSeek, OpenRouter, OpenAI-compatible endpoints, the Claude Code / Codex CLIs),
plus `completeWithTools` / `streamWithTools` for tool calling, and the model registry
(context windows, pricing, capabilities).

**Boundary.** No Electron, no React, no vault: what this package sends is what it is
given — redaction happens before, in `@openmasq/ui/send`. `./wire` exposes the provider
byte formats other workspaces must import rather than re-type; `./pricing` the tariffs.

**Start here.** `src/index.ts`, then `src/models/` (the registry) and one provider client
under `src/providers/` to see the streaming contract.

---

# @openmasq/llm — fournisseurs et modèles

Un seul `streamChat(options)` sur `fetch` + SSE pour tous les fournisseurs (OpenAI,
Anthropic, Google, DeepSeek, OpenRouter, les points d'accès compatibles OpenAI, les CLI
Claude Code / Codex), plus `completeWithTools` / `streamWithTools` pour l'appel d'outils, et
le registre des modèles (fenêtres de contexte, tarifs, capacités).

**Frontière.** Pas d'Electron, pas de React, pas de coffre : ce que ce paquet envoie est ce
qu'on lui a donné — le masquage a lieu avant, dans `@openmasq/ui/send`. `./wire` expose les
formats d'octets des fournisseurs que les autres workspaces doivent importer plutôt que
retaper ; `./pricing`, les tarifs.

**Commencez ici.** `src/index.ts`, puis `src/models/` (le registre) et un client de
fournisseur sous `src/providers/` pour voir le contrat de streaming.
