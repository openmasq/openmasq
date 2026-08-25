import { missingRequired, argsMatchSchema } from "./toolFault";

/**
 * The SCHEMA-BLIND call guard — for a tool that EXISTS but whose schema was never
 * loaded this turn (the router pruned it, or the pick was empty and the model read
 * the name off the awareness catalog and skipped `load_tools`).
 *
 * Awareness ≠ callability was the design, but dispatch resolves any real name — so a
 * blind call used to reach the user's authenticated account carrying arguments the
 * model INVENTED (journal du 06/08/2026 : `intercom__search_conversations` appelé au
 * tour 1 sans schéma, un paramètre `filters` inventé, du JSON-dans-une-chaîne avec une
 * accolade en trop, trois allers-retours serveur perdus). This guard answers one
 * question BEFORE the server is hit: do the invented args provably violate the schema
 * we hold in `fullByName`?
 *
 * Deliberately conservative, like `argsMatchSchema` it builds on: it only bounces on a
 * violation it can PROVE. A blind call whose args happen to fit dispatches unchanged —
 * models often guess right from the catalog line, and regressing that working path
 * would trade measured successes for hypothetical safety.
 */

/** JSON-shaped openings. `{%` (a template), `{{` (moustache) or arbitrary prose that
 *  happens to start with a brace do NOT match — the false-positive to avoid is bouncing
 *  a legitimate string that was never meant to be JSON. */
const JSON_SHAPED = /^\s*(\{\s*"|\[\s*(\{|"|\d|\[))/;

/**
 * The problems a blind call's args provably have against the declared schema.
 * Empty array = nothing provable, dispatch.
 *
 * On top of the shared validators, ONE check specific to this path: a STRING property
 * whose value is JSON-shaped but does not parse. That is the exact failure observed —
 * a stringified-JSON param the model hand-assembled and malformed. It runs ONLY here
 * (never on schema-loaded calls): a loaded `write_file` legitimately carries a
 * `.json.tpl` full of placeholders, and bouncing it would break a working call. A
 * blind call has no such standing — the model never saw what the string should hold.
 */
export function schemaBlindProblems(
  schema: unknown,
  args: Record<string, unknown>,
): { problems: string[]; param?: string } {
  const problems: string[] = [];
  // Le PREMIER paramètre fautif — du vocabulaire de schéma, jamais une valeur. Il part
  // en télémétrie (`tool_error.param`) : savoir que tous les échecs d'un connecteur
  // portent sur `filters` évite de rouvrir un journal par occurrence.
  let param: string | undefined;
  const missing = missingRequired(schema, args);
  if (missing.length) {
    problems.push(`champs requis manquants : ${missing.join(", ")}`);
    param ??= missing[0];
  } else if (!argsMatchSchema(schema, args)) {
    problems.push("un argument viole le type ou l'enum déclaré par le schéma");
    param ??= firstTypeViolation(schema, args);
  }

  const props = (schema as { properties?: Record<string, unknown> } | null)?.properties;
  for (const [key, v] of Object.entries(args)) {
    if (typeof v !== "string" || !JSON_SHAPED.test(v)) continue;
    const spec = props?.[key] as { type?: unknown } | undefined;
    if (spec && spec.type !== "string") continue; // declared object/array: argsMatchSchema owns it
    try {
      JSON.parse(v);
    } catch {
      problems.push(`\`${key}\` ressemble à du JSON encodé en chaîne mais ne se parse pas (accolade/crochet en trop ou manquant)`);
      param ??= key;
    }
  }
  return { problems, param };
}

/** The first declared property whose value provably mismatches — mirrors the checks
 *  `argsMatchSchema` proves violations with, but names the property instead of voting. */
function firstTypeViolation(schema: unknown, args: Record<string, unknown>): string | undefined {
  const props = (schema as { properties?: Record<string, unknown> } | null)?.properties;
  if (!props) return undefined;
  for (const [key, rawSpec] of Object.entries(props)) {
    const v = args[key];
    if (v === undefined || v === null) continue;
    const spec = rawSpec as { type?: unknown; enum?: unknown } | null;
    if (!spec || typeof spec !== "object") continue;
    if (Array.isArray(spec.enum) && !spec.enum.includes(v)) return key;
    if (typeof spec.type !== "string") continue;
    const t = spec.type;
    const bad =
      (t === "string" && typeof v !== "string") ||
      (t === "boolean" && typeof v !== "boolean") ||
      ((t === "number" || t === "integer") && typeof v !== "number") ||
      (t === "array" && !Array.isArray(v)) ||
      (t === "object" && (typeof v !== "object" || Array.isArray(v)));
    if (bad) return key;
  }
  return undefined;
}
