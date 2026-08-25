import { describe, it, expect, vi } from "vitest";
import type { McpConnection, McpTool } from "@openmasq/mcp";
import {
  assertFolderRef,
  directChildren,
  describeShape,
  findFolderLister,
  isFolderListTool,
  mcpBrowseList,
  parseToolList,
} from "./index";

const tool = (name: string, schema: object): McpTool =>
  ({ name, inputSchema: schema, serverId: "dropbox" }) as McpTool;

const props = (o: Record<string, unknown>, required?: string[]) => ({
  type: "object",
  properties: o,
  ...(required ? { required } : {}),
});

describe("findFolderLister — une ALLOW-list, pas une devinette", () => {
  it("reconnaît ListFolder quelle que soit la casse ou le tiret bas", () => {
    for (const n of ["ListFolder", "list_folder", "listFolder", "dropbox__ListFolder"]) {
      expect(findFolderLister([tool(n, props({ path: { type: "string" } }))])?.folderArg).toBe("path");
    }
  });

  it("ignore TOUT le reste de ce que le serveur expose — écritures comprises", () => {
    const tools = [
      tool("Delete", props({ path: { type: "string" } })),
      tool("CreateFolder", props({ path: { type: "string" } })),
      tool("Move", props({ path: { type: "string" } })),
      tool("Search", props({ query: { type: "string" } })),
    ];
    expect(findFolderLister(tools)).toBeNull();
    // Et la question posée par `cloudSources()` répond pareil.
    expect(tools.some((t) => isFolderListTool(t.name))).toBe(false);
  });

  it("renonce à un listage dont un argument OBLIGATOIRE nous est inconnu", () => {
    // L'appeler à moitié rendrait une erreur du serveur là où « ce compte ne se parcourt
    // pas » est la réponse honnête.
    const t = tool("ListFolder", props({ path: {}, account_id: {} }, ["path", "account_id"]));
    expect(findFolderLister([t])).toBeNull();
  });

  it("prend l'argument de pagination quand le schéma en déclare un", () => {
    const t = tool("ListFolder", props({ path: {}, cursor: {} }, ["path"]));
    expect(findFolderLister([t])).toEqual({ tool: "ListFolder", folderArg: "path", cursorArg: "cursor" });
  });
});

describe("parseToolList — échoue FERMÉ", () => {
  const dropboxPage = JSON.stringify({
    entries: [
      { ".tag": "folder", name: "Clients", path_display: "/Clients" },
      { ".tag": "file", name: "Contrat.pdf", path_display: "/Contrat.pdf", server_modified: "2026-07-01T10:00:00Z" },
    ],
    has_more: false,
  });

  it("lit une page Dropbox : dossiers d'abord, chemin en guise d'identifiant", () => {
    const out = parseToolList([dropboxPage])!;
    expect(out.entries).toEqual([
      { id: "/Clients", name: "Clients", kind: "dir", mtime: 0 },
      { id: "/Contrat.pdf", name: "Contrat.pdf", kind: "file", mtime: Date.parse("2026-07-01T10:00:00Z") },
    ]);
    expect(out.cursor).toBeUndefined();
  });

  it("un dossier VIDE est une liste vide, pas un échec", () => {
    expect(parseToolList([JSON.stringify({ entries: [] })])).toEqual({ entries: [] });
  });

  it("de la PROSE pour modèle n'est pas une liste", () => {
    expect(parseToolList(["[dossier] Clients · id:/Clients\nContrat.pdf · id:/Contrat.pdf"])).toBeNull();
  });

  it("un JSON dont RIEN ne dit ce qui est un dossier est refusé, pas aplati en fichiers", () => {
    const nothingSaysFolder = JSON.stringify({ entries: [{ name: "Clients", path: "/Clients" }] });
    expect(parseToolList([nothingSaysFolder])).toBeNull();
  });

  it("lit un JSON emballé dans une clôture Markdown ou précédé d'une phrase", () => {
    const inner = JSON.stringify({ entries: [{ ".tag": "folder", name: "A", path_display: "/A" }] });
    for (const wrapped of ["```json\n" + inner + "\n```", "Voici le contenu :\n" + inner]) {
      expect(parseToolList([wrapped])?.entries.map((e) => e.name)).toEqual(["A"]);
    }
  });

  it("trouve la liste même rangée sous une clé inattendue — mais jamais un tableau de chaînes", () => {
    const odd = JSON.stringify({ data: [{ type: "folder", name: "A", path: "/A" }] });
    expect(parseToolList([odd])?.entries.map((e) => e.kind)).toEqual(["dir"]);
    expect(parseToolList([JSON.stringify({ data: ["A", "B"] })])).toBeNull();
  });

  it("classe la facette Graph (`folder` / `file`) et un type MIME de dossier", () => {
    const graph = JSON.stringify({ value: [{ name: "A", id: "01A", folder: { childCount: 2 } }] });
    expect(parseToolList([graph])?.entries[0].kind).toBe("dir");
    const mime = JSON.stringify({ files: [{ name: "A", id: "1", mimeType: "application/vnd.google-apps.folder" }] });
    expect(parseToolList([mime])?.entries[0].kind).toBe("dir");
  });

  it("une entrée sans nom NI chemin fait tomber la page entière", () => {
    const half = JSON.stringify({ entries: [{ ".tag": "folder", name: "Clients", path_display: "/Clients" }, { ".tag": "file" }] });
    expect(parseToolList([half])).toBeNull();
  });

  it("ne rend un curseur que si le serveur annonce une SUITE", () => {
    const more = JSON.stringify({ entries: [], has_more: true, cursor: "c1" });
    expect(parseToolList([more])?.cursor).toBe("c1");
    expect(parseToolList([JSON.stringify({ entries: [], has_more: false, cursor: "c1" })])?.cursor).toBeUndefined();
  });
});

