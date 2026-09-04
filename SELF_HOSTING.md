# Running OpenMasq without the brand's services

<sub>**English** · [Français](#faire-tourner-openmasq-sans-les-services-de-la-marque) · [openmasq.com](https://openmasq.com)</sub>

The desktop app is designed to run **entirely on your machine**. Every remote address it
knows is supplied at *build* time through an environment variable, and **an unset variable
means the capability does not exist** — never a silent fallback to something local, and
never a broken screen. A tab that has no service behind it is not shown empty; it is
absent.

This document is the runbook for three situations: building with none of those services,
pointing them at your own, and understanding what each absence costs.

---

## 1. The default: what a build from these sources reaches

A build fills six variables (five services) it was not given, from
`apps/desktop/scripts/publicServices.ts`:

| Variable | Service | Why it is public |
|---|---|---|
| `OPENMASQ_SUPABASE_URL` | Sign-in (magic link / Google) | URL + *publishable* key are client credentials, designed to ship in every client |
| `OPENMASQ_SUPABASE_PUBLISHABLE_KEY` | idem | idem |
| `OPENMASQ_AUTH_URL` | Slack token relay | Slack forbids the code→token exchange on-device |
| `VITE_ANALYTICS_RELAY_URL` | Anonymous counters, release notes, `hide-*` flags | Behind an explicit consent |
| `OPENMASQ_SENTRY_DSN` | Crash reports | A DSN only lets a client *send* to one project |
| `VITE_UPDATES_URL` | The feed a packaged build checks for new versions | Public URL; the artifacts it serves are signed |

**`pnpm dev` applies them too** — a developer's instance runs against the same public
services as an installed app, stamped `env:"development"`. A local stack is an explicit
choice, made in a gitignored `.env.development.local` (`apps/desktop/.env.development`
says how).

> If you fork this project, you probably do **not** want your users' crash reports and
> analytics arriving in someone else's account. Set your own values, or opt out (§3).

---

## 2. Building with no remote service at all

Every variable is optional. Leave them unset and the app is a local-only client:

```bash
pnpm install
pnpm --filter @openmasq/desktop bake     # on-device models — see below
OPENMASQ_AUTH_URL= \
VITE_ANALYTICS_RELAY_URL= \
OPENMASQ_SENTRY_DSN= \
OPENMASQ_SUPABASE_URL= \
OPENMASQ_SUPABASE_PUBLISHABLE_KEY= \
VITE_UPDATES_URL= \
pnpm --filter @openmasq/desktop build
```

An **empty** value is how you opt out: only `undefined` receives a default. Setting a
variable to `""` is a decision the build honours.

What you get: the chat, on-device redaction, documents, MCP connectors on your own OAuth
credentials, the Python sandbox, the agent browser, skills and memory — with your own
provider API keys, a local model (Ollama, LM Studio, vLLM, any OpenAI-compatible
endpoint), or a Claude Code / Codex CLI subscription.

What you lose, each stated where it is decided:

| Unset | Consequence |
|---|---|
| Supabase pair | No accounts, and **no sign-in gate** — the app opens straight into the workspace |
| `OPENMASQ_AUTH_URL` | The Slack connector reads "not configured". GitHub (device flow) and Google (loopback + PKCE) are unaffected: they run on-device |
| `VITE_ANALYTICS_RELAY_URL` | No telemetry; Settings → Versions shows no release notes |
| `OPENMASQ_SENTRY_DSN` | No crash reports |
| `VITE_UPDATES_URL` | No auto-update, and no probing — the app says so rather than asking a stranger's feed. The default is the brand's feed (`https://updates.<domain>`, `publicServices.ts`): a fork sets its own or empties it, so it never updates itself with someone else's signed binary |

### The billing-gated addresses

`OPENMASQ_BACKEND_URL`, `OPENMASQ_GATEWAY_URL` and their `_STAGING` twins — four
variables (`BILLING_GATED_SERVICES`) — are behind a second gate,
`OPENMASQ_BILLING=1` (`apps/desktop/scripts/buildDefines.ts`). **Without it they are baked
empty whatever the build received**, and with them go accounts sync, organizations,
feedback, included models, server-side redaction — and therefore anything sold. That is the
configuration this repository ships.

---

## 3. Pointing the app at your own services

Set the variables at build time. They are *addresses*, never chosen at runtime: a URL
living in a file the user can edit — or that a compromised renderer could write — would be
arbitrary egress from a signed, notarized binary that holds the keychain. The environment
is selected by an enum name, never by a URL (`apps/desktop/src/environments/index.ts`).

```bash
OPENMASQ_SUPABASE_URL=https://<your-project>.supabase.co \
OPENMASQ_SUPABASE_PUBLISHABLE_KEY=<your publishable key> \
OPENMASQ_AUTH_URL=https://auth.example.com \
VITE_ANALYTICS_RELAY_URL=https://analytics.example.com/e \
OPENMASQ_SENTRY_DSN=<your dsn> \
pnpm --filter @openmasq/desktop build
```

Sign-in additionally needs your Supabase project to allow-list the app's deep link,
`<scheme>://auth/callback` (the scheme comes from `packages/branding/branding.json`).

**Connector OAuth** clients are separate and equally optional —
`OPENMASQ_GITHUB_CLIENT_ID`, `OPENMASQ_GOOGLE_CLIENT_ID` / `_SECRET`,
`OPENMASQ_MICROSOFT_CLIENT_ID`, `OPENMASQ_SLACK_CLIENT_ID`. Unset, the matching connector
offers the "bring your own credentials" path instead of the one-click one. Note that
Google's `gmail.readonly` and `drive.readonly` are *restricted* scopes: a one-click flow of
your own needs Google verification and a CASA assessment. Your own client, in testing mode,
needs neither.

---

## 4. On-device models (`pnpm bake`)

`bake` is **not** part of `dev` or `build`. Without it the app runs, but local NER and OCR
are unavailable and **redaction falls back to the deterministic pattern rules** — with no
warning. Anyone working on detection should run it first.

```bash
pnpm --filter @openmasq/desktop bake
```

Every asset is pinned by sha256 (or an immutable commit) and verified at bake time *and*
again before the runtime parses it. A **hash mismatch always fails** — that is the
integrity claim. A **missing source** skips with a warning, except the NER weights, which
fail the bake rather than let a build ship an empty model and silently degrade.

Two assets are first-party exports rather than vendor downloads (docTR, the e5 embedder);
`NOTICE` says which, and `OPENMASQ_DOCTR_SRC` / `OPENMASQ_E5_SRC` point the bake at your
own copy. Without them, OCR falls back to Tesseract and the memory's semantic clustering
falls back to the category graph.

---

## 5. Verifying you got what you expect

```bash
pnpm verify     # the gate suite CI runs
pnpm test       # unit tests, free
```

In the app, **Settings → Versions** reports which services the build actually reached.
Absent ones are named as absent — that is the intended, legible outcome, not an error.
---

## 6. Packaging locally (an installable app, not a `pnpm dev`)

`build` produces `apps/desktop/out/` — what `pnpm dev` runs. An **installable** app is one
more step, `electron-builder` through the repo's wrapper (never `npx electron-builder`:
`apps/desktop/scripts/eb.mjs` says why). Bake first, or the packager stops on a missing
`build/python-runtime`:

