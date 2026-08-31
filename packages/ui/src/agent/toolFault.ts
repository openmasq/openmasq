/**
 * **Whose fault was this tool call?** — the diagnosis half of the agentic loop's
 * classification, split out of `mcpAgentClassify.ts` (rule 1); that file keeps the
 * "what KIND of tool is this" half.
 *
 * The distinction the loop acts on: `arg_error` means the MODEL malformed the call and
 * a more capable one would do better; anything else means it would not, and saying so
 * wrongly costs the user a model switch that changes nothing.
 */

import type { ToolErrorReason } from "../analytics";

/**
 * The `required` string props of a tool's JSON-Schema that are MISSING or an empty
 * string in `args` — a definitive "the model malformed this call" signal we can
 * catch BEFORE hitting the server (conservative: only flags absent/empty). */
export function missingRequired(schema: unknown, args: Record<string, unknown>): string[] {
  const s = schema as { required?: unknown; properties?: Record<string, unknown> } | null;
  if (!s || !Array.isArray(s.required)) return [];
  return s.required.filter((k): k is string => {
    if (typeof k !== "string") return false;
    const v = args[k];
    return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
  });
}

/**
 * Do `args` SATISFY the tool's own declared schema? Deliberately conservative: it only
 * answers `false` on a violation it can prove — a missing required field, a declared
 * property of the wrong type, a number outside its bounds, a value outside its `enum`.
 * An undeclared extra property is NOT a violation (many servers accept them), and an
 * unreadable schema means "we can't tell", which answers `true`.
 *
 * It exists to stop the app blaming the model for someone else's failure. A 4xx does
 * not prove the MODEL malformed the call: the connector builds the request too (query
 * string, headers, its own defaults). `google-calendar__list_events` declares NO
 * required argument, so `{"limit":10}` is valid by construction — yet a 400 from Google
 * was reported to the user as « le modèle a eu du mal à utiliser l'outil (arguments
 * invalides) », with the advice to switch to a stronger model. That advice is worse
 * than useless: a capable model sends the very same arguments and hits the very same
 * 400. When the args fit the schema, the fault lies past the model.
 */
export function argsMatchSchema(schema: unknown, args: Record<string, unknown>): boolean {
  const s = schema as { properties?: Record<string, unknown> } | null;
  if (missingRequired(schema, args).length) return false;
  if (!s || typeof s.properties !== "object" || !s.properties) return true;
  for (const [key, rawSpec] of Object.entries(s.properties)) {
    const v = args[key];
    if (v === undefined || v === null) continue; // absent + not required = fine
    const spec = rawSpec as {
      type?: unknown;
      enum?: unknown;
      minimum?: unknown;
      maximum?: unknown;
    } | null;
    if (!spec || typeof spec !== "object") continue;
    if (typeof spec.type === "string" && !matchesJsonType(v, spec.type)) return false;
    if (Array.isArray(spec.enum) && !spec.enum.includes(v)) return false;
    if (typeof v === "number") {
      if (typeof spec.minimum === "number" && v < spec.minimum) return false;
      if (typeof spec.maximum === "number" && v > spec.maximum) return false;
    }
  }
  return true;
}

function matchesJsonType(v: unknown, type: string): boolean {
  switch (type) {
    case "string":
      return typeof v === "string";
    case "number":
      return typeof v === "number" && Number.isFinite(v);
    case "integer":
      return typeof v === "number" && Number.isInteger(v);
    case "boolean":
      return typeof v === "boolean";
    case "array":
      return Array.isArray(v);
    case "object":
      return typeof v === "object" && v !== null && !Array.isArray(v);
    default:
      return true; // a type we don't model ("null", a union…) is not a violation we can prove
  }
}

/** Classify a tool error's TEXT into a bounded reason — never stored/sent raw.
 *  `arg_error` = the model's fault (bad/empty/invalid args); `operational` = the
 *  server refused (auth/quota/not-found); else transport/unknown. */
export function classifyToolError(text: string): ToolErrorReason {
  const t = text.toLowerCase();
  // Bilingual: our own connectors emit FRENCH errors ("est requis", "accès refusé",
  // "n'est pas activée"…), so an English-only matcher classified them "unknown" and
  // the self-correction loop never fired (a weak model kept omitting `to`).
  if (/unauthor|forbidden|permission|not found|no such (customer|resource|object)|rate limit|\b429\b|quota|insufficient|expired|acc[eè]s refus|refus[ée]e?\b|non autoris|autoris|interdit|bloqu[ée]|introuvable|indisponible|pas activ|expir[ée]|trop de requ/.test(t))
    return "operational";
  if (/empty (string|value)|invalid (parameter|argument|value|request|type)|required|cannot be unset|missing|malformed|unknown (field|parameter|argument)|expected .* (got|but)|must be|not a valid|validation|bad request|\b400\b|schema|requis|manquant|obligatoire|invalide|non valide|attendu|doit [êe]tre|\bvide\b|champ inconnu|malform/.test(t))
    return "arg_error";
  if (/econnrefused|fetch failed|failed to fetch|enotfound|network|timed out|timeout|unreachable|socket|d[ée]lai d[ée]pass|injoignable|r[ée]seau|hors ligne/.test(t))
    return "transport";
  return "unknown";
}

/**
 * The FAMILY of a failure — the SORT axis `classifyToolError` doesn't give: its
 * `operational` mixes the expired key (the user reconnects), the quota (we wait)
 * and the 404 (we fix the code). Same bilingual rule as it, same bounded output —
 * the family goes into telemetry, the text never does. `other` = nothing provable.
 */
export function classifyErrorFamily(text: string): import("../analytics").ToolErrorFamily {
  const t = text.toLowerCase();
  if (/unauthor|forbidden|permission|invalid[_ ]?(api[_ ]?key|token)|api key|credential|expired|\b401\b|\b403\b|acc[eè]s refus|non autoris|interdit|expir[ée]|authentif/.test(t))
    return "auth";
  if (/rate limit|\b429\b|quota|too many|insufficient credit|trop de requ|cr[ée]dit/.test(t)) return "quota";
  if (/not found|no such|\b404\b|introuvable|n'existe pas|inexistant/.test(t)) return "not_found";
  if (/timed out|timeout|d[ée]lai d[ée]pass/.test(t)) return "timeout";
  if (/\b(500|502|503|504)\b|internal server|server error|service unavailable|indisponible/.test(t)) return "server";
  if (/invalid|required|missing|malformed|must be|bad request|\b400\b|validation|schema|param|requis|manquant|invalide|attendu|doit [êe]tre/.test(t))
    return "bad_request";
  return "other";
}

/**
 * The reason a failed call REALLY carries.
 *
 * `classifyToolError` reads the provider's TEXT, and any 4xx in it reads as
 * `arg_error` — "the model malformed this call". That inference is wrong whenever the
 * arguments satisfy the tool's own schema, because the connector builds the request
 * too: `google-calendar__list_events` declares no required argument, so `{"limit":10}`
 * is valid by construction, yet a Google 400 was reported to the user as the model's
 * fault with the advice to switch to a stronger model — which would send the identical
 * call into the identical refusal.
 */
export function attributeToolFault(
  reason: ToolErrorReason,
  schema: unknown,
  args: Record<string, unknown>,
): ToolErrorReason {
  return reason === "arg_error" && argsMatchSchema(schema, args) ? "operational" : reason;
}
