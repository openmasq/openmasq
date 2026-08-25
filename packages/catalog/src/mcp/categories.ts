import type { McpCategory } from "./types";

export const MCP_CATEGORIES: McpCategory[] = [
  { id: "search", label: "Recherche & web" },
  { id: "dev", label: "Développement" },
  { id: "data", label: "Données & stockage" },
  { id: "productivity", label: "Productivité" },
  { id: "crm", label: "CRM & support" },
  { id: "finance", label: "Finance & paiements" },
  { id: "design", label: "Design & sites" },
  { id: "automation", label: "Automatisation" },
  { id: "ai", label: "IA & modèles" },
];
/** The id used for connectors with no (or an unknown) category. */
export const MCP_CATEGORY_OTHER = "other";
/** FR label for a category id (or "Autres" when unknown/unset). */
export function mcpCategoryLabel(id: string | undefined): string {
  return MCP_CATEGORIES.find((c) => c.id === id)?.label ?? "Autres";
}

/**
 * Group any list of category-carrying items into the CANONICAL category order
 * (`MCP_CATEGORIES`), with uncategorised items last under "Autres". Shared by the
 * desktop Settings and the admin console so the two group + order connectors the
 * SAME way. Generic over the item shape (works on `McpConnector` or a UI row VM as
 * long as it has an optional `category`). Empty groups are dropped.
 */
export function groupByMcpCategory<T extends { category?: string }>(
  items: T[],
): { id: string; label: string; items: T[] }[] {
  const order = [...MCP_CATEGORIES.map((c) => c.id), MCP_CATEGORY_OTHER];
  const buckets = new Map<string, T[]>();
  for (const it of items) {
    const key = it.category && MCP_CATEGORIES.some((c) => c.id === it.category)
      ? it.category
      : MCP_CATEGORY_OTHER;
    (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(it);
  }
  return order
    .filter((id) => (buckets.get(id)?.length ?? 0) > 0)
    .map((id) => ({ id, label: mcpCategoryLabel(id === MCP_CATEGORY_OTHER ? undefined : id), items: buckets.get(id)! }));
}