```bash
pnpm --filter @openmasq/desktop bake     # this platform's runtimes + models (see §4)
pnpm build                               # every package's dist/, then the app bundle
cd apps/desktop
CSC_IDENTITY_AUTO_DISCOVERY=false pnpm run eb --mac --arm64 --dir   # unsigned .app, macOS
pnpm run eb --win --dir                                              # unpacked, Windows host
```

Output lands in `apps/desktop/release/<platform>-<arch>/` (gitignored). Then check what you
got: `pnpm check:pkgtree --require-tree` from the repo root walks the packaged
`node_modules` — the one place a dependency dropped by the packager shows up.

What each platform needs, verified on 03/09/2026:

| Platform | Host | What the local package lacks vs the CI one |
|---|---|---|
| macOS (arm64 + x64) | macOS. `--dir` skips notarization; a `dmg`/`zip` target runs it (`notarize: true`) and needs `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` — or `-c.mac.notarize=false`. With a Developer ID in your keychain, drop `CSC_IDENTITY_AUTO_DISCOVERY=false` and answer the keychain prompt: signing a ~1 GB app takes several minutes. | Nothing, if signed. **Unsigned**, macOS asks for keychain access on first launch (Chromium safe storage); refuse it and the app runs with **no at-rest encryption** and says so once. |
| Windows (x64) | A Windows machine: NSIS is bundled by electron-builder, but `bake:jail` compiles the Python sandbox launcher (Rust, `cargo` + the MSVC linker) and `bake:vcruntime` fetches the VC++ redistributable — both skip loudly on any other host, and a Windows bundle without the launcher **refuses to run Python** rather than run it unconfined. Unsigned installers work; the CI refuses to *publish* one. | Authenticode signature. |
| Linux | **Not a target.** `electron-builder.cjs` declares no `linux` block, the Linux native binaries are excluded from every bundle, and asar integrity has no Linux support. The source build (`pnpm dev`) runs there. | Everything: no package exists. |

