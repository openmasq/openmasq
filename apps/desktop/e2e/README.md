# Real end-to-end tests (logged-in ChatGPT / Claude)

> Deux autres suites vivent ici sur le MÊME harnais app-buildée : `workflows-openrouter.e2e.ts`
> (workflows agentiques, fixtures MCP) et `documents.e2e.ts` (génération + ÉDITION des
> documents ```document — la PII tapée dans l'éditeur entre au vault et ne part jamais en
> clair). Toutes deux gated `OPENROUTER_API_KEY` (modèle gratuit par défaut → coût nul) ;
> `pnpm e2e:workflows` / `pnpm e2e:documents`. Chaque spec documente ses invariants en tête.
> ⚠️ Les scripts passent par `node ../../node_modules/@playwright/test/cli.js` — le
> `.bin/playwright` hoisté est un `playwright` standalone d'une AUTRE version qui ne
> collecte aucun test (« did not expect test.describe() »).

These launch the **built Electron app** with an **actual signed-in web session**
and assert the core privacy guarantee by comparing two things:

| Prompt contains       | App shows you (your copy) | Text sent to the model        |
| --------------------- | ------------------------- | ----------------------------- |
| nothing sensitive     | the prompt                | **identical**                 |
| names / emails        | the **real** values       | **fake** substitute / token   |
| numbers (number mode) | the **real** figures      | `n1`, `n2`… tokens            |

### What we compare, and why not the live page

The "text sent to the model" is captured at the **relay boundary** — the exact
payload the app hands to the web session (`wv.send("host:send", { text })`),
before it hits the network. We do **not** scrape ChatGPT's rendered page:
driving the live site in automation gets stuck on Cloudflare's "Un instant…"
challenge (bot detection on the embedded webview). Capturing what *leaves the
app* is both Cloudflare-proof and the thing that actually matters — it's exactly
what the model receives. The test still runs the whole pipeline (UI → store →
redaction → relay).

## Why we don't automate the password login

`chatgpt.com` is behind Arkose FunCaptcha + Cloudflare, and **fresh logins from
inside Electron loop forever** on Cloudflare's challenge (it flags the embedded
browser as a bot → repeated 403). OpenAI's ToS also forbids automated login.

So we **don't** log in from scratch. `pnpm e2e:login`:

1. Launches the app on your **real profile** and, if it's already signed in to
   ChatGPT/Claude (it usually is — you use the keyless feature), **copies just the
   session cookies** (`Partitions/`) into the isolated test profile. No password,
   no CAPTCHA, no Cloudflare.
2. Only if no existing session is found does it fall back to an interactive login
   window (now using a Chromium-matching User-Agent, so it no longer loops).

## Usage

```bash
# 1) Once: adopt your existing session into the test profile (or log in by hand).
pnpm e2e:login                       # ChatGPT
E2E_PLATFORM=claude pnpm e2e:login   # or Claude

# 2) Automated comparison tests — reuse the saved session, no password needed.
pnpm test:e2e
```

The session lasts weeks; re-run `e2e:login` only when `test:e2e` reports "Not
signed in". These tests hit the real network and a real model, so they are
**not** part of `pnpm test` — run them nightly or manually.

> The infinite-Cloudflare-loop on a Firefox UA was also a **real bug** in the
> app's own keyless login (`webSession.ts` forced a Firefox UA on the Chromium
> login window); it's fixed to use a Chrome UA for the platform's own sign-in.

## How it works

- Two inert production hooks (no effect without the env vars):
  `OPENMASQ_USER_DATA_DIR` points Electron at the test profile;
  `OPENMASQ_DISABLE_DB` skips the local DB so the renderer store is
  localStorage-only and tests can seed settings deterministically.
- `helpers.ts` launches the app, opens a keyless chat, patches the webview's
  `send` to record the relayed `text`, sends a prompt, and reads the app's user
  bubble (`.msg.user`) + redaction highlights (`mark.redaction-mark`).
- `chat.e2e.ts` runs the no-sensitive / email / numbers comparisons above.

Settings are seeded per-test through `localStorage`. Email and number cases work
fully offline via the built-in regex rules; **names/companies** detection needs a
reachable redaction model (Mistral/Ollama).

## Documents multiples — redaction local, JUGÉ (`pnpm e2e:documents-multi`)

`documents-multi.e2e.ts` joint **quatre formats en un seul envoi** (CSV, XLSX, PDF, DOCX
— quatre extracteurs distincts) et juge le redaction **sans aucun modèle de chat** : tout
ce qui produit le résultat est déjà sur la machine (mBERT pour les noms, docTR/Tesseract
pour les pixels, les règles déterministes pour le reste). Aucune clé d'API, aucun appel
sortant, coût nul — le destinataire est un endpoint OpenAI-compatible bidon levé sur
127.0.0.1, ce qui permet de juger le **wire réel** plutôt qu'un état intermédiaire.

- L'oracle est la **fonction de décision de l'app** (`pseudonymize` sur le texte extrait),
  pas une liste réécrite à côté : ce test ne mesure donc PAS le rappel du détecteur (c'est
  le rôle des tests unitaires du moteur), il vérifie que cette
  décision **arrive intacte** sur le wire à travers quatre extracteurs et le pliage
  multi-documents. Une divergence ici est un défaut de PIPELINE.
- Le jugement est fait **par section de document** : le moteur mint des faux crédibles, donc
  un faux minté pour le NDA peut être égal à une VRAIE valeur du CSV — cherchée dans tout le
  wire la chaîne est ambiguë, cherchée dans la section dont elle vient elle ne l'est plus.
- Prérequis : `pnpm bake:ner` (hors app packagée les poids sont lus depuis
  `apps/desktop/build/ner-models`) ; sans eux le spec se **skip** au lieu de passer à vide.

⚠️ **Ce spec est ROUGE aujourd'hui, et c'est son travail** : il signale une divergence
réelle — `billing@example.com` (en-tête expéditeur de `invoice-2024-0042.pdf`) est remplacé
par `pseudonymize` sur le texte extrait, mais atteint le wire en clair, alors que tout le
reste de la même section (IBAN, carte, TVA, noms, autres e-mails) est bien redacted. Deux
pistes à instruire : le texte extrait par l'app diffère de celui qu'obtient l'extracteur en
Node, ou la carte de remplacements du drop est réutilisée telle quelle et ce qu'elle a raté
part en clair (le piège documenté de `reusableDocReplacements`).

## Workflows agentiques — OpenRouter réel (`pnpm e2e:workflows`)

`workflows-openrouter.e2e.ts` rejoue les **17 demandes utilisateur les plus
probables** — le catalogue est `workflows/catalog.ts`, un prompt par cas, chacun
commenté par ce qu'il vérifie et non par ce qu'il raconte. Trois familles :
lectures (boîte, recherche, agenda, journée, réunion, Drive, CRM, paiements,
sprint), écritures (envoi, évènement, brouillon, note CRM, tâche) et **prompts
sans outil** (rédiger une relance, ranger un contact collé) — ces derniers
vérifient qu'un modèle ne part PAS fouiller les connecteurs quand on lui demande
seulement d'écrire, et que la PII **tapée par l'utilisateur** ne quitte pas la
machine en clair. Le tout contre la **vraie API OpenRouter** (clé `OPENROUTER_API_KEY` dans le `.env`
racine ; modèle **gratuit** par défaut → coût nul).

- `E2E_MODEL` — id du modèle (défaut `google/gemma-4-26b-a4b-it:free`).
  ⚠️ Les Gemma OpenRouter sont `noTools` : le défaut vérifie le **repli sans
  connecteurs** (la réalité sur ce modèle). Pour exercer les tool-calls :
  `E2E_MODEL="openai/gpt-oss-20b:free"`.
- `E2E_TOOL_FIXTURES=0` — mode **sans** fixtures (aucun connecteur — la réalité
  d'un compte qui n'a rien connecté). Par défaut, des connecteurs FIXTURES
  (`fixtures/mcp/workflows.json`, hook main `OPENMASQ_E2E_MCP_FIXTURES`)
  servent des résultats stables truffés de PII de test.
- `E2E_PARALLEL=1` (+ `E2E_WORKERS=n`) — un app/profil isolé par test, en
  parallèle. `E2E_STRICT=1` — assertions soft sur le CONTENU des réponses.

Toujours vérifié, quel que soit le mode : aucune PII (fixtures ou tapée) sur le
wire (`OPENMASQ_E2E_WIRE_LOG` couvre aussi les tours d'outils) ; une écriture
n'atteint le connecteur qu'après un clic de confirmation ; et l'argument sortant
arrive **en clair** au connecteur (`OPENMASQ_E2E_TOOLCALL_LOG`).

⚠️ **La SURFACE de confirmation est elle-même une assertion.** Le champ `write`
du catalogue vaut `"system"` (fenêtre main non-spoofable — envoi, évènement) ou
`"chat"` (carte dans la conversation — brouillon, note, tâche : local et
réversible), et le harnais compte les deux séparément. L'assertion est
**asymétrique, volontairement** : un écrit risqué DOIT avoir été confirmé sur la
fenêtre main (sinon une XSS du renderer pourrait le cliquer), alors qu'un geste
local qui ouvrirait une fenêtre système n'est qu'une nuisance — soft. Le
classement vient de `@openmasq/catalog/mcp` `writeRisk` ; c'est ce test qui
empêche un envoi de glisser vers la surface cliquable.
