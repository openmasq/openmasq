import type { Messages, ModelCopy, RedactionCategoryCopy } from "@openmasq/i18n";
import { BRAND } from "@openmasq/branding";
import { mcpAuthShape, type McpAuthTag, type McpConnector } from "@openmasq/catalog/mcp";
import type { ModelMeta, ModelTag } from "@openmasq/llm";

/**
 * The UI words for what the shared CATALOGUES describe — MCP connectors,
 * redaction categories, models.
 *
 * `@openmasq/catalog` and `@openmasq/llm` keep the STRUCTURE (ids, categories, transport,
 * profile) and the copy the MODEL reads (`desc` serves `suggest_integrations`); the copy
 * the PERSON reads lives in `@openmasq/i18n` (`connectorCatalog`, `redactionCatalog`,
 * `modelCatalog`), and this file is the only place that brings them together. No compiler
 * links a catalogue id to its catalogue key: `catalogCopy.test.ts` does, in
 * every language. The fallback (the catalogue's French copy) is only there so an id
 * added before its translation never renders an empty chip.
 */

/** A connector category's label ("Autres" for an unknown or absent id). */
export function mcpCategoryLabel(id: string | undefined, t: Messages): string {
  const cats = t.connectorCatalog.categories as Record<string, string>;
  return (id && cats[id]) || cats.other;
}

/** A connector's name + description in `t`'s language, the catalogue as fallback. */
export function connectorCopy(
  id: string,
  fallback: { name: string; desc: string },
  t: Messages,
): { name: string; desc: string } {
  const copy = t.connectorCatalog.connectors[id];
  return { name: copy?.name ?? fallback.name, desc: copy?.desc ?? fallback.desc };
}

/** A connector's auth label — the SHAPE comes from the catalogue
 *  (`mcpAuthShape`), the words from here. Same split as `mcpAuthTag`, in French
 *  as in English. */
export function mcpAuthTagCopy(
  c: Pick<McpConnector, "transport" | "auth" | "directAuth" | "byoOnly" | "byoReason" | "byoAdds">,
  t: Messages,
): McpAuthTag {
  const a = t.connectorCatalog.auth;
  const shape = mcpAuthShape(c);
  const what = shape.what ?? a.thisAccess;
  const reason =
    shape.reason === "admin-consent" ? a.reasonAdminConsent : a.reasonGoogleReview(BRAND.name);
  switch (shape.variant) {
    case "builtin":
      return { kind: shape.kind, ...a.builtin };
    case "byoOnly":
      return {
        kind: shape.kind,
        label: a.byoOnly.label,
        title: `${a.byoOnly.title(what, reason)} ${a.byoSafe(BRAND.name)}`,
      };
    case "byoLimited":
      return {
        kind: shape.kind,
        label: a.byoLimited.label,
        title: a.byoLimited.title(what, reason),
      };
    case "device":
      return { kind: shape.kind, ...a.device };
    case "directFull":
      return { kind: shape.kind, label: a.oneClickRemote.label, title: a.directFull };
    case "local":
      return { kind: shape.kind, ...a.local };
    case "broker":
      return {
        kind: shape.kind,
        label: a.broker.label(BRAND.name),
        title: a.broker.title(BRAND.name),
      };
    case "apikey":
      return { kind: shape.kind, ...a.apikey };
    case "oneClickRemote":
      return { kind: shape.kind, ...a.oneClickRemote };
  }
}

/** Label / detail / impact of a redaction category, the catalogue as fallback. */
export function redactionCopy(
  key: string,
  fallback: { label: string; detail?: string; impact?: string },
  t: Messages,
): RedactionCategoryCopy {
  return t.redactionCatalog.categories[key] ?? fallback;
}

/** The title of a rules modal SECTION (the catalogue's keys are its French names). */
export function redactionSectionLabel(group: string, t: Messages): string {
  return t.redactionCatalog.sections[group] ?? group;
}

/** The short label of a protected value type (report, log, timeline). */
export function privacyKindLabel(key: string, t: Messages): string {
  return t.redactionCatalog.kinds[key] ?? key;
}

/** Strengths / limits / usage of a model; an unknown id takes its family's copy. */
export function modelCopy(id: string, meta: ModelMeta, t: Messages): ModelCopy {
  return t.modelCatalog.models[id] ?? t.modelCatalog.fallback[meta.fallback ?? "generic"];
}

export function modelTagLabel(tag: ModelTag, t: Messages): string {
  return t.modelCatalog.tags[tag];
}