Two assets never come from a public source, so a fresh clone packages **without** them and
the app degrades where §4 says: the docTR OCR export (`OPENMASQ_DOCTR_SRC`) and the e5
memory embedder (`OPENMASQ_E5_SRC`). The bake prints a warning for each; the package is still
valid. Everything else (CPython from python-build-standalone, the NER weights on a pinned
Hugging Face commit, tessdata_fast) downloads and verifies from the pins alone.

One more variable matters for a package you keep: a packaged app checks the brand's update
feed by default (`desktop-stable`, the `publish` block of `electron-builder.cjs`) and would
replace itself with the next signed release. Bake `VITE_UPDATES_URL=` (empty) for a local
package that must stay what you built — §2 says how an empty value is honoured.

`apps/desktop/scripts/release-local.sh` is **not** this: it mirrors the staging deployment
(signing, notarization, R2 upload, feed registration) and requires every CI secret.

---

# Faire tourner OpenMasq sans les services de la marque

L'application de bureau est conçue pour tourner **entièrement sur votre machine**. Chaque
adresse distante qu'elle connaît lui est fournie au moment du *build* par une variable
d'environnement, et **une variable non définie signifie que la capacité n'existe pas** —
jamais un repli silencieux vers quelque chose de local, jamais un écran cassé. Un onglet
sans service derrière lui n'est pas montré vide : il est absent.

Ce document est le mode d'emploi de trois situations : construire sans aucun de ces
services, les pointer vers les vôtres, et comprendre ce que coûte chaque absence.

---

## 1. Par défaut : ce qu'un build issu de ces sources contacte

Un build remplit six variables (cinq services) qu'on ne lui a pas données, depuis
`apps/desktop/scripts/publicServices.ts` :

| Variable | Service | Pourquoi elle est publique |
|---|---|---|
| `OPENMASQ_SUPABASE_URL` | Connexion (lien magique / Google) | L'URL et la clé *publiable* sont des identifiants client, faits pour être livrés dans chaque client |
| `OPENMASQ_SUPABASE_PUBLISHABLE_KEY` | idem | idem |
| `OPENMASQ_AUTH_URL` | Relais de jeton Slack | Slack interdit l'échange code→jeton sur l'appareil |
| `VITE_ANALYTICS_RELAY_URL` | Compteurs anonymes, notes de version, drapeaux `hide-*` | Derrière un consentement explicite |
| `OPENMASQ_SENTRY_DSN` | Rapports de plantage | Un DSN ne permet à un client que d'*envoyer* vers un projet |
| `VITE_UPDATES_URL` | Le flux qu'un build packagé interroge pour les nouvelles versions | URL publique ; les artefacts servis sont signés |

**`pnpm dev` les applique aussi** — l'instance d'un développeur tourne contre les mêmes
services publics qu'une application installée, estampillée `env:"development"`. Une pile
locale est un choix explicite, fait dans un `.env.development.local` gitignoré
(`apps/desktop/.env.development` dit comment).

> Si vous forkez ce projet, vous ne voulez probablement **pas** que les rapports de plantage
> et les statistiques de vos utilisateurs arrivent dans le compte de quelqu'un d'autre.
> Mettez vos propres valeurs, ou désengagez-vous (§3).

---

## 2. Construire sans aucun service distant

Chaque variable est optionnelle. Laissez-les non définies et l'application est un client
purement local :

```bash
pnpm install
pnpm --filter @openmasq/desktop bake     # modèles embarqués — voir plus bas
OPENMASQ_AUTH_URL= \
VITE_ANALYTICS_RELAY_URL= \
OPENMASQ_SENTRY_DSN= \
OPENMASQ_SUPABASE_URL= \
OPENMASQ_SUPABASE_PUBLISHABLE_KEY= \
VITE_UPDATES_URL= \
pnpm --filter @openmasq/desktop build
```

Une valeur **vide** est la façon de se désengager : seul `undefined` reçoit une valeur par
défaut. Mettre une variable à `""` est une décision que le build respecte.

Ce que vous avez : le chat, le masquage sur l'appareil, les documents, les connecteurs MCP
sur vos propres identifiants OAuth, le bac à sable Python, le navigateur agent, les
compétences et la mémoire — avec vos propres clés d'API de fournisseur, un modèle local
(Ollama, LM Studio, vLLM, n'importe quel point d'accès compatible OpenAI) ou un abonnement
Claude Code / Codex CLI.

Ce que vous perdez, chaque ligne indiquée là où elle se décide :

