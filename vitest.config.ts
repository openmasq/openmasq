import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { workspaceSrcAlias, CORPUS_TESTS, NO_ISOLATE_UNSAFE_TESTS } from "./scripts/vitest.workspaceAlias";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Deterministic unit/integration tests for the fragile, pure pieces of the
// keyless pipeline — the DOM→Markdown serialiser and the reversible redaction —
// so we can exercise many prompts in CI without a real signed-in web session.
// Per-file `// @vitest-environment jsdom` opts the serialiser tests into a DOM.
//
// TWO PROJECTS, because one of them cannot run in this runtime. Everything below is
// the `unit` project (node/jsdom, threads). `apps/updates` is a Cloudflare Worker: its
// tests need workerd + Miniflare + R2 bindings, supplied by its OWN config
// (`apps/updates/vitest.config.ts`, the `@cloudflare/vitest-pool-workers` pool). Listing
// it as a PROJECT is what makes `pnpm test` run it too — adding its path to the `include`
// below would instead run Worker tests under node, where they cannot pass. Before that it
// was reachable by no runner at all: 64 assertions on the staged-rollout logic (who gets
// which app version), written and never executed.
const unit = defineConfig({
  resolve: {
    alias: [
      // ⚠️ `electron` ne se résout JAMAIS vers le vrai paquet dans la suite. Son
      // `index.js` ne rend pas une API mais le CHEMIN du binaire, et si `path.txt` manque
      // il TÉLÉCHARGE 295 Mo à l'import. En local le binaire est là ; sur un runner il ne
      // l'est pas, et le premier fichier de test qui touche `electron` paie ce
      // téléchargement AU MILIEU de la suite — donc échoue si le réseau tousse, pendant
      // qu'un autre fichier important le même module passe deux minutes plus tard. Une
      // COURSE, arbitrée par la chance, qu'aucun `pnpm test` local ne peut montrer.
      // Le bouchon rend le local et la CI identiques, et sans réseau.
      // `vi.mock("electron", …)` (21 fichiers) gagne sur cet alias : un test qui a besoin
      // d'un comportement le déclare, comme avant.
      { find: /^electron$/, replacement: here("./scripts/vitest.electron-stub.ts") },
      // ⚠️ Compagnon OBLIGÉ de l'alias ci-dessus. `@sentry/electron` importe `electron`
      // EN INTERNE ; externalisé (défaut), cet import passe par le résolveur de NODE qui
      // ignore les alias → le vrai paquet, module-CHAÎNE, « does not provide an export
      // named 'app' ». Et l'INLINER ne va pas mieux : son init module-niveau lit
      // `process.versions.electron` (absent hors Electron) et jette. Donc le même remède
      // que pour electron : un bouchon, et un test qui a besoin d'un comportement le
      // déclare via `vi.mock`. Symptôme du prochain paquet dans ce cas : ce SyntaxError.
      { find: /^@sentry\/electron\/(main|renderer)$/, replacement: here("./scripts/vitest.sentry-electron-stub.ts") },
      ...workspaceSrcAlias,
    ],
  },
  test: {
    name: "unit",
    environment: "node",
    // WORKERS, pas des processus. Mesuré sur la suite entière (475 fichiers) : 370 s en
    // `forks` (le défaut) contre ~85 s en `threads` — l'essentiel du gain vient de la
    // COLLECTE, refaite par fichier, qu'un thread paie une fois par worker au lieu d'une
    // fois par processus. ⚠️ L'ISOLATION PAR FICHIER EST CONSERVÉE, et ce n'est plus
    // « aucun gain » : re-mesuré le 15/08/2026 (686 fichiers), `--no-isolate` divise par
    // 2,7 le chemin chaud (`related` sur un fichier moteur : 31 s → 11,5 s)… et rend
    // ~20 fichiers rouges SELON L'ORDRE des fichiers (état global partagé + cache
    // d'importeurs sous `vi.mock` : trois runs mélangés donnent trois listes d'échecs
    // différentes, ui/desktop/backend/gateway confondus). Un faux rouge qui accuse
    // l'ordre et pas le code est la classe de signal que ce dépôt a déjà payée deux
    // fois — l'isolation reste. L'exception VÉRIFIÉE : `pnpm test:redact`
    // (`--no-isolate` scopé à packages/redact, mock-users exclus — voir
    // NO_ISOLATE_UNSAFE_TESTS), stable sur 6 runs mélangés, 13 s → 4 s.
    // NB vitest 3.2 : `isolate`/`pool` par PROJET sont ignorés (racine/CLI seulement) —
    // un projet « pur » non isolé à côté d'un projet « app » isolé ne marche pas.
    pool: "threads",
    // Le défaut de 5 s était sous la durée RÉELLE des tests de documents lourds
    // (`releveRepartition`, `acteCautionnement`, `documents`) : ils tiennent à vide et
    // expirent sous charge, ce qui produisait des rouges qui n'accusaient aucun bug. Un
    // timeout ne coûte rien quand rien n'expire — il ne borne que l'échec.
    testTimeout: 20_000,
    // Les bancs corpus vivent hors de ce dépôt (voir CORPUS_TESTS) — un banc
    // de rappel n'est pas un test unitaire, et son timeout sous charge non plus.
    // VITEST_NO_ISOLATE : posé par `pnpm test:redact` SEULEMENT — la CLI `--exclude`
    // est inerte en mode projects (l'exclude du projet gagne), donc la voie rapide
    // passe par la config. Jamais posé à la main sur `pnpm test`.
    exclude: [
      "**/node_modules/**",
      ...CORPUS_TESTS,
      ...(process.env.VITEST_NO_ISOLATE ? NO_ISOLATE_UNSAFE_TESTS : []),
    ],
    // Node ≥26 ships stub `localStorage`/`sessionStorage` globals that mask jsdom's —
    // the shim (no-op outside jsdom files) grafts real Storage back. See the file header.
    setupFiles: ["./scripts/vitest.webstorage-setup.ts"],
    // ⚠️ A test file this list does not match is SILENTLY never run — worse than no
    // test, because the suite still reports green. So every entry is a `**` glob over
    // a whole source tree, and a new subfolder needs no edit here. The ONE narrow
    // exception is `apps/backend` (below), which has a reason that is not tidiness.
    // `.tsx` is included everywhere `.ts` is: a React component test is a test, and
    // making authors hand-write `React.createElement` to dodge the include is friction
    // for nothing (`scripts/test-kit.tsx` is the shared jsdom harness).
    include: [
      "packages/**/src/**/*.test.{ts,tsx}",
      // `packages/emails` is flat (no src/), so `packages/**/src/**` misses it entirely:
      // the outbound FROM/inbox single-source (`lib/`) and the release-note tooling
      // (`scripts/` — the Contentful→email mapping the preview and the audience
      // broadcast SHARE). One `**` glob per the rule above, not a per-folder list.
      "packages/emails/**/*.test.{ts,tsx}",
      // The desktop MAIN process (security-critical, electron-free units: the fs grant
      // gate, the read gate, secrets-at-rest, SSRF egress, the Python jail, the NER
      // integrity pin, the DB round-trip…), its IPC layer and the renderer's pre-paint
      // boot script. One glob: this used to be FIFTEEN hand-listed directories, and the
      // trap was documented twice in the CLAUDE.md tree instead of being fixed.
      "apps/desktop/src/**/*.test.{ts,tsx}",
      // Les scripts de BUILD du desktop. Ils ne s'expédient pas, mais ils décident de ce
      // qui s'expédie : le tri par arche d'`archPrune.cjs` est la table qui dit quel
      // moteur ONNX part dans quel .app, et se tromper là ne se voit qu'à l'usage.
      "apps/desktop/scripts/**/*.test.{ts,tsx}",
      // MCP broker OAuth primitives (PKCE, redirect_uri, token store).
      "apps/api/src/**/*.test.{ts,tsx}",
      // Scaleway redaction function: GPT-OSS detection (mocked fetch) + handler.
      // Scaleway analytics-fn: supertest e2e over the Express app (relay + release-notes).
      // La console d'administration : sa logique de vue PURE (le pivot de l'Overview —
      // ce que les filtres calculent réellement à partir du cube que le backend renvoie),
      // et `src/` — les routes de la SPA vivent là depuis la bascule Vite, un test posé
      // dans `src/routes/` ne serait sinon JAMAIS exécuté (l'avertissement ci-dessus).
      // `apps/web/e2e` est du Playwright et s'appelle `*.e2e.ts`, donc ce glob ne peut pas
      // l'attraper ; `.next/` non plus, il n'y a pas de `*.test.ts` dedans.
      // Le site vitrine (`apps/landing`) a quitté ce monorepo (dépôt séparé,
      // 18/08) — sa suite tourne là-bas désormais, plus ici.
      // ⚠️ `apps/backend` is the ONE tree that may NOT be globbed: `features/*/unitTest/**`
      // holds JEST supertest STEP HELPERS (exported functions, no `it`/`describe`), and
      // vitest picks them up and fails. Hence three narrow entries — the inference proxy
      // (model allow-list + SSE usage parser), the billing PARITY test (rule 9's only
      // guard between the Terraform/Stripe catalogue and the TS the app runs), the
      // feedback relay (payload allow-list + HTML escaping of untrusted free text), and
      // the Stripe return-URL resolver. Widening one means moving those helpers first.
      // Un seul `*` : les fichiers POSÉS dans `subscriptions/` (le test de parité, le
      // calcul sièges↔prix), jamais `subscriptions/unitTest/**` et ses helpers jest.
      // Idem, un seul `*` : l'OCTROI d'abonnement (`features/admin/`) — les règles
      // d'écritures d'argent accordées sans paiement (quel palier, quelle période, ce que
      // révoquer remet à zéro). Pas de helpers jest dans ce dossier aujourd'hui ; le `*`
      // unique le garde vrai si l'on en ajoute.
      // Un seul `*` : la projection rôles→drapeaux (`flags.test.ts` — ce que l'extérieur
      // a le droit de savoir d'un compte), jamais `users/unitTest/**` et ses helpers jest.
      // La ROUTE PUBLIQUE (demandes du site) : ses gardes sont ses tests.
      // Idem, un seul `*` : le prédicat de la barrière de direction sync (quel
      // device lit/écrit quel scope — coffres ET records), jamais `sync/unitTest/**`.
      // La règle de confiance du webhook Stripe (résolution du sujet de
      // facturation — subject.test.ts) : logique pure à deps injectées, pas de
      // helpers jest dans ce dossier, le glob est sûr.
      // Un cran plus bas, `lib/email/` : l'AIGUILLAGE des audiences Resend. C'est lui qui
      // décide à qui part une annonce de version — et son absence de repli est ce qui
      // empêche une variable d'environnement oubliée de renvoyer les inscrits du site
      // dans la diffusion. Pas de helpers jest ici, le glob est sûr.
      // Les GARDES (`routes/middlewares/`) : `requireSuperAdmin` décide qui peut créditer
      // un compte sans paiement — la seule autorisation du dépôt qui donne de l'argent.
      // L'outillage de la RACINE. Un seul `*` : les fichiers posés dans `scripts/`, jamais
      // les helpers vitest qui l'entourent. Ce qui s'y teste décide de ce qu'une session
      // peut lire et écrire (`claude-sandbox.sh` — le profil seatbelt de `claude:sandbox`),
      // et une règle de bac à sable fausse se lit comme une panne de l'outil, pas comme une
      // règle : c'est exactement ce qu'un test doit rattraper à notre place.
      "scripts/*.test.{ts,tsx}",
    ],
    passWithNoTests: false,
  },
});

export default defineConfig({
  test: {
    projects: [unit, ...(existsSync("apps/updates") ? ["./apps/updates"] : [])],
  },
});
