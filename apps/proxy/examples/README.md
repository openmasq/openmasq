# Pointing tools at the proxy

<sub>**English** · [Français](#brancher-un-outil-sur-le-proxy) · [openmasq.com](https://openmasq.com)</sub>

Nothing here installs anything into the tool. The proxy is an OpenAI-, Anthropic- and
Gemini-compatible endpoint on `127.0.0.1`; a client that lets you set a base URL is pointed at
it and keeps its own key. Start it once:

```bash
pnpm --filter @openmasq/proxy build
node apps/proxy/dist/server.js --disable path,ip     # the coding preset (bench-recommended)
```

It listens on `http://127.0.0.1:8787` by default. The three base URLs (press `c` in the proxy
to copy them):

```
OPENAI_BASE_URL=http://127.0.0.1:8787/v1
ANTHROPIC_BASE_URL=http://127.0.0.1:8787
GOOGLE_GEMINI_BASE_URL=http://127.0.0.1:8787
```

| Tool | How to point it | Status |
|---|---|---|
| **Claude Code** | `ANTHROPIC_BASE_URL=http://127.0.0.1:8787 claude` — or `node …/server.js -- claude` | ✅ tested, live subscription |
| **Codex** | a custom provider (env var alone is NOT enough — Codex keeps its ChatGPT auth): see below | ✅ tested against a fake upstream |
| **Gemini CLI** | `GOOGLE_GEMINI_BASE_URL=http://127.0.0.1:8787` in API-key mode | ⚠️ unverified — the personal OAuth tier is refused (`IneligibleTierError`) before the base URL is read; needs an AI Studio API key |
| **Aider** | `export OPENAI_API_BASE=http://127.0.0.1:8787/v1` then `aider --model openai/<model>` | 📄 config keys per docs, not tested here |
| **Continue** | in `~/.continue/config.yaml`, `provider: openai` + `apiBase: http://127.0.0.1:8787/v1` | 📄 config keys per docs, not tested here |
| **Open WebUI** | set `OPENAI_API_BASE_URL=http://127.0.0.1:8787/v1` | 📄 config keys per docs, not tested here |
| **LibreChat** | a custom endpoint in `librechat.yaml` with `baseURL: http://127.0.0.1:8787/v1` | 📄 config keys per docs, not tested here |
| **Antigravity** | — | ✖ the desktop IDE has no bring-your-own-key or custom-provider hook: its agent model cannot be pointed anywhere. Only its MCP half can use the proxy (below) |

**Codex** needs a provider block, because a bare `OPENAI_BASE_URL` leaves it on its stored
ChatGPT login. Point it with command-line overrides (or the equivalent `config.toml`):

```bash
OM_KEY=sk-any codex exec \
  -c model_providers.om.name=om \
  -c model_providers.om.base_url=http://127.0.0.1:8787/v1 \
  -c model_providers.om.env_key=OM_KEY \
  -c model_providers.om.wire_api=responses \
  -c model_provider=om  "your prompt"
```

`wire_api = "responses"` is required — the old chat protocol was removed in 2026.

`OPENAI_BASE_URL` vs `OPENAI_API_BASE`: the name differs by tool (the OpenAI SDK reads the
first, Aider/LiteLLM the second) but the value is always the proxy's `…/v1`. Aider needs the
`openai/` model prefix so it treats the endpoint as OpenAI-compatible.

**Verification status.** Only the ✅ rows were exercised against the proxy on this machine
(Claude Code live on a subscription; Codex against a fake upstream — the request arrives and is
masked). The 📄 rows rest on the tools' documented config keys, not a run here — the tools were
not installed. The ⚠️ Gemini row could not be reached at all on a personal account. Whatever the
tool, confirm with `--reveal` on your own terminal: if a `POST` line appears, the base URL took;
if none does, the tool never used it (the Codex trap above).

## The other half: `--mcp`

`/v1/*` masks what the model reads; `/mcp` masks what its TOOLS read. The endpoint is standard
streamable HTTP, so **any** MCP client can point at `http://127.0.0.1:8787/mcp`. What differs
per client is whether the proxy can make itself its ONLY MCP for the run — an agent that keeps
its own connections reaches Gmail directly, with its own credential, and nothing on that path
is masked.

| Client | Exclusivity | How, and what it costs you |
|---|---|---|
| **Claude Code** | ✅ automatic | `--mcp-config <temp> --strict-mcp-config`, its own switch. Verified live: the tool list came back as `mcp__openmasq__crm__*` and nothing else |
| **Codex** | ✅ automatic | one `-c mcp_servers.<id>.enabled=false` per server it declares (from `codex mcp list --json`), ours, and `features.apps=false` for the built-in `codex_apps` server that NO listing reports. Verified in a real session: the model's tool list was `mcp__openmasq__crm__lookup_contact` alone, and the contact it printed was the vault's fake. ⚠️ `codex exec` refuses MCP calls under its default `approval_policy = never` — add `-c 'mcp_servers.openmasq.default_tools_approval_mode="approve"'` after `--` for a non-interactive run |
| **Gemini CLI** | ✅ after one command | `gemini mcp add -s user -t http openmasq http://127.0.0.1:8787/mcp` once, then the run passes `--allowed-mcp-server-names openmasq`. Verified live (connected, tools served). ⚠️ wrap a session, not a subcommand: `gemini mcp list` refuses the flag |
| **opencode** | ✅ automatic | a config file of ours in `OPENCODE_CONFIG`: ours added, each of its own `enabled: false`. Verified live: its decoy came back `disabled`, `openmasq` `connected`. ⚠️ a project `opencode.json` outranks that file — the proxy re-asks under its own config and refuses exclusivity if anything survived (verified too) |
| **Copilot CLI** | ✅ automatic | `--disable-mcp-server <id>` per server (list from `copilot mcp list --json`), `--disable-builtin-mcps`, ours via `--additional-mcp-config @file`. Flags read in the binary; a live session needs a GitHub login, so that half is unclaimed |
| **Cursor CLI** | ✖ | no MCP flag at all |
| **goose** | ✖ | `--with-extension` / `--with-builtin` only ADD |
| **Antigravity** | ✖ | no MCP flag on its CLI, and the IDE has no BYOK hook for the model half either. Point it at `/mcp` by hand in `~/.gemini/config/mcp_config.json` (or Settings ▸ Customizations ▸ Open MCP Config) — ⚠️ it spells the endpoint `serverUrl`, not `url` |

A relocating home variable (`CODEX_HOME`, `GEMINI_CLI_HOME`, `COPILOT_HOME`) is never the
answer: it moves the client's credentials along with its settings. And opencode's
`disabled_mcps: ["*", "!x"]` allow-list, which the forums describe, is not in the binary —
grepped, absent in 1.18.30. For a ✖ client, point it at
`/mcp` yourself and switch its own servers off — the proxy says so at startup rather than
implying a mask it cannot apply.

⚠️ Two notes that decide whether it helps:
- The proxy defaults to `standard` (pattern rules, no model). Names, companies and places are
  masked only at `--level renforce`, which loads the on-device model. For code, `--disable
  path,ip` is the measured sweet spot (`bench/`).
- A tool that hard-codes the provider host and offers no base-URL setting cannot use this.

---

# Brancher un outil sur le proxy

<sub>[English](#pointing-tools-at-the-proxy) · **Français** · [openmasq.com](https://openmasq.com)</sub>

Rien ici n'installe quoi que ce soit dans l'outil. Le proxy est un point de terminaison
compatible OpenAI, Anthropic et Gemini sur `127.0.0.1` ; un client qui autorise une adresse de
base y est pointé et garde sa propre clé. On le démarre une fois :

```bash
pnpm --filter @openmasq/proxy build
node apps/proxy/dist/server.js --disable path,ip     # le préréglage code (recommandé par le banc)
```

Il écoute sur `http://127.0.0.1:8787` par défaut. Les trois adresses de base (touche `c` dans
le proxy pour les copier) et le tableau ci-dessus valent tels quels ; le nom de la variable
change selon l'outil (`OPENAI_BASE_URL` pour le SDK OpenAI, `OPENAI_API_BASE` pour Aider et
LiteLLM), mais la valeur est toujours le `…/v1` du proxy.

Vérifiés ainsi : Claude Code sur abonnement, Codex, Gemini CLI. Les autres suivent le même
contrat d'adresse de base ; regardez le journal du proxy (ou `--reveal` sur votre propre
terminal) pour confirmer que les requêtes arrivent et sont masquées.

