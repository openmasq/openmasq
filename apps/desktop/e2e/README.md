# Real end-to-end tests (the BUILT app, real provider APIs)

<sub>**English** · [Français](#les-tests-de-bout-en-bout-réels-lapplication-construite-de-vraies-api-de-fournisseurs)</sub>

These launch the **built Electron app** on an isolated profile and assert the privacy
contract on the payload that actually leaves the machine. They hit a real network and a
real model, so they are **not** part of `pnpm test` — run them deliberately.

⚠️ The scripts go through `node ../../node_modules/@playwright/test/cli.js` — the hoisted
`.bin/playwright` is a standalone `playwright` of ANOTHER version that collects no test at
all ("did not expect test.describe()").

## What is compared, and where it is captured

The wire is captured in the MAIN process, at the exact boundary `streamChat()` POSTs from
(`src/main/ipc/e2eWireLog.ts`, armed by `OPENMASQ_E2E_WIRE_LOG` and inert without it). Not
the rendered page, not an intermediate state: what the provider receives.

| The prompt carries   | The app shows you    | What leaves for the provider |
| -------------------- | -------------------- | ---------------------------- |
| nothing sensitive    | the prompt           | **identical**                |
| names / e-mails      | the **real** values  | a **fake** or a placeholder  |
| numbers (number mode)| the **real** figures | `n1`, `n2`… tokens           |

## Running one

Each spec **skips itself** when its provider key is absent (`test.skip` at the top of the
file, keys read from the root `.env`) — there is no shared env gate, and nothing to log in to.

```bash
pnpm --filter @openmasq/desktop e2e:boot        # the app starts, nothing else
pnpm --filter @openmasq/desktop e2e:openai      # OPENAI_API_KEY — document round-trip
pnpm --filter @openmasq/desktop e2e:workflows   # OPENROUTER_API_KEY — agentic workflows
pnpm --filter @openmasq/desktop e2e:documents   # OPENROUTER_API_KEY — generate + edit
pnpm --filter @openmasq/desktop e2e:documents-multi  # no key at all (see below)
```

The full list of entry points is `apps/desktop/package.json` (`e2e:*`). ⚠️ The root
`pnpm test:e2e` and `pnpm e2e:login` point at desktop scripts that no longer exist — the
keyless web-session path they served was removed from the product.

## The document round-trip (`e2e:openai`)

`openai-redaction.e2e.ts` attaches a CSV full of personal data, asks for a consolidated CSV
back, and asserts the whole contract: the payload that leaves for `api.openai.com` carries
only placeholders, and the returned document is de-redacted in the copy the user sees — the
real e-mails restored, no token left behind. It runs on the deterministic `patterns` engine
so "nothing leaked" never depends on a model's recall.

## How it works

- Two inert production hooks (no effect without the env vars): `OPENMASQ_USER_DATA_DIR`
  points Electron at the test profile, `OPENMASQ_DISABLE_DB` skips the local DB so the
  renderer store is localStorage-only and a test can seed settings deterministically.
- `helpers.ts` exports `launchApp` (isolated profile, DB disabled), `PROFILE_DIR` and
  `userDataPath`, and re-exports the gestures from `pageActions.ts`. Settings are seeded
  per test through `localStorage`.
- The e-mail and number cases work fully offline through the deterministic rules;
  **names and companies** need a reachable redaction model.

> `e2e/journey/` is NOT a test suite — it is the driver a human or an agent steers by hand.
> Its own `CLAUDE.md` documents it.

## Multiple documents — local redaction, JUDGED (`pnpm e2e:documents-multi`)

`documents-multi.e2e.ts` attaches **four formats in a single send** (CSV, XLSX, PDF, DOCX —
four distinct extractors) and judges the redaction **with no chat model at all**: everything
that produces the result is already on the machine (mBERT for names, docTR/Tesseract for
pixels, the deterministic rules for the rest). No API key, no outgoing call, zero cost — the
recipient is a dummy OpenAI-compatible endpoint raised on 127.0.0.1, which makes it possible
to judge the **real wire** rather than an intermediate state.

- The oracle is the **app's own decision function** (`pseudonymize` on the extracted text),
  not a list rewritten alongside: so this test does NOT measure the detector's recall (that
  is the engine's unit tests' job), it checks that this decision **arrives intact** on the
  wire, across four extractors and the multi-document folding. A divergence here is a
  PIPELINE defect.