describe("describeShape — dire CE QUI manque, sans montrer aucune valeur", () => {
  it("nomme les clés de la réponse et celles d'une entrée", () => {
    const out = describeShape([JSON.stringify({ entries: [{ name: "Contrat secret", path: "/x" }], has_more: false })]);
    expect(out).toContain("entries, has_more");
    expect(out).toContain("name, path");
    // La valeur, elle, ne sort jamais.
    expect(out).not.toContain("Contrat secret");
  });

  it("dit qu'aucune liste n'a été trouvée, et qu'une réponse n'est pas du JSON", () => {
    expect(describeShape([JSON.stringify({ cursor: "c" })])).toMatch(/aucune liste/);
    expect(describeShape(["Vos fichiers : Clients, Contrat.pdf"])).toMatch(/non-JSON/);
    expect(describeShape([])).toMatch(/vide/);
  });
});

describe("assertFolderRef", () => {
  it("la racine est la chaîne vide, et un chemin Dropbox passe tel quel", () => {
    expect(assertFolderRef(null)).toBe("");
    expect(assertFolderRef("/Clients/Karl Studio")).toBe("/Clients/Karl Studio");
  });

  it("refuse un caractère de contrôle et une longueur déraisonnable", () => {
    expect(() => assertFolderRef("/a\u0000b")).toThrow();
    expect(() => assertFolderRef("/".padEnd(2000, "x"))).toThrow();
  });
});

