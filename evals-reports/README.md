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

