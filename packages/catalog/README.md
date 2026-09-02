# @openmasq/catalog — the governable lists

<sub>**English** · [Français](#openmasqcatalog--les-listes-gouvernables)</sub>

The single source of truth for what the product exposes and lets an organisation govern:
models (`./models`), MCP connectors (`./mcp`), redaction categories (`./redaction`) and
feature flags (`src/flags.ts`). Both the desktop and the admin tooling read these lists;
neither owns a copy.

**Boundary.** Data and pure helpers only — a list, its ids, its ordering. Copy lives in
`@openmasq/i18n`; behaviour lives in whoever consumes the list.

**Start here.** `src/index.ts`, then the folder of the list you need.

---

# @openmasq/catalog — les listes gouvernables

La source unique de vérité de ce que le produit expose et laisse une organisation gouverner :
les modèles (`./models`), les connecteurs MCP (`./mcp`), les catégories de masquage
(`./redaction`) et les drapeaux de fonctionnalité (`src/flags.ts`). L'application de bureau et
l'outillage d'administration lisent ces listes ; aucun n'en détient de copie.

**Frontière.** Des données et des aides pures seulement — une liste, ses ids, son ordre. La
copie vit dans `@openmasq/i18n` ; le comportement vit chez qui consomme la liste.

**Commencez ici.** `src/index.ts`, puis le dossier de la liste qu'il vous faut.