describe("mcpBrowseList — l'appel, bout en bout", () => {
  const conn = (tools: McpTool[], results: string[]): McpConnection & { callTool: ReturnType<typeof vi.fn> } => {
    let i = 0;
    return {
      id: "dropbox",
      listTools: vi.fn(async () => tools),
      callTool: vi.fn(async () => ({ content: [{ type: "text" as const, text: results[i++] }] })),
      close: vi.fn(async () => {}),
    };
  };

  it("appelle le listage avec le dossier, et trie dossiers d'abord", async () => {
    const c = conn(
      [tool("ListFolder", props({ path: {} }))],
      [JSON.stringify({ entries: [{ ".tag": "file", name: "b.pdf", path_display: "/b.pdf" }, { ".tag": "folder", name: "A", path_display: "/A" }] })],
    );
    const out = await mcpBrowseList(c, "/");
    expect(c.callTool).toHaveBeenCalledWith({ name: "ListFolder", arguments: { path: "/" } });
    expect(out.map((e) => e.name)).toEqual(["A", "b.pdf"]);
  });

  it("suit la pagination", async () => {
    const c = conn(
      [tool("ListFolder", props({ path: {}, cursor: {} }))],
      [
        JSON.stringify({ entries: [{ ".tag": "file", name: "a", path_display: "/a" }], has_more: true, cursor: "c1" }),
        JSON.stringify({ entries: [{ ".tag": "file", name: "b", path_display: "/b" }], has_more: false }),
      ],
    );
    const out = await mcpBrowseList(c, "");
    expect(out.map((e) => e.name)).toEqual(["a", "b"]);
  });

  it("un serveur qui IGNORE le curseur ne duplique pas — la pagination s'arrête", async () => {
    const page = JSON.stringify({ entries: [{ ".tag": "file", name: "a", path_display: "/a" }], has_more: true, cursor: "c1" });
    const c = conn([tool("ListFolder", props({ path: {}, cursor: {} }))], [page, page, page]);
    const out = await mcpBrowseList(c, "");
    expect(out.map((x) => x.name)).toEqual(["a"]);
    // Deux appels au plus : la 2e page n'apporte rien de neuf, donc on s'arrête là.
    expect(c.callTool.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("le dossier accompagne TOUJOURS le curseur — un chemin obligatoire refuserait la suite", async () => {
    const c = conn(
      [tool("ListFolder", props({ path: {}, cursor: {} }, ["path"]))],
      [
        JSON.stringify({ entries: [{ ".tag": "file", name: "a", path_display: "/a" }], has_more: true, cursor: "c1" }),
        JSON.stringify({ entries: [{ ".tag": "file", name: "b", path_display: "/b" }], has_more: false }),
      ],
    );
    await mcpBrowseList(c, "/");
    expect(c.callTool).toHaveBeenNthCalledWith(2, { name: "ListFolder", arguments: { path: "/", cursor: "c1" } });
  });

  it("un serveur SANS listage lève — la source garde sa ligne d'état", async () => {
    await expect(mcpBrowseList(conn([tool("Search", props({ query: {} }))], []), null)).rejects.toThrow(
      /listage/i,
    );
  });

  it("une réponse illisible lève plutôt que de rendre une arborescence inventée", async () => {
    await expect(
      mcpBrowseList(conn([tool("ListFolder", props({ path: {} }))], ["Voici vos fichiers : Clients, Contrat.pdf"]), null),
    ).rejects.toThrow(/exploitable.*non-JSON/i);
  });
});

describe("directChildren — un listing décrit UN dossier", () => {
  const e = (id: string, kind: "dir" | "file" = "file") => ({ id, name: id.split("/").pop()!, kind, mtime: 0 });

  it("un ListFolder RÉCURSIF perd ses petits-enfants", () => {
    // Le bug vécu : le fichier s'affichait à la racine ET dans son dossier ; replier le
    // dossier n'enlevait rien, puisque l'autre ligne n'y était pour rien.
    const recursif = [e("/Clients", "dir"), e("/Clients/devis.pdf"), e("/a.pdf")];
    expect(directChildren("", recursif).map((x) => x.id)).toEqual(["/Clients", "/a.pdf"]);
    expect(directChildren("/Clients", recursif).map((x) => x.id)).toEqual(["/Clients/devis.pdf"]);
  });

  it("la racine s'écrit indifféremment `\"\"` ou `/`, et une barre finale ne change rien", () => {
    const l = [e("/a.pdf")];
    for (const root of ["", "/"]) expect(directChildren(root, l)).toHaveLength(1);
    expect(directChildren("/Clients/", [e("/Clients/x")])).toHaveLength(1);
  });

  it("un identifiant OPAQUE (Drive, Graph) traverse intact — on ne peut rien en déduire", () => {
    const ids = [e("1AbC_dEf"), e("01BYE5!123")];
    expect(directChildren("/peu importe", ids)).toHaveLength(2);
  });
});
