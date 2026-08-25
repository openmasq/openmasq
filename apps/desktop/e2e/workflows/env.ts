import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { supportsTools } from "../../../../packages/llm/src/models/capabilities";

// Env + paramètres partagés de la suite workflows (voir le doc-comment du spec).
// La clé peut vivre dans le .env RACINE ou dans apps/desktop/.env — charger les deux
// (dotenv n'écrase jamais une variable déjà posée, le premier trouvé gagne).
loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), "../../.env") });

export const KEY = process.env.OPENROUTER_API_KEY;
export const MODEL = process.env.E2E_MODEL || "google/gemma-4-26b-a4b-it:free";
export const FIXTURES = process.env.E2E_TOOL_FIXTURES !== "0";
export const STRICT = process.env.E2E_STRICT === "1";
/** `1` = jouer AUSSI les 12 modèles de workflow livrés (`workflows/templates.ts`).
 *  OFF par défaut, et c'est un choix de COÛT, pas de confiance : chaque entrée est un
 *  run de plus contre un vrai modèle (règle 4 — l'e2e se paie). Les mêmes modèles sont
 *  couverts gratuitement à chaque commit par `evals/scenarios/catalog.templates*.ts` ;
 *  cette suite-ci existe pour les rejouer de temps en temps dans l'app RÉELLE. */
export const TEMPLATES = process.env.E2E_TEMPLATES === "1";
export const MODEL_HAS_TOOLS = supportsTools(MODEL);
export const DESKTOP_DIR = process.cwd();
export const FIXTURE_FILE = resolve(DESKTOP_DIR, "e2e/fixtures/mcp/workflows.json");
