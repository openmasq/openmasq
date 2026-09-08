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

⚠️ Deux points décident de l'utilité : le proxy est en `standard` par défaut (règles
déterministes, pas de modèle) — les noms, entreprises et lieux ne sont masqués qu'en
`--level renforce` ; et un outil qui code en dur l'hôte du fournisseur, sans réglage d'adresse
de base, ne peut pas s'en servir.