| Non définie | Conséquence |
|---|---|
| La paire Supabase | Pas de comptes, et **pas de porte de connexion** — l'application ouvre directement sur l'espace de travail |
| `OPENMASQ_AUTH_URL` | Le connecteur Slack affiche « non configuré ». GitHub (device flow) et Google (loopback + PKCE) ne sont pas affectés : ils tournent sur l'appareil |
| `VITE_ANALYTICS_RELAY_URL` | Pas de télémétrie ; Réglages → Versions n'affiche aucune note de version |
| `OPENMASQ_SENTRY_DSN` | Pas de rapports de plantage |
| `VITE_UPDATES_URL` | Pas de mise à jour automatique, et aucun sondage — l'application le dit plutôt que d'interroger le flux d'un inconnu. Le défaut est le flux de la marque (`https://updates.<domaine>`, `publicServices.ts`) : un fork met le sien ou le vide, pour ne jamais se mettre à jour avec le binaire signé de quelqu'un d'autre |

### Les adresses derrière la porte de facturation

`OPENMASQ_BACKEND_URL`, `OPENMASQ_GATEWAY_URL` et leurs jumelles `_STAGING` — quatre
variables (`BILLING_GATED_SERVICES`) — sont derrière une seconde porte, `OPENMASQ_BILLING=1`
(`apps/desktop/scripts/buildDefines.ts`). **Sans elle, elles sont cuites vides quoi qu'ait
reçu le build**, et avec elles partent la synchronisation des comptes, les organisations,
les retours, les modèles inclus, le masquage côté serveur — et donc tout ce qui se vend.
C'est la configuration que ce dépôt livre.

---

## 3. Pointer l'application vers vos propres services

Réglez les variables au moment du build. Ce sont des *adresses*, jamais choisies à
l'exécution : une URL vivant dans un fichier que l'utilisateur peut éditer — ou qu'un
renderer compromis pourrait écrire — serait une sortie réseau arbitraire depuis un binaire
signé et notarisé qui détient le trousseau. L'environnement est choisi par un nom d'énumération,
jamais par une URL (`apps/desktop/src/environments/index.ts`).

```bash
OPENMASQ_SUPABASE_URL=https://<votre-projet>.supabase.co \
OPENMASQ_SUPABASE_PUBLISHABLE_KEY=<votre clé publiable> \
OPENMASQ_AUTH_URL=https://auth.example.com \
VITE_ANALYTICS_RELAY_URL=https://analytics.example.com/e \
OPENMASQ_SENTRY_DSN=<votre dsn> \
pnpm --filter @openmasq/desktop build
```

La connexion demande en plus que votre projet Supabase autorise le lien profond de
l'application, `<schéma>://auth/callback` (le schéma vient de `packages/branding/branding.json`).

**Les clients OAuth des connecteurs** sont séparés et tout aussi optionnels —
`OPENMASQ_GITHUB_CLIENT_ID`, `OPENMASQ_GOOGLE_CLIENT_ID` / `_SECRET`,
`OPENMASQ_MICROSOFT_CLIENT_ID`, `OPENMASQ_SLACK_CLIENT_ID`. Non définis, le connecteur
correspondant propose le chemin « apportez vos identifiants » à la place du chemin en un
clic. Notez que les portées `gmail.readonly` et `drive.readonly` de Google sont *restreintes* :
un flux en un clic à vous demande une vérification Google et une évaluation CASA. Votre
propre client, en mode test, ne demande ni l'une ni l'autre.

---

## 4. Les modèles embarqués (`pnpm bake`)

`bake` ne fait **pas** partie de `dev` ni de `build`. Sans lui l'application tourne, mais la
NER et l'OCR locales sont indisponibles et **le masquage retombe sur les règles de motifs
déterministes** — sans aucun avertissement. Quiconque travaille sur la détection doit le
lancer d'abord.

```bash
pnpm --filter @openmasq/desktop bake
```

Chaque ressource est épinglée par sha256 (ou par un commit immuable) et vérifiée au moment du
bake *et* de nouveau avant que le runtime ne l'analyse. Une **empreinte qui ne correspond pas
échoue toujours** — c'est là l'affirmation d'intégrité. Une **source manquante** est ignorée
avec un avertissement, sauf les poids NER, qui font échouer le bake plutôt que de laisser un
build partir avec un modèle vide et se dégrader en silence.