- Judging is done **per document section**: the engine mints believable fakes, so a fake
  minted for the NDA can equal a REAL value from the CSV — searched across the whole wire the
  string is ambiguous, searched inside the section it came from it is not.
- Prerequisite: `pnpm bake:ner` (outside a packaged app the weights are read from
  `apps/desktop/build/ner-models`); without them the spec **skips** instead of passing empty.

⚠️ **This spec is RED today, and that is its job**: it reports a real divergence —
`billing@example.com` (the sender header of `invoice-2024-0042.pdf`) is replaced by
`pseudonymize` on the extracted text, but reaches the wire in the clear, while everything
else in the same section (IBAN, card, VAT, names, other e-mails) is correctly redacted. Two
leads to investigate: the text the app extracts differs from what the extractor obtains in
Node, or the drop's replacement map is reused as-is and what it missed leaves in the clear
(the documented `reusableDocReplacements` trap).

## Agentic workflows — real OpenRouter (`pnpm e2e:workflows`)

`workflows-openrouter.e2e.ts` replays the **17 most likely user requests** — the catalogue is
`workflows/catalog.ts`, one prompt per case, each commented with what it checks rather than
what it narrates. Three families: reads (mailbox, search, calendar, day, meeting, Drive, CRM,
payments, sprint), writes (send, event, draft, CRM note, task) and **tool-free prompts**
(write a follow-up, file a pasted contact) — the last of which check that a model does NOT go
rummaging through the connectors when it is only asked to write, and that PII **typed by the
user** does not leave the machine in the clear. All of it against the **real OpenRouter API**
(the `OPENROUTER_API_KEY` key in the root `.env`; a **free** model by default → zero cost).

- `E2E_MODEL` — the model id (default `google/gemma-4-26b-a4b-it:free`).
  ⚠️ The OpenRouter Gemmas are `noTools`: the default checks the **fallback without
  connectors** (the reality on that model). To exercise tool calls:
  `E2E_MODEL="openai/gpt-oss-20b:free"`.
- `E2E_TOOL_FIXTURES=0` — the mode **without** fixtures (no connector — the reality of an
  account that has connected nothing). By default, FIXTURE connectors
  (`fixtures/mcp/workflows.json`, main hook `OPENMASQ_E2E_MCP_FIXTURES`) serve stable results
  stuffed with test PII.
- `E2E_PARALLEL=1` (+ `E2E_WORKERS=n`) — one isolated app/profile per test, in parallel.
  `E2E_STRICT=1` — soft assertions on the CONTENT of the replies.

Always checked, whatever the mode: no PII (fixture or typed) on the wire
(`OPENMASQ_E2E_WIRE_LOG` covers the tool turns too); a write reaches the connector only after
a confirmation click; and the outgoing argument arrives **in the clear** at the connector
(`OPENMASQ_E2E_TOOLCALL_LOG`).

⚠️ **The confirmation SURFACE is itself an assertion.** The catalogue's `write` field is
`"system"` (the non-spoofable main window — send, event) or `"chat"` (a card in the
conversation — draft, note, task: local and reversible), and the harness counts both
separately. The assertion is **deliberately asymmetric**: a risky write MUST have been
confirmed on the main window (otherwise a renderer XSS could click it), whereas a local
gesture that would open a system window is merely a nuisance — soft. The classification comes
from `@openmasq/catalog/mcp` `writeRisk`; this test is what stops a send from sliding onto
the clickable surface.

---

# Les tests de bout en bout réels (l'application CONSTRUITE, de vraies API de fournisseurs)

Ils lancent l'**application Electron construite** sur un profil isolé et vérifient le contrat
de confidentialité sur la charge utile qui quitte réellement la machine. Ils touchent un vrai
réseau et un vrai modèle : ils ne font donc **pas** partie de `pnpm test` — lancez-les
délibérément.

