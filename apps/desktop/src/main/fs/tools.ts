import type { McpTool, JsonObject } from "@openmasq/mcp";

// Tool surface of the in-process filesystem connector. Names mirror the standard
// `@modelcontextprotocol/server-filesystem` so model behaviour/prompts carry over.
// `annotations` are AUTHORED BY US (trusted) — read tools are `readOnlyHint`, mutating
// ones `destructiveHint`, so the renderer write-confirmation gate treats them right.
// (Not yet ported from the upstream server: directory_tree, read_media_file,
// read_multiple_files, list_directory_with_sizes — add later if needed. Each new tool
// costs schema in the model's window and pressure on `toolRouter`, so port on demand.)
const S = (properties: JsonObject, required: string[]): JsonObject => ({
  type: "object",
  properties,
  required,
});
const pathProp: JsonObject = { type: "string", description: "Chemin absolu, dans un dossier autorisé." };
// Every read hands back a `[révision …]` header; passing it back on a write refuses the
// write if the file changed in between, instead of silently overwriting that change.
const revisionProp: JsonObject = {
  type: "string",
  description: "Révision lue précédemment. Facultative : si fournie et que le fichier a changé, l'écriture est refusée.",
};

// `serverId` is stamped per-connection in LocalFsConnection.listTools (like listToolsVia).
export const FS_TOOLS: Omit<McpTool, "serverId">[] = [
  {
    name: "list_allowed_directories",
    description: "Liste les dossiers auxquels l'accès a été accordé.",
    inputSchema: S({}, []),
    annotations: { readOnlyHint: true },
  },
  {
    name: "read_file",
    description:
      "Lit le contenu texte d'un fichier. Pour un gros fichier, lire par tranches avec `offset`/`limit`.",
    inputSchema: S(
      {
        path: pathProp,
        offset: { type: "number", description: "Première ligne à lire (1 = début). Par défaut : 1." },
        limit: { type: "number", description: "Nombre de lignes à lire. Active la lecture par tranches." },
      },
      ["path"],
    ),
    annotations: { readOnlyHint: true },
  },
  {
    name: "list_directory",
    description: "Liste les entrées d'un dossier ([DIR]/[FILE]/[LINK]).",
    inputSchema: S({ path: pathProp }, ["path"]),
    annotations: { readOnlyHint: true },
  },
  {
    name: "get_file_info",
    description: "Métadonnées d'un fichier/dossier (type, taille, dates, permissions).",
    inputSchema: S({ path: pathProp }, ["path"]),
    annotations: { readOnlyHint: true },
  },
  {
    name: "find_files",
    description:
      "Retrouve des fichiers par ce qu'ils SONT, en langage naturel (« les documents " +
      "fiscaux », « le bail de l'appartement »). C'est l'outil par défaut pour chercher : " +
      "l'appariement se fait sur l'appareil, il n'exige donc AUCUNE devinette sur le nom " +
      "exact et retrouve un fichier dont le nom emploie d'autres mots que la demande. " +
      "`search_files` ne sert que si l'on connaît déjà une sous-chaîne littérale du nom.",
    inputSchema: S(
      {
        query: {
          type: "string",
          description: "Ce que l'on cherche, formulé comme à un humain. Pas un motif.",
        },
        path: {
          type: "string",
          description: "Restreindre à ce dossier. Par défaut : tous les dossiers autorisés.",
        },
      },
      ["query"],
    ),
    annotations: { readOnlyHint: true },
  },
  {
    name: "search_files",
    description:
      "Recherche récursive par SOUS-CHAÎNE littérale de nom (bornée). Pour une demande " +
      "formulée par le sens (« les documents fiscaux »), utiliser `find_files`.",
    inputSchema: S(
      { path: pathProp, pattern: { type: "string", description: "Sous-chaîne à rechercher dans les noms." } },
      ["path", "pattern"],
    ),
    annotations: { readOnlyHint: true },
  },
  {
    name: "write_file",
    description:
      "Écrit (crée/remplace INTÉGRALEMENT) un fichier texte. Pour modifier un passage d'un fichier existant, préférer `edit_file`.",
    inputSchema: S(
      { path: pathProp, content: { type: "string" }, expectedRevision: revisionProp },
      ["path", "content"],
    ),
    annotations: { destructiveHint: true },
  },
  {
    name: "edit_file",
    description:
      "Remplace un passage EXACT dans un fichier texte, en laissant le reste intact. " +
      "`oldText` doit être copié tel quel depuis `read_file` (espaces et indentation compris) et " +
      "identifier UN seul passage : sinon la modification est refusée plutôt que devinée.",
    inputSchema: S(
      {
        path: pathProp,
        oldText: { type: "string", description: "Le passage exact à remplacer." },
        newText: { type: "string", description: "Ce qui le remplace." },
        replaceAll: { type: "boolean", description: "Remplacer TOUTES les occurrences. Par défaut : false." },
        expectedRevision: revisionProp,
      },
      ["path", "oldText", "newText"],
    ),
    annotations: { destructiveHint: true },
  },
  {
    name: "create_directory",
    description: "Crée un dossier (récursif).",
    inputSchema: S({ path: pathProp }, ["path"]),
    annotations: { destructiveHint: true },
  },
  {
    name: "move_file",
    description: "Déplace/renomme un fichier ou dossier (source et destination autorisées).",
    inputSchema: S({ source: pathProp, destination: pathProp }, ["source", "destination"]),
    annotations: { destructiveHint: true },
  },
  {
    name: "read_document",
    description:
      "Lit le TEXTE d'un DOCUMENT : PDF (scans compris, via OCR), Word, Excel, PowerPoint. " +
      "C'est l'outil à utiliser pour tout fichier qui n'est pas du texte brut — `read_file` " +
      "ne renverrait que des octets illisibles. Pour un .docx, la lecture rend un paragraphe " +
      "par ligne et c'est ce texte-là que `edit_document` sait retrouver.",
    inputSchema: S({ path: pathProp }, ["path"]),
    annotations: { readOnlyHint: true },
  },
  {
    name: "edit_document",
    description:
      "Remplace un passage dans un document Word (.docx), SANS régénérer le fichier : la " +
      "mise en forme, les en-têtes, les images et tout le reste sont conservés à l'identique. " +
      "`oldText` doit apparaître dans UN SEUL paragraphe (sinon la modification est refusée). " +
      "⚠️ La mise en forme fine À L'INTÉRIEUR du paragraphe modifié est aplatie sur celle de " +
      "son début.",
    inputSchema: S(
      { path: pathProp, oldText: { type: "string" }, newText: { type: "string" } },
      ["path", "oldText", "newText"],
    ),
    annotations: { destructiveHint: true },
  },
];
