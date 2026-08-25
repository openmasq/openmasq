// @vitest-environment jsdom
// Shard 3/8 de la suite parallèle (OPENMASQ_EVAL_PARALLEL=<n> l'active) —
// chaque wrapper est un FICHIER vitest, donc son propre process/jsdom : la contrainte
// « un seul store par jsdom » tient tout en parallélisant les scénarios.
import { defineScenarioSuite } from "../evalSuite";

defineScenarioSuite({ shard: [2, 8], enabled: !!process.env.OPENMASQ_EVAL_PARALLEL });