⚠️ Les scripts passent par `node ../../node_modules/@playwright/test/cli.js` — le
`.bin/playwright` hissé est un `playwright` autonome d'une AUTRE version qui ne collecte
aucun test (« did not expect test.describe() »).

## Ce qui est comparé, et où c'est capturé

Le trafic est capturé dans le processus PRINCIPAL, exactement à la frontière d'où
`streamChat()` fait son POST (`src/main/ipc/e2eWireLog.ts`, armé par `OPENMASQ_E2E_WIRE_LOG`
et inerte sans lui). Ni la page rendue, ni un état intermédiaire : ce que le fournisseur
reçoit. Le tableau des trois cas est **celui ci-dessus**.

## En lancer un

Chaque spec **se saute elle-même** quand la clé de son fournisseur est absente (`test.skip` en
tête de fichier, les clés étant lues dans le `.env` de la racine) — il n'y a pas de porte
d'environnement commune, et rien où se connecter. Les points d'entrée sont listés plus haut ;
la liste complète est dans `apps/desktop/package.json` (`e2e:*`). ⚠️ Les `pnpm test:e2e` et
`pnpm e2e:login` de la racine pointent vers des scripts de bureau qui n'existent plus — le
chemin de session web sans clé qu'ils servaient a été retiré du produit.

## L'aller-retour d'un document (`e2e:openai`)

`openai-redaction.e2e.ts` joint un CSV plein de données personnelles, demande un CSV
consolidé en retour, et vérifie tout le contrat : la charge utile qui part vers
`api.openai.com` ne porte que des espaces réservés, et le document renvoyé est démasqué dans
la copie que l'utilisateur voit — les vrais e-mails restaurés, aucun jeton laissé derrière. Il
tourne sur le moteur déterministe `patterns`, pour que « rien n'a fui » ne dépende jamais du
rappel d'un modèle.

## Comment ça marche

- Deux crochets de production inertes (sans effet sans leurs variables) :
  `OPENMASQ_USER_DATA_DIR` pointe Electron vers le profil de test, `OPENMASQ_DISABLE_DB` saute
  la base locale pour que le store du renderer soit en localStorage seul et qu'un test puisse
  semer des réglages de façon déterministe.
- `helpers.ts` exporte `launchApp` (profil isolé, base désactivée), `PROFILE_DIR` et
  `userDataPath`, et ré-exporte les gestes de `pageActions.ts`. Les réglages sont semés par
  test via `localStorage`.
- Les cas de l'e-mail et des nombres fonctionnent entièrement hors ligne par les règles
  déterministes ; **les noms et les entreprises** exigent un modèle de masquage joignable.

> `e2e/journey/` n'est PAS une suite de tests — c'est le pilote qu'un humain ou un agent
> conduit à la main. Son propre `CLAUDE.md` le documente.

## Plusieurs documents — masquage local, JUGÉ (`pnpm e2e:documents-multi`)

`documents-multi.e2e.ts` joint **quatre formats dans un seul envoi** (CSV, XLSX, PDF, DOCX —
quatre extracteurs distincts) et juge le masquage **sans aucun modèle de chat** : tout ce qui
produit le résultat est déjà sur la machine (mBERT pour les noms, docTR/Tesseract pour les
pixels, les règles déterministes pour le reste). Aucune clé d'API, aucun appel sortant, coût
nul — le destinataire est un point d'accès compatible OpenAI factice levé sur 127.0.0.1, ce
qui permet de juger le **vrai trafic** plutôt qu'un état intermédiaire.

