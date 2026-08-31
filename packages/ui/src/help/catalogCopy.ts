import type { Messages, ModelCopy, RedactionCategoryCopy } from "@openmasq/i18n";
import { BRAND } from "@openmasq/branding";
import { mcpAuthShape, type McpAuthTag, type McpConnector } from "@openmasq/catalog/mcp";
import type { ModelMeta, ModelTag } from "@openmasq/llm";

/**
 * Les mots de l'UI pour ce que les CATALOGUES partagés décrivent — connecteurs MCP,
 * catégories de redaction, modèles.
 *
 * `@openmasq/catalog` et `@openmasq/llm` gardent la STRUCTURE (ids, catégories, transport,
 * profil) et la copie que le MODÈLE lit (`desc` sert `suggest_integrations`) ; la copie
 * que la PERSONNE lit vit dans `@openmasq/i18n` (`connectorCatalog`, `redactionCatalog`,
 * `modelCatalog`), et ce fichier est le seul endroit qui les rapproche. Aucun compilateur
 * ne relie un id de catalogue à sa clé de catalogue : `catalogCopy.test.ts` le fait, dans
 * chaque langue. Le repli (la copie française du catalogue) n'est là que pour qu'un id
 * ajouté avant sa traduction ne rende jamais une puce vide.
 */

/** Le libellé d'une catégorie de connecteur (« Autres » pour un id inconnu ou absent). */
export function mcpCategoryLabel(id: string | undefined, t: Messages): string {
  const cats = t.connectorCatalog.categories as Record<string, string>;
  return (id && cats[id]) || cats.other;
}

/** Nom + description d'un connecteur dans la langue de `t`, le catalogue en repli. */
export function connectorCopy(
  id: string,
  fallback: { name: string; desc: string },
  t: Messages,
): { name: string; desc: string } {
  const copy = t.connectorCatalog.connectors[id];
  return { name: copy?.name ?? fallback.name, desc: copy?.desc ?? fallback.desc };
}

/** L'étiquette d'authentification d'un connecteur — la FORME vient du catalogue
 *  (`mcpAuthShape`), les mots d'ici. Même découpage que `mcpAuthTag`, en français
 *  comme en anglais. */
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

/** Libellé / détail / impact d'une catégorie de redaction, le catalogue en repli. */
export function redactionCopy(
  key: string,
  fallback: { label: string; detail?: string; impact?: string },
  t: Messages,
): RedactionCategoryCopy {
  return t.redactionCatalog.categories[key] ?? fallback;
}

/** Le titre d'une SECTION du modal des règles (les clés du catalogue sont ses noms français). */
export function redactionSectionLabel(group: string, t: Messages): string {
  return t.redactionCatalog.sections[group] ?? group;
}

/** Le libellé court d'un type de valeur protégée (rapport, journal, chronologie). */
export function privacyKindLabel(key: string, t: Messages): string {
  return t.redactionCatalog.kinds[key] ?? key;
}

/** Points forts / limites / usage d'un modèle ; un id inconnu prend la copie de sa famille. */
export function modelCopy(id: string, meta: ModelMeta, t: Messages): ModelCopy {
  return t.modelCatalog.models[id] ?? t.modelCatalog.fallback[meta.fallback ?? "generic"];
}

export function modelTagLabel(tag: ModelTag, t: Messages): string {
  return t.modelCatalog.tags[tag];
}
