# Agentic evaluations — the summary

<sub>**English** · [Français](#évaluations-agentiques--synthèse)</sub>

Two benches, two folders, **never mixed** (their numbers do not measure the same thing):

- **`fixtures/`** (created by a run, gitignored) — FROZEN tool results
  (`apps/desktop/e2e/fixtures/mcp/workflows.json`). The model is real, the services are not:
  deterministic, repeatable, free on the service side, no side effects. **This is the bench
  one iterates on** — a before/after gap here is attributable to the guidance change, not to
  a service's latency or an account's contents.
- **`e2e/`** (created by a run, gitignored) — the REAL connectors of the dev account. It
  measures what the user will live through, at the price of real writes and a variance that
  forbids reading fine progress into it. **One confirms here**, one does not iterate.

One file per model (`<model>.md`, one block per run) plus a cross-cutting `index.md`. The
reports contain **measurements** only — never the text of the replies: the fixtures
themselves carry test PII.

Run: `E2E_REAL=1 pnpm --filter @openmasq/desktop e2e:evals`
(`E2E_EVAL_MODE=e2e` for the real bench · `E2E_EVAL_FAMILY=complexe` · `E2E_MODELS=…`).

---

# Évaluations agentiques — synthèse

Deux bancs, deux dossiers, **jamais mélangés** (leurs chiffres ne mesurent pas la
même chose) :

- **`fixtures/`** (créé par un run, gitignoré) — résultats d'outils FIGÉS (`apps/desktop/e2e/fixtures/mcp/workflows.json`).
  Le modèle est réel, les services non : déterministe, répétable, gratuit côté
  services, sans effet de bord. **C'est le banc où l'on itère** — un écart
  avant/après y est imputable au changement de guidance, pas à la latence d'un
  service ou au contenu d'un compte.
- **`e2e/`** (créé par un run, gitignoré) — les VRAIS connecteurs du compte dev. Mesure ce que l'utilisateur
  vivra, au prix d'écritures réelles et d'une variance qui interdit d'y lire un
  progrès fin. **On y confirme**, on n'y itère pas.

Un fichier par modèle (`<modèle>.md`, un bloc par run) + un `index.md` transverse.
Les rapports ne contiennent que des **mesures** — jamais le texte des réponses :
les fixtures elles-mêmes portent de la PII de test.

Lancer : `E2E_REAL=1 pnpm --filter @openmasq/desktop e2e:evals`
(`E2E_EVAL_MODE=e2e` pour le banc réel · `E2E_EVAL_FAMILY=complexe` · `E2E_MODELS=…`).