- L'oracle est **la fonction de décision de l'application elle-même** (`pseudonymize` sur le
  texte extrait), pas une liste réécrite à côté : ce test ne mesure donc PAS le rappel du
  détecteur (c'est le travail des tests unitaires du moteur), il vérifie que cette décision
  **arrive intacte** sur le fil, à travers quatre extracteurs et le pliage multi-documents. Une
  divergence ici est un défaut de PIPELINE.
- Le jugement se fait **section de document par section de document** : le moteur frappe des
  faux crédibles, si bien qu'un faux frappé pour le NDA peut égaler une VRAIE valeur du CSV —
  cherchée dans tout le fil la chaîne est ambiguë, cherchée dans la section dont elle vient
  elle ne l'est pas.
- Prérequis : `pnpm bake:ner` (hors application packagée, les poids sont lus dans
  `apps/desktop/build/ner-models`) ; sans eux la spec **se saute** au lieu de passer à vide.

⚠️ **Cette spec est ROUGE aujourd'hui, et c'est son travail** : elle rapporte une divergence
réelle — `billing@example.com` (l'en-tête d'expéditeur d'`invoice-2024-0042.pdf`) est remplacé
par `pseudonymize` sur le texte extrait, mais atteint le fil en clair, alors que tout le reste
de la même section (IBAN, carte, TVA, noms, autres e-mails) est correctement masqué. Deux
pistes à instruire : le texte que l'application extrait diffère de ce que l'extracteur obtient
sous Node, ou la table de remplacement du dépôt est réutilisée telle quelle et ce qu'elle a
raté part en clair (le piège documenté `reusableDocReplacements`).

## Parcours agentiques — OpenRouter réel (`pnpm e2e:workflows`)

`workflows-openrouter.e2e.ts` rejoue les **17 demandes d'utilisateur les plus probables** — le
catalogue est `workflows/catalog.ts`, un prompt par cas, chacun commenté par ce qu'il vérifie
plutôt que par ce qu'il raconte. Trois familles : les lectures (boîte mail, recherche,
agenda, journée, réunion, Drive, CRM, paiements, sprint), les écritures (envoi, événement,
brouillon, note CRM, tâche) et les **prompts sans outil** (rédiger une relance, classer un
contact collé) — ces derniers vérifiant qu'un modèle ne va PAS fouiller dans les connecteurs
quand on ne lui demande que d'écrire, et que les données personnelles **tapées par
l'utilisateur** ne quittent pas la machine en clair. Le tout contre la **vraie API
OpenRouter** (la clé `OPENROUTER_API_KEY` du `.env` de la racine ; un modèle **gratuit** par
défaut → coût nul).

- `E2E_MODEL` — l'id du modèle (par défaut `google/gemma-4-26b-a4b-it:free`).
  ⚠️ Les Gemma d'OpenRouter sont `noTools` : le défaut vérifie donc le **repli sans
  connecteurs** (la réalité sur ce modèle). Pour exercer les appels d'outils :
  `E2E_MODEL="openai/gpt-oss-20b:free"`.
- `E2E_TOOL_FIXTURES=0` — le mode **sans** fixtures (aucun connecteur — la réalité d'un compte
  qui n'a rien connecté). Par défaut, des connecteurs de FIXTURE
  (`fixtures/mcp/workflows.json`, crochet principal `OPENMASQ_E2E_MCP_FIXTURES`) servent des
  résultats stables bourrés de données personnelles de test.
- `E2E_PARALLEL=1` (+ `E2E_WORKERS=n`) — une application et un profil isolés par test, en
  parallèle. `E2E_STRICT=1` — des assertions souples sur le CONTENU des réponses.

Toujours vérifié, quel que soit le mode : aucune donnée personnelle (de fixture ou tapée) sur
le fil (`OPENMASQ_E2E_WIRE_LOG` couvre aussi les tours d'outils) ; une écriture n'atteint le
connecteur qu'après un clic de confirmation ; et l'argument sortant arrive **en clair** chez le
connecteur (`OPENMASQ_E2E_TOOLCALL_LOG`).

⚠️ **La SURFACE de confirmation est elle-même une assertion.** Le champ `write` du catalogue
vaut `"system"` (la fenêtre principale non usurpable — envoi, événement) ou `"chat"` (une
carte dans la conversation — brouillon, note, tâche : local et réversible), et le harnais
compte les deux séparément. L'assertion est **délibérément asymétrique** : une écriture
risquée DOIT avoir été confirmée sur la fenêtre principale (sinon un XSS du renderer pourrait
la cliquer), tandis qu'un geste local qui ouvrirait une fenêtre système n'est qu'une gêne —
souple. La classification vient du `writeRisk` de `@openmasq/catalog/mcp` ; ce test est ce qui
empêche un envoi de glisser vers la surface cliquable.