## L'autre moitié : `--mcp`

`/v1/*` masque ce que lit le modèle ; `/mcp` masque ce que lisent ses OUTILS. Le point d'accès
est un streamable HTTP standard : **n'importe quel** client MCP sait viser
`http://127.0.0.1:8787/mcp`. Ce qui change d'un client à l'autre, c'est la capacité du proxy à
devenir son SEUL MCP le temps du run — un agent qui garde ses propres connexions atteint Gmail
directement, avec son propre identifiant, et rien de ce chemin n'est masqué.

| Client | Exclusivité | Comment, et ce que ça vous coûte |
|---|---|---|
| **Claude Code** | ✅ automatique | `--mcp-config <temp> --strict-mcp-config`, son propre interrupteur. Vérifié en session réelle : la liste d'outils est revenue avec `mcp__openmasq__crm__*` et rien d'autre |
| **Codex** | ✅ automatique | un `-c mcp_servers.<id>.enabled=false` par serveur déclaré (lus dans `codex mcp list --json`), le nôtre, et `features.apps=false` pour le serveur builtin `codex_apps` qu'AUCUNE liste ne montre. Vérifié en session réelle : la liste d'outils du modèle était `mcp__openmasq__crm__lookup_contact` seul, et le contact imprimé était le faux du coffre. ⚠️ `codex exec` refuse les appels MCP sous son `approval_policy = never` par défaut — ajoutez `-c 'mcp_servers.openmasq.default_tools_approval_mode="approve"'` après `--` pour un run non interactif |
| **Gemini CLI** | ✅ après une commande | `gemini mcp add -s user -t http openmasq http://127.0.0.1:8787/mcp` une fois, puis le run passe `--allowed-mcp-server-names openmasq`. Vérifié en vol (connecté, outils servis). ⚠️ enveloppez une session, pas une sous-commande : `gemini mcp list` refuse le drapeau |
| **opencode** | ✅ automatique | un fichier de config à nous dans `OPENCODE_CONFIG` : le nôtre ajouté, chacun des siens en `enabled: false`. Vérifié en vol : son leurre est revenu `disabled`, `openmasq` `connected`. ⚠️ un `opencode.json` de projet l'emporte sur ce fichier — le proxy repose la question sous sa propre config et refuse l'exclusivité si quelque chose a survécu (vérifié aussi) |
| **Copilot CLI** | ✅ automatique | un `--disable-mcp-server <id>` par serveur (liste via `copilot mcp list --json`), `--disable-builtin-mcps`, le nôtre via `--additional-mcp-config @fichier`. Drapeaux lus dans le binaire ; une session réelle demande une connexion GitHub, donc cette moitié n'est pas revendiquée |
| **Cursor CLI** | ✖ | aucun drapeau MCP |
| **goose** | ✖ | `--with-extension` / `--with-builtin` ne font qu'AJOUTER |
| **Antigravity** | ✖ | aucun drapeau MCP sur sa CLI, et l'IDE n'a pas non plus de crochet BYOK pour la moitié modèle. Pointez-le à la main sur `/mcp` dans `~/.gemini/config/mcp_config.json` (ou Réglages ▸ Customizations ▸ Open MCP Config) — ⚠️ il écrit `serverUrl`, pas `url` |

Déplacer le dossier personnel (`CODEX_HOME`, `GEMINI_CLI_HOME`, `COPILOT_HOME`) n'est jamais la
réponse : les identifiants suivent les réglages. Et la liste blanche
`disabled_mcps: ["*", "!x"]` d'opencode, décrite sur les forums, n'existe pas dans le binaire
— cherchée, absente en 1.18.30. Pour un client ✖, pointez-le vous-même sur
`/mcp` et désactivez ses propres serveurs — le proxy le dit au démarrage plutôt que de laisser
croire à un masquage qu'il ne peut pas appliquer.

⚠️ Deux points décident de l'utilité : le proxy est en `standard` par défaut (règles
déterministes, pas de modèle) — les noms, entreprises et lieux ne sont masqués qu'en
`--level renforce` ; et un outil qui code en dur l'hôte du fournisseur, sans réglage d'adresse
de base, ne peut pas s'en servir.
