# OpenMasq

**A multi-model desktop chat app that redacts sensitive data before it leaves your
machine — and puts it back in the reply.**

[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS-lightgrey)](#getting-started)
[![Redaction](https://img.shields.io/badge/redaction-on--device-green)](#whats-in-the-box)
[![Website](https://img.shields.io/badge/openmasq.com-website-6c5ce7)](https://openmasq.com)
[![Help](https://img.shields.io/badge/help.openmasq.com-help_centre-6c5ce7)](https://help.openmasq.com)

<sub>**English** · [Français](#français) · [openmasq.com](https://openmasq.com) · [Help centre](https://help.openmasq.com) · [Contact](mailto:support@openmasq.com)</sub>

![What the model saw: the message on the left, what actually left on the right — the name, e-mail, phone and company replaced](docs/img/what-the-model-saw.webp)

*Every screenshot on this page is a real run of the app, captured on a seeded profile
with fixture data — never anyone's real conversation.*

> **Download, or build.** A signed and notarised **macOS** build (Apple silicon and
> Intel) is at [openmasq.com/telecharger](https://openmasq.com/telecharger); it updates
> itself. No Windows or Linux build is published. Building from source takes two commands,
> see [Getting started](#getting-started) — and note that the downloadable build is this
> repository's release workflow run *with* the brand's service addresses, so it carries the
> account, sync and included-model features that a build from these sources alone leaves out.

The model never sees the real thing. Values the engine detects are replaced with
believable substitutes before any network call; the reply is restored locally from a
per-conversation vault, so the conversation reads naturally on your side.

```
prompt ──redact──▶ what the model receives ──model──▶ reply ──de-redact──▶ what you see
```

```
you type:   "Call Jean Rebour (SAS Acme) on 06 12 34 56 78 — revenue 850 000 €"
→ to model: "Call Léa Savary (Cyberdyne) on 36 86 42 08 64 — revenue 850 000 €"
← model:    "I'll email Léa Savary about the 850 000 € revenue…"
→ you see:  "I'll email Jean Rebour about the 850 000 € revenue…"
```

Identities are swapped; **figures stay real by default**, so a model can still compute
with them. The vault is stable across turns — the same value always maps to the same
substitute, which is what makes the reply reversible.

Models are reached with **your own API keys**, a local model, or a Claude Code, Codex or
Antigravity CLI subscription. (The code also supports reaching them on the app's key through a metered
gateway; that service is not part of this build — see *Running it* below.)

> **The redaction boundary governs what the *model* sees, and nothing else.** Connected
> services — a mailbox, a calendar, a search — receive the **real** value, because a
> search for a substitute finds nobody. Their results come back redacted through the same
> vault. This is a deliberate, documented trade-off; see [`SECURITY.md`](SECURITY.md).

---

## What's in the box

- **Redaction engine** — deterministic rules, checksums and shape detectors, then a local
  NER model. Runs on-device. Names, dates of birth, e-mails, phones, addresses, places,
  companies, cards, IBANs, national identifiers, IPs, file paths, health data, handles,
  URLs, keys and secrets.
- **Documents** — PDF, Office and image attachments are extracted (pdf.js, OCR via a
  vendored, hardened Tesseract + docTR) and redacted before they are sent.
- **MCP connectors** — Gmail, Google Drive, Docs, Sheets, Calendar, Outlook, OneDrive,
  SharePoint, Teams, Slack and GitHub with on-device OAuth; some forty remote MCP servers
  (Notion, Linear, Sentry, PostHog, Atlassian, Stripe, Supabase, Vercel…) and any you add;
  a local filesystem server; an agent-driven browser. Tool calls leave de-redacted and
  their results return redacted.
- **A Python sandbox** — model-generated code runs against de-redacted data under an OS
  jail, out of the privileged process.
- **Cross-device sync** — end-to-end encrypted; the server stores ciphertext only.
  *(Client code only in this build: it needs a backend, which is not part of it.)*
- **Organizations** — an admin console with RBAC, an audit log, mandated redaction
  categories and a confirmation-posture floor.
  *(Client code only in this build, same reason.)*

The exhaustive, screen-by-screen inventory lives in [`FEATURES.md`](FEATURES.md).

---

<details>
<summary><b>Two more screenshots</b> — before the send, and after the reply</summary>

**Before anything leaves.** The composer highlights what it is about to replace, lists each
value as a chip you can strike out, and carries the count. Nothing has been sent yet.

![The composer: name, e-mail, phone and company highlighted, one chip each, and the send row reading "4 to mask"](docs/img/composer.webp)

**After the reply.** The model answered about *Anselme Bouchereau* at *Torvel Labs*; you
read it about Jean Rebour at Acme Studio. The line under your message names what was
replaced, by category, and the card offers the side-by-side comparison above. The
substitute is not a fixed alias: a per-conversation salt gives the same real value a
different one in the next conversation, so a table built over the pool reverses nothing.

![The conversation: four values highlighted in the prompt, the reply restored, and the transparency card](docs/img/conversation.webp)

</details>

## Benchmarks

Two questions are measured, because they are not the same question:

- **Did the value leave the machine?** A truth counts as found when most of its tokens were
  replaced. That is what a redaction product owes you.
- **Where exactly did the engine draw the line?** Every annotated character counts on its
  own — a name found but cut short scores partly, and paint past the edge of a value is paid
  for. That is how the literature judges a detector; the protocol is the one in Perplexity's
  [PII-TRACE](https://www.perplexity.ai/hub/blog/pii-trace-detecting-personal-data-before-it-leaves-the-device)
  paper, so these numbers can sit beside the ones it publishes.

**Values — did it leave?** Our corpus: 18 document families, 14 languages, real layouts, OCR
damage, 907 cases, 3 357 annotated truths.

| corpus | truths | `patterns` (no model) | **the product** (`ner`) | PII-Tracer | Presidio (default) |
|---|---:|---:|---:|---:|---:|
| **ours** | 3 357 | 89 % · 91 FP | **95 %** · 258 FP | 92 % · 530 FP | 46 % · 847 FP |
| **Presidio's** — its own evaluation set, English, template + faker | 2 523 | 31 % · 6 FP | **74 %** · 115 FP | — | 58 % · 196 FP |

A truth counts as *found* when ≥ 60 % of its significant tokens were replaced; a *false
positive* (FP) is a detection overlapping no annotated value.

**Characters — where was the line?** Five corpora, six engines, one scorer. Scored on **the
categories this app actually has a switch for**: each corpus annotates its own idea of
personal data — Gretel counts a company name, Nemotron annotates occupation and religion, TAB
marks every date — so every upstream label is mapped onto one of the app's categories, and
what no category covers is shown but not counted. A single number pooled over "whatever this
corpus happened to annotate" mostly measures the distance between four taxonomies.

| corpus | cases | `patterns` | **`ner`** (the product) | `ner` (Strict) | PII-Tracer | OpenAI PF | Presidio |
|---|---:|---:|---:|---:|---:|---:|---:|
| OpenMasq | 907 | 0.931 | **0.931** | 0.923 | 0.888 | 0.833 | 0.547 |
| TAB | 127 | 0.425 | **0.606** | 0.855 | 0.742 | 0.435 | 0.815 |
| Gretel | 2000 | 0.575 | **0.646** | 0.646 | 0.611 | 0.565 | 0.422 |
| ai4privacy | 2000 | 0.756 | **0.796** | 0.827 | 0.952 | 0.945 | 0.579 |
| Nemotron | 2000 | 0.627 | **0.735** | 0.928 | 0.887 | 0.736 | 0.768 |

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="packages/redact/bench/spans/figures/f1-by-corpus-en-dark.png">
  <img alt="Character-level F1 per corpus and per engine" src="packages/redact/bench/spans/figures/f1-by-corpus-en-light.png">
</picture>

**Why the numbers land where they do** — the four things that move them more than the engines do:

- **A shape is a proof, a name is a guess.** Cards, IBANs, e-mails, IPs sit at or near 100 %
  with no model at all: a checksum decides. Names, addresses and companies are where an
  engine is actually tested, and where the local model earns its cost — on Chinese, Japanese
  and Korean the rules alone reach 24–26 %, the model 66–88 %.
- **A card number we miss is one no bank could issue.** 89 % of Nemotron's card numbers and
  52 % of Gretel's fail the Luhn check — drawn at random by a generator. Split the gold on
  that: **every value whose key verifies is found**, 100 % on both corpora. The engine refuses
  the rest on purpose; accepting any sixteen digits is how a redaction tool starts eating order
  numbers.
- **A corpus that under-annotates punishes recall AND precision.** Gretel leaves the account
  numbers in its MT940/SWIFT/XBRL documents unlabelled: on those 320 documents every engine
  marks numbers nobody annotated, and precision collapses — 0.24 for PII-Tracer, 0.43 for
  ours. It is a property of the corpus, not of the detectors.
- **Partial credit flatters everyone, and it flatters us most.** F1 rewards a value found
  half-way; a redaction product has to find *every* mention. That stricter number is on the
  bench page beside this one, and it is lower for all six columns.
- **Presidio here is a default `pip install`** — Presidio *and* spaCy `en_core_web_lg`, run
  with `language="en"` on all fourteen languages, which is what a user gets out of the box,
  not Presidio's ceiling. Its 41 % on our **English** cases says the gap is real layouts, not
  the language.

**Whatever the numbers, detection is not a guarantee.** The Vault — terms you mark yourself —
is the only coverage promise the product makes for a given string.

**The detail lives with the code it measures**, in
**[`packages/redact/bench`](packages/redact/bench)**: what each corpus contains and where it
comes from, the per-category and per-language tables, response time per document, the
consistency score, where this bench reproduces a published figure and where it does not — and
why.

```bash
git clone https://github.com/openmasq/openmasq && cd openmasq && pnpm install
pnpm bench:spans   --replay --markdown            # the character-level page, from committed results
pnpm bench:compare --engines patterns,presidio    # ~1 min, no model: rules vs Presidio's committed detections
pnpm build && pnpm bench:compare                  # adds the product column (bakes the local NER, sha256-pinned)
```

Presidio's column is a committed artifact, so both benches replay without Python.

## Links

| | |
|---|---|
| **Help centre** | [help.openmasq.com](https://help.openmasq.com) — how each screen works, in French and English |
| **Website** | [openmasq.com](https://openmasq.com) — the landing: what the product is, for whom, and how to get it |
| **Contact** | [support@openmasq.com](mailto:support@openmasq.com) — questions, and the address the app's feedback reaches |
| **Security** | [`SECURITY.md`](SECURITY.md) — the trust boundary, the residuals, and how to report a vulnerability |
| **What it does, screen by screen** | [`FEATURES.md`](FEATURES.md) |
| **Contributing** | [`CONTRIBUTING.md`](CONTRIBUTING.md) · [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) |
| **Running your own stack** | [`SELF_HOSTING.md`](SELF_HOSTING.md) |

<!-- docs/img/social-preview.png is the GitHub social preview (1280×640): upload it under
     Settings → General → Social preview. It is not referenced by any page — it exists so the
     card that shows up in Slack, X and Discord lives in the repository like everything else. -->

## Repository layout

```
apps/
  desktop/       Electron app — the product. main (IPC, DB, MCP, streaming) ·
                 preload (contextBridge → window.openmasq) · renderer · e2e
  mcp-broker/    MCP broker + OAuth AS — a LOCAL sidecar the desktop spawns
                 (not the backend: the server side lives in a separate repository)
packages/
  redact/        The redaction engine (pure, unit-tested)
  ui/            All React UI + store + design system (light + dark)
  llm/           Provider clients, model registry, SSE, tool-calling
  mcp/           Redacting MCP client · connectors/ on-device-OAuth MCP tools
  catalog/       Single-source governable lists (models, connectors, categories)
  i18n/          Typed message catalogue (fr source + en)
  credits/ schema/ sync/ branding/ analytics/
  tesseract2/    Vendored hardened OCR (worker_threads + WASM) · ort/ · vendor/xlsx/
```

**Dependency direction:** `ui` → `llm`/`redact`/`mcp`/`catalog`/`schema`/`analytics`;
`mcp` → `redact`; `sync` → `schema`; `desktop` composes all and supplies the
`Host`. **Apps never import apps** — enforced by `pnpm check:dup`.

---

## Getting started

**Prerequisites** — Node.js ≥ 20 (CI runs 26) and pnpm (`corepack enable` provides it).

```bash
pnpm install
pnpm dev          # builds the packages, then launches the Electron app
```

> **Working on redaction?** The on-device NER and OCR models are not part of `dev` or
> `build` — run `pnpm --filter @openmasq/desktop bake` once to fetch them. Without it the
> app runs, but detection falls back to the pattern rules **with no warning**, so you'd be
> testing the regex floor rather than the model. See [`CONTRIBUTING.md`](CONTRIBUTING.md).

Then open **⚙ Settings** and paste a provider key (OpenAI, Anthropic, Google, Mistral,
DeepSeek, Scaleway, OpenRouter, or any OpenAI-compatible endpoint — Ollama, LM Studio,
vLLM), or point the app at a local model. Your Claude Code, Codex or Antigravity CLI
subscription works too.

**This build has no backend.** No billing, no sync, no organizations, no included
models: those services are not part of it — they live in a private repository, behind the
`OPENMASQ_BILLING` gate — and the app runs on your machine: your keys, a local model, or a
CLI subscription. Redaction is on-device.

**So why does the source mention subscriptions at all?** You will find a tier catalogue
(`packages/credits/src/tiers.ts`), a Paiement tab and its wording in the translation
catalogues. They exist for one case only: someone who deploys the private stack and chooses
to charge for it. The OpenMasq the brand publishes is built **without** that gate — the
binaries on the releases page sell nothing, show no plan, hold no credits, and the word
« subscription » never appears except for your own Claude Code, Codex or Antigravity CLI.
Release notes older than the open-source launch (September 2026) describe the earlier hosted
offer; they are kept as history, not as a promise.

**Five small services stay hosted by the brand, and a build from these sources
reaches them by default** (`apps/desktop/scripts/publicServices.ts`): sign-in (a
Supabase project — magic link or Google; the account only identifies you, nothing sits
behind it), the Slack relay (the code→token exchange Slack forbids on-device), the
analytics relay (pseudonymous counters — ON by default, tied to a stable install id,
turned off in Settings, and never sent when Do Not Track or GPC is set — plus the release notes
the app displays, plus the feature-flag read — that last one is a configuration request,
not measurement, so it runs outside consent and carries the install id and, when you are
signed in, your account token: `packages/analytics/src/flags.ts` says so in full), crash reports (Sentry — an allow-list of a few machine
fields, never a key or a vault value; the exception message and the frame names cannot be
allow-listed field by field, so they are scrubbed and truncated instead — a mitigation, not
a guarantee, and `apps/desktop/src/sentry/policy.ts` states the residual it accepts) and
the update feed (where a packaged build checks for new versions, carrying a per-install
identifier so a staged rollout can be held back). Their code is not in this
repository. Each is one variable, and a variable set **empty** at build time
(`OPENMASQ_SENTRY_DSN=`, `VITE_UPDATES_URL=`) opts out of it — a fork that ships under
its own identity should empty the feed so it never updates itself with the brand's
signed binary (`SELF_HOSTING.md`). `pnpm dev` applies them too — except error reports:
only a binary the CI built and signed reports crashes; an unpackaged app or a package
built outside the CI reports no error at all, only its usage to analytics (stamped
`env:"local"`), since its code may differ from any release.

Running a local stack is an explicit choice: the overrides go in a gitignored
`apps/desktop/.env.development.local`, and the committed `.env.development` says which
overrides go there.

---

## Working on it

```bash
pnpm test              # unit tests — free, run them constantly
pnpm test:changed      # only what the change graph touches
pnpm test:redact       # the redaction engine alone (~4 s)
pnpm typecheck
pnpm build
pnpm verify            # the full local gate suite
```

The e2e suites are **not** part of that loop: they drive the built app against real
provider APIs and cost real money. Each spec skips itself without its key —
`pnpm --filter @openmasq/desktop e2e:openai` (`apps/desktop/e2e/README.md`).

Some conventions are enforced rather than asked for, each by its own gate: a 300-line
cap per source file (`check:loc`), documentation that points at paths which exist
(`check:docs`), no fact or behaviour implemented twice (`check:dup`), `FEATURES.md` kept
in step with the product (`check:features`), and every GitHub Action pinned to a commit
SHA (`check:actions`). They run in CI; `pnpm verify` runs them locally.

`CLAUDE.md` at the root is the map — the invariants, the traps, and where each thing
lives. Each app and package also has a nested `CLAUDE.md` used by the maintainers as a
working guide; those are kept out of the published tree (`.gitignore`) — the code and
its tests are the contract here, not the notes.
Read the root one before a first change.

---

## Security

The threat model, the guarantees, and — at the same length — the **known limitations**
are in [`SECURITY.md`](SECURITY.md). It is written to be checked against this source, not
taken on faith: redaction is detection and detection is imperfect, prompt injection is
bounded rather than solved, encryption at rest is not guaranteed on every install, and
the Python jail is not equally strong on every platform. All of that is stated there.

**Report a vulnerability privately** through this repository's *Security → Report a
vulnerability* flow. Please do not open a public issue, discussion or pull request
containing exploit details.

---

## License

[Apache License 2.0](LICENSE) — for the whole repository: the desktop app, the packages
(including the redaction engine), the local MCP broker and the tooling. You may use,
modify, redistribute and build on it, commercially included, provided you keep the notices
([`NOTICE`](NOTICE)) and state your changes; the licence also carries an express patent
grant from every contributor.

Contributions are accepted under the same licence, by section 5 of the licence itself —
there is no separate agreement to sign.

Third-party code included here keeps its own licence: `packages/tesseract2` (derived from
tesseract.js) and `vendor/xlsx` (SheetJS), both Apache-2.0. Assets fetched at build time
and shipped inside the app are listed in [`NOTICE`](NOTICE).


---

# Français

<sub>[openmasq.com](https://openmasq.com) · [Centre d'aide](https://help.openmasq.com) · [Contact](mailto:support@openmasq.com)</sub>

**Une application de chat de bureau multi-modèles qui masque les données sensibles avant
qu'elles ne quittent votre machine — et les rétablit dans la réponse.**

> **Téléchargez, ou construisez.** Un build **macOS** signé et notarisé (Apple silicon et
> Intel) est sur [openmasq.com/telecharger](https://openmasq.com/telecharger) ; il se met à
> jour seul. Aucun build Windows ni Linux n'est publié. Construire depuis les sources tient
> en deux commandes, voir [Démarrer](#démarrer) — et le build téléchargeable est le workflow
> de publication de ce dépôt exécuté *avec* les adresses des services de la marque : il porte
> le compte, la synchronisation et les modèles inclus qu'un build issu des seules sources
> n'a pas.

Le modèle ne voit jamais la vraie valeur. Ce que le moteur détecte est remplacé par un
substitut crédible avant tout appel réseau ; la réponse est rétablie localement depuis un
coffre propre à la conversation, si bien que l'échange se lit normalement de votre côté.

```
message ──masquage──▶ ce que le modèle reçoit ──modèle──▶ réponse ──démasquage──▶ ce que vous lisez
```

```
vous tapez :  « Relance Jean Rebour (SAS Acme) au 06 12 34 56 78 — CA 850 000 € »
→ au modèle : « Relance Léa Savary (Cyberdyne) au 36 86 42 08 64 — CA 850 000 € »
← le modèle : « J'écris à Léa Savary au sujet du CA de 850 000 €… »
→ vous lisez : « J'écris à Jean Rebour au sujet du CA de 850 000 €… »
```

Les identités sont permutées ; **les chiffres restent vrais par défaut**, pour qu'un modèle
puisse encore calculer avec. Le coffre est stable d'un tour à l'autre — une même valeur
donne toujours le même substitut, et c'est ce qui rend la réponse réversible.

Les modèles sont atteints avec **vos propres clés d'API**, un modèle local, ou un abonnement
Claude Code, Codex ou Antigravity CLI. (Le code sait aussi passer par la passerelle facturée de la marque ;
ce service ne fait pas partie de ce build — voir *Le faire tourner* plus bas.)

> **La frontière de masquage gouverne ce que le *modèle* voit, et rien d'autre.** Les
> services connectés — une boîte mail, un agenda, une recherche — reçoivent la **vraie**
> valeur, parce qu'une recherche sur un substitut ne trouve personne. Leurs résultats
> reviennent masqués par le même coffre. C'est un compromis délibéré et documenté :
> [`SECURITY.md`](SECURITY.md).

## Ce qu'il y a dedans

- **Le moteur de masquage** — des règles déterministes, des sommes de contrôle et des
  détecteurs de forme, puis un modèle NER local. Tout s'exécute sur la machine. Noms, dates
  de naissance, e-mails, téléphones, adresses, lieux, entreprises, cartes, IBAN,
  identifiants nationaux, IP, chemins de fichiers, données de santé, pseudos, URL, clés et
  secrets.
- **Les documents** — les pièces jointes PDF, Office et images sont extraites (pdf.js, OCR
  par un Tesseract durci et vendorisé + docTR) puis masquées avant l'envoi.
- **Les connecteurs MCP** — Gmail, Google Drive, Docs, Sheets, Agenda, Outlook, OneDrive,
  SharePoint, Teams, Slack et GitHub avec OAuth sur l'appareil ; une quarantaine de serveurs
  MCP distants (Notion, Linear, Sentry, PostHog, Atlassian, Stripe, Supabase, Vercel…) et
  ceux que vous ajoutez ; un serveur de fichiers local ; un navigateur piloté par l'agent.
  Les appels d'outils partent démasqués et leurs résultats reviennent masqués.
- **Un bac à sable Python** — le code écrit par le modèle s'exécute sur des données
  démasquées, sous une prison système, hors du processus privilégié.
- **La synchronisation entre appareils** — chiffrée de bout en bout ; le serveur ne stocke
  que du chiffré. *(Côté client seulement dans ce build : il lui faut un backend, qui n'en
  fait pas partie.)*
- **Les organisations** — une console d'administration avec RBAC, un journal d'audit, des
  catégories de masquage imposées et un plancher de posture de confirmation.
  *(Côté client seulement, pour la même raison.)*

L'inventaire exhaustif, écran par écran, est dans [`FEATURES.md`](FEATURES.md).

## Bancs de mesure

Deux questions sont mesurées, parce que ce ne sont pas les mêmes :

- **La valeur est-elle sortie de la machine ?** Une vérité compte comme trouvée quand
  l'essentiel de ses tokens a été remplacé. C'est ce qu'un produit de masquage vous doit.
- **Où le moteur a-t-il posé la limite, exactement ?** Chaque caractère annoté compte pour
  lui-même — un nom trouvé mais coupé ne marque qu'en partie, et déborder d'une valeur se
  paie. C'est ainsi que la littérature juge un détecteur ; le protocole est celui de l'article
  [PII-TRACE](https://www.perplexity.ai/hub/blog/pii-trace-detecting-personal-data-before-it-leaves-the-device)
  de Perplexity, pour que ces chiffres puissent se poser à côté des siens.

**Les valeurs — est-ce sorti ?** Notre corpus : 18 familles de documents, 14 langues, vraies
mises en page, dégât OCR, 907 cas, 3 357 vérités annotées.

| corpus | vérités | `patterns` (sans modèle) | **le produit** (`ner`) | PII-Tracer | Presidio (par défaut) |
|---|---:|---:|---:|---:|---:|
| **le nôtre** | 3 357 | 89 % · 91 FP | **95 %** · 258 FP | 92 % · 530 FP | 46 % · 847 FP |
| **celui de Presidio** — son propre jeu d'évaluation, anglais, gabarits + faker | 2 523 | 31 % · 6 FP | **74 %** · 115 FP | — | 58 % · 196 FP |

Une vérité compte comme *trouvée* quand ≥ 60 % de ses tokens significatifs ont été remplacés ;
un *faux positif* (FP) est une détection qui ne chevauche aucune valeur annotée.

**Les caractères — où était la limite ?** Cinq corpus, six moteurs, un seul scoreur. Notés sur
**les catégories que cette app a vraiment en réglage** : chaque corpus annote sa propre idée
de la donnée personnelle — Gretel compte un nom d'entreprise, Nemotron annote le métier et la
religion, TAB marque toutes les dates — alors chaque étiquette amont est ramenée à une
catégorie de l'app, et ce qu'aucune catégorie ne couvre est montré sans être compté. Un chiffre
unique agrégé sur « ce que ce corpus a annoté » mesure surtout l'écart entre quatre taxonomies.

| corpus | cas | `patterns` | **`ner`** (le produit) | `ner` (Strict) | PII-Tracer | OpenAI PF | Presidio |
|---|---:|---:|---:|---:|---:|---:|---:|
| OpenMasq | 907 | 0.931 | **0.931** | 0.923 | 0.888 | 0.833 | 0.547 |
| TAB | 127 | 0.425 | **0.606** | 0.855 | 0.742 | 0.435 | 0.815 |
| Gretel | 2000 | 0.575 | **0.646** | 0.646 | 0.611 | 0.565 | 0.422 |
| ai4privacy | 2000 | 0.756 | **0.796** | 0.827 | 0.952 | 0.945 | 0.579 |
| Nemotron | 2000 | 0.627 | **0.735** | 0.928 | 0.887 | 0.736 | 0.768 |

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="packages/redact/bench/spans/figures/f1-by-corpus-fr-dark.png">
  <img alt="F1 au niveau du caractère, par corpus et par moteur" src="packages/redact/bench/spans/figures/f1-by-corpus-fr-light.png">
</picture>

**Pourquoi les chiffres tombent là** — les quatre choses qui les déplacent plus que les moteurs :

- **Une forme est une preuve, un nom est un pari.** Cartes, IBAN, e-mails, IP sont à 100 % ou
  presque sans aucun modèle : une clé de contrôle tranche. Les noms, les adresses et les
  entreprises sont là où un moteur est réellement mis à l'épreuve, et où le modèle local paie
  son coût — en chinois, japonais et coréen les règles seules atteignent 24 à 26 %, le modèle
  66 à 88 %.
- **Un numéro de carte que nous ratons est un numéro qu'aucune banque n'émettrait.** 89 % des
  numéros de carte de Nemotron et 52 % de ceux de Gretel échouent au Luhn — tirés au hasard par
  un générateur. Séparez l'or là-dessus : **toute valeur dont la clé se vérifie est trouvée**,
  100 % sur les deux corpus. Le moteur refuse les autres volontairement ; accepter n'importe
  quels seize chiffres, c'est ainsi qu'un outil de masquage se met à manger des numéros de
  commande.
- **Un corpus qui sous-annote punit le rappel ET la précision.** Gretel laisse sans étiquette
  les numéros de compte de ses documents MT940/SWIFT/XBRL : sur ces 320 documents, tous les
  moteurs marquent des nombres que personne n'a annotés, et la précision s'effondre — 0,24
  pour PII-Tracer, 0,43 pour nous. C'est une propriété du corpus, pas des détecteurs.
- **Le crédit partiel flatte tout le monde, et nous en premier.** Le F1 récompense une valeur
  trouvée à moitié ; un produit de masquage doit trouver *chaque* mention. Ce chiffre-là,
  plus sévère, est sur la page du banc à côté de celui-ci, et il est plus bas pour les six
  colonnes.
- **Presidio est ici un `pip install` par défaut** — Presidio *et* spaCy `en_core_web_lg`,
  lancé en `language="en"` sur les quatorze langues, c'est-à-dire ce qu'un utilisateur obtient
  sans rien régler, pas le plafond de Presidio. Ses 41 % sur nos cas **anglais** disent que
  l'écart tient aux vraies mises en page, pas à la langue.

**Quels que soient les chiffres, la détection n'est pas une garantie.** Le Coffre — les termes
que vous marquez vous-même — est la seule promesse de couverture que le produit fait sur une
chaîne donnée.

**Le détail vit avec le code qu'il mesure**, dans
**[`packages/redact/bench`](packages/redact/bench)** : ce que contient chaque corpus et d'où il
vient, les tableaux par catégorie et par langue, le temps de réponse par document, le score de
constance, où ce banc retrouve un chiffre publié et où il ne le retrouve pas — et pourquoi.

```bash
git clone https://github.com/openmasq/openmasq && cd openmasq && pnpm install
pnpm bench:spans   --replay --markdown            # la page au niveau du caractère, depuis les résultats commités
pnpm bench:compare --engines patterns,presidio    # ~1 min, sans modèle : les règles contre les détections commitées de Presidio
pnpm build && pnpm bench:compare                  # ajoute la colonne du produit (cuit la NER locale, épinglée sha256)
```

La colonne Presidio est un artefact commité : les deux bancs se rejouent sans Python.

## Liens

| | |
|---|---|
| **Centre d'aide** | [help.openmasq.com](https://help.openmasq.com) — le fonctionnement de chaque écran, en français et en anglais |
| **Site** | [openmasq.com](https://openmasq.com) — la landing : ce qu'est le produit, pour qui, et comment l'obtenir |
| **Contact** | [support@openmasq.com](mailto:support@openmasq.com) — les questions, et l'adresse où arrivent les avis envoyés depuis l'app |
| **Sécurité** | [`SECURITY.md`](SECURITY.md) — la frontière de confiance, les résiduels, et comment signaler une faille |
| **Ce que fait l'app, écran par écran** | [`FEATURES.md`](FEATURES.md) |
| **Contribuer** | [`CONTRIBUTING.md`](CONTRIBUTING.md) · [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) |
| **Héberger sa propre pile** | [`SELF_HOSTING.md`](SELF_HOSTING.md) |

## L'arborescence

```
apps/
  desktop/       L'application Electron — le produit. main (IPC, base, MCP, streaming) ·
                 preload (contextBridge → window.openmasq) · renderer · e2e
  mcp-broker/    Courtier MCP + serveur OAuth — un annexe LOCAL que le desktop lance
                 (ce n'est PAS le backend : le côté serveur vit dans un autre dépôt)
packages/
  redact/        Le moteur de masquage (pur, couvert par ses tests)
  ui/            Toute l'interface React + le store + le design system (clair + sombre)
  llm/           Les clients de fournisseurs, le registre de modèles, le SSE, les outils
  mcp/           Client MCP masquant · connectors/ outils MCP à OAuth sur l'appareil
  catalog/       Les listes gouvernables à une seule maison (modèles, connecteurs, catégories)
  i18n/          Le catalogue de messages typé (français source + anglais)
  credits/ schema/ sync/ branding/ analytics/
  tesseract2/    OCR durci et vendorisé (worker_threads + WASM) · ort/ · vendor/xlsx/
```

**Sens des dépendances :** `ui` → `llm`/`redact`/`mcp`/`catalog`/`schema`/`analytics` ;
`mcp` → `redact` ; `sync` → `schema` ; `desktop` compose le tout et fournit le `Host`.
**Une app n'importe jamais une autre app** — tenu par `pnpm check:dup`.

## Démarrer

**Prérequis** — Node.js ≥ 20 (la CI tourne en 26) et pnpm (`corepack enable` le fournit).

```bash
pnpm install
pnpm dev          # construit les paquets, puis lance l'application Electron
```

> **Vous travaillez sur le masquage ?** Les modèles NER et OCR embarqués ne font partie ni
> de `dev` ni de `build` — lancez `pnpm --filter @openmasq/desktop bake` une fois pour les
> récupérer. Sans eux l'app tourne, mais la détection retombe **sans le dire** sur les
> règles à motifs : vous testeriez le plancher des expressions régulières, pas le modèle.
> Voir [`CONTRIBUTING.md`](CONTRIBUTING.md).

Ouvrez ensuite **⚙ Réglages** et collez une clé de fournisseur (OpenAI, Anthropic, Google,
Mistral, DeepSeek, Scaleway, OpenRouter, ou n'importe quel point d'accès compatible OpenAI —
Ollama, LM Studio, vLLM), ou pointez l'app sur un modèle local. Votre abonnement Claude Code,
Codex ou Antigravity CLI fonctionne aussi.

**Ce build n'a pas de backend.** Ni facturation, ni synchronisation, ni organisations, ni
modèles inclus : ces services n'en font pas partie — ils vivent dans un dépôt privé,
derrière la porte `OPENMASQ_BILLING` — et l'app tourne sur votre machine : vos clés, un
modèle local, ou un abonnement CLI. Le masquage s'exécute sur l'appareil.

**Pourquoi le code parle-t-il alors d'abonnements ?** Vous trouverez un catalogue de paliers
(`packages/credits/src/tiers.ts`), un onglet Paiement et son vocabulaire dans les catalogues
de traduction. Ils ne servent qu'à un cas : quelqu'un qui déploie la pile privée et choisit
de la facturer. L'OpenMasq que publie la marque est construit **sans** cette porte — les
binaires de la page des versions ne vendent rien, n'affichent aucune offre, ne comptent aucun
crédit, et le mot « abonnement » n'y apparaît que pour votre propre CLI Claude Code, Codex ou
Antigravity. Les notes de version antérieures au passage en open source (septembre 2026)
décrivent l'ancienne offre hébergée ; elles sont gardées comme historique, pas comme promesse.

**Cinq petits services restent hébergés par la marque, et un build issu de ces sources les
atteint par défaut** (`apps/desktop/scripts/publicServices.ts`) : la connexion (un projet
Supabase — lien magique ou Google ; le compte ne fait que vous identifier, rien ne se cache
derrière), le relais Slack (l'échange code→jeton que Slack interdit sur l'appareil), le
relais analytics (des compteurs pseudonymes — ACTIFS par défaut, liés à un identifiant
d'installation stable, désactivables dans les Réglages, et jamais envoyés si Do Not Track ou
GPC est posé — plus les notes
de version que l'app affiche, plus la lecture des drapeaux de fonctionnalité — celle-ci est
une requête de configuration, pas une mesure : elle s'exécute hors consentement et porte
l'identifiant d'installation et, si vous êtes connecté, votre jeton de compte ;
`packages/analytics/src/flags.ts` l'énonce en entier), les rapports de plantage (Sentry — une liste d'autorisation
de quelques champs machine, jamais une clé ni une valeur du coffre ; le message d'exception
et les noms de frames ne peuvent pas être autorisés champ par champ, ils sont donc épurés
puis tronqués — une atténuation, pas une garantie, et `apps/desktop/src/sentry/policy.ts`
énonce le résidu qu'il accepte) et le flux de mises à jour (là où un build empaqueté cherche
les nouvelles versions, en portant un identifiant par installation pour qu'un déploiement
progressif puisse être retenu). Leur code n'est pas dans ce dépôt. Chacun tient en une
variable, et une variable posée **vide** au build (`OPENMASQ_SENTRY_DSN=`,
`VITE_UPDATES_URL=`) le débranche — un fork qui publie sous sa propre identité devrait vider
le flux, pour ne jamais se mettre à jour avec le binaire signé de la marque
(`SELF_HOSTING.md`). `pnpm dev` les applique aussi — sauf les rapports d'erreur : seul un
binaire construit et signé par la CI signale ses plantages ; une app non empaquetée, ou un
paquet construit hors CI, ne signale aucune erreur, seulement son usage à l'analytics
(estampillé `env:"local"`), puisque son code peut différer de toute version publiée.

Faire tourner une pile locale est un choix explicite : les surcharges vont dans un
`apps/desktop/.env.development.local` ignoré par git, et le `.env.development` versionné dit
lesquelles y mettre.

## Y travailler

```bash
pnpm test              # tests unitaires — gratuits, à lancer sans cesse
pnpm test:changed      # seulement ce que le graphe de changement touche
pnpm test:redact       # le moteur de masquage seul (~4 s)
pnpm typecheck
pnpm build
pnpm verify            # toute la série de contrôles, en local
```

Les suites e2e ne font **pas** partie de cette boucle : elles pilotent l'app construite
contre de vraies API de fournisseurs et coûtent de l'argent. Chaque spec se saute d'elle-même
sans sa clé — `pnpm --filter @openmasq/desktop e2e:openai`
(`apps/desktop/e2e/README.md`).

Certaines conventions sont tenues plutôt que demandées, chacune par son propre contrôle :
un plafond de 300 lignes par fichier source (`check:loc`), une documentation qui ne cite que
des chemins existants (`check:docs`), aucun fait ni comportement écrit deux fois
(`check:dup`), `FEATURES.md` tenu au pas du produit (`check:features`), et chaque GitHub
Action épinglée à un SHA de commit (`check:actions`). Elles tournent en CI ; `pnpm verify`
les lance en local.

Le `CLAUDE.md` à la racine est la carte — les invariants, les pièges, et où vit chaque
chose. Chaque app et chaque paquet a aussi son `CLAUDE.md` imbriqué, que les mainteneurs
utilisent comme carnet de bord ; ceux-là restent hors de l'arbre publié (`.gitignore`) — ici,
le contrat, c'est le code et ses tests, pas les notes. Lisez celui de la racine avant une
première modification.

## Sécurité

Le modèle de menace, les garanties et — avec la même longueur — les **limites connues** sont
dans [`SECURITY.md`](SECURITY.md). Il est écrit pour être vérifié contre ces sources, pas
pour être cru sur parole : masquer c'est détecter, et détecter est imparfait ; l'injection de
prompt est bornée, pas résolue ; le chiffrement au repos n'est pas garanti sur toutes les
installations ; et la prison Python n'est pas aussi solide sur toutes les plateformes. Tout
cela y est dit.

**Signalez une faille en privé** par le parcours *Security → Report a vulnerability* de ce
dépôt. N'ouvrez pas d'issue, de discussion ni de pull request publique contenant les détails
d'un exploit.

## Licence

[Licence Apache 2.0](LICENSE) — pour tout le dépôt : l'application de bureau, les paquets (le
moteur de masquage compris), le courtier MCP local et l'outillage. Vous pouvez l'utiliser, le
modifier, le redistribuer et bâtir dessus, y compris commercialement, à condition de
conserver les mentions ([`NOTICE`](NOTICE)) et d'indiquer vos modifications ; la licence
porte aussi une concession de brevet expresse de chaque contributeur.

Les contributions sont acceptées sous la même licence, par la section 5 de la licence
elle-même — il n'y a aucun accord séparé à signer.

Le code tiers inclus ici garde sa propre licence : `packages/tesseract2` (dérivé de
tesseract.js) et `vendor/xlsx` (SheetJS), tous deux en Apache-2.0. Les ressources
téléchargées au build et embarquées dans l'app sont listées dans [`NOTICE`](NOTICE).