Deux ressources sont des exports de première main plutôt que des téléchargements d'éditeur
(docTR, l'encodeur e5) ; `NOTICE` dit lesquelles, et `OPENMASQ_DOCTR_SRC` / `OPENMASQ_E5_SRC`
pointent le bake vers votre propre copie. Sans elles, l'OCR retombe sur Tesseract et le
regroupement sémantique de la mémoire retombe sur le graphe de catégories.

---

## 5. Vérifier que vous avez bien ce que vous croyez

```bash
pnpm verify     # la suite de portes que la CI exécute
pnpm test       # les tests unitaires, gratuits
```

Dans l'application, **Réglages → Versions** rapporte quels services le build a réellement
atteints. Les absents sont nommés comme absents — c'est le résultat lisible et voulu, pas une
erreur.

---

## 6. Empaqueter localement (une application installable, pas un `pnpm dev`)

`build` produit `apps/desktop/out/` — ce que `pnpm dev` lance. Une application
**installable** demande une étape de plus, `electron-builder` à travers l'enrobage du dépôt
(jamais `npx electron-builder` : `apps/desktop/scripts/eb.mjs` dit pourquoi). Bakez d'abord,
sinon l'empaqueteur s'arrête sur un `build/python-runtime` absent :

```bash
pnpm --filter @openmasq/desktop bake     # runtimes + modèles de cette plateforme (§4)
pnpm build                               # le dist/ de chaque paquet, puis le bundle de l'app
cd apps/desktop
CSC_IDENTITY_AUTO_DISCOVERY=false pnpm run eb --mac --arm64 --dir   # .app non signée, macOS
pnpm run eb --win --dir                                              # dépliée, hôte Windows
```

La sortie atterrit dans `apps/desktop/release/<plateforme>-<arch>/` (ignoré par git). Puis
vérifiez ce que vous avez obtenu : `pnpm check:pkgtree --require-tree` depuis la racine
parcourt le `node_modules` empaqueté — le seul endroit où une dépendance perdue par
l'empaqueteur se voit.

Ce que chaque plateforme exige, vérifié le 03/09/2026 :

| Plateforme | Hôte | Ce qui manque au paquet local face à celui de la CI |
|---|---|---|
| macOS (arm64 + x64) | macOS. `--dir` saute la notarisation ; une cible `dmg`/`zip` la lance (`notarize: true`) et demande `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` — ou `-c.mac.notarize=false`. Avec un Developer ID dans votre trousseau, retirez `CSC_IDENTITY_AUTO_DISCOVERY=false` et répondez à l'invite du trousseau : signer une app d'environ 1 Go prend plusieurs minutes. | Rien, si elle est signée. **Non signée**, macOS demande l'accès au trousseau au premier lancement (stockage sûr de Chromium) ; refusez et l'app tourne **sans chiffrement au repos** et le dit une fois. |
| Windows (x64) | Une machine Windows : NSIS est fourni par electron-builder, mais `bake:jail` compile le lanceur du bac à sable Python (Rust, `cargo` + l'éditeur de liens MSVC) et `bake:vcruntime` récupère le redistribuable VC++ — les deux passent bruyamment sur tout autre hôte, et un bundle Windows sans lanceur **refuse d'exécuter Python** plutôt que de le faire sans confinement. Un installeur non signé fonctionne ; la CI refuse d'en *publier* un. | La signature Authenticode. |
| Linux | **Pas une cible.** `electron-builder.cjs` ne déclare aucun bloc `linux`, les binaires natifs Linux sont exclus de chaque bundle, et l'intégrité asar n'existe pas sous Linux. Le build depuis les sources (`pnpm dev`) y tourne. | Tout : aucun paquet n'existe. |

Deux ressources ne viennent jamais d'une source publique, donc un clone frais s'empaquette
**sans** elles et l'app se dégrade là où le §4 le dit : l'export OCR docTR (`OPENMASQ_DOCTR_SRC`)
et l'encodeur de mémoire e5 (`OPENMASQ_E5_SRC`). Le bake imprime un avertissement pour
chacune ; le paquet reste valide. Tout le reste (CPython depuis python-build-standalone, les
poids NER sur un commit Hugging Face épinglé, tessdata_fast) se télécharge et se vérifie
depuis les seuls pins.

Une variable de plus compte pour un paquet que vous gardez : une application empaquetée
interroge par défaut le flux de mises à jour de la marque (`desktop-stable`, bloc `publish`
d'`electron-builder.cjs`) et se remplacerait par la prochaine version signée. Bakez
`VITE_UPDATES_URL=` (vide) pour un paquet local qui doit rester ce que vous avez construit —
le §2 dit comment une valeur vide est honorée.

`apps/desktop/scripts/release-local.sh` n'est **pas** cela : il reproduit le déploiement de
staging (signature, notarisation, envoi R2, inscription au flux) et exige chaque secret de la CI.
