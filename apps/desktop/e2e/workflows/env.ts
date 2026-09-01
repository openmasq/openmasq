import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { supportsTools } from "../../../../packages/llm/src/models/capabilities";

// Shared env + settings for the workflows suite (see the spec's doc-comment).
// The key can live in the ROOT .env or in apps/desktop/.env — load both
// (dotenv never overwrites a variable already set, the first one found wins).
loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), "../../.env") });

export const KEY = process.env.OPENROUTER_API_KEY;
export const MODEL = process.env.E2E_MODEL || "google/gemma-4-26b-a4b-it:free";
export const FIXTURES = process.env.E2E_TOOL_FIXTURES !== "0";
export const STRICT = process.env.E2E_STRICT === "1";
/** `1` = ALSO play the 12 shipped workflow templates (`workflows/templates.ts`).
 *  OFF by default, and that's a COST choice, not a trust one: every entry is one
 *  more run against a real model (rule 4 — e2e costs money). The same templates are
 *  covered for free on every commit by `evals/scenarios/catalog.templates*.ts`;
 *  this suite exists to replay them occasionally in the REAL app. */
export const TEMPLATES = process.env.E2E_TEMPLATES === "1";
export const MODEL_HAS_TOOLS = supportsTools(MODEL);
export const DESKTOP_DIR = process.cwd();
export const FIXTURE_FILE = resolve(DESKTOP_DIR, "e2e/fixtures/mcp/workflows.json");
