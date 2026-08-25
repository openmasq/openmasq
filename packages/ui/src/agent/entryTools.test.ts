import { describe, it, expect } from "vitest";
import type { McpTool } from "@openmasq/mcp";
import { isFsEntryTool, routerSawFiles, rescueEntryTools } from "./entryTools";

const t = (name: string): McpTool => ({ name, description: "", inputSchema: {} }) as McpTool;

const ALL = [
  t("local-filesystem__list_allowed_directories"),
  t("local-filesystem__list_directory"),
  t("local-filesystem__find_files"),
  t("local-filesystem__search_files"),
  t("local-filesystem__write_file"),
  t("browser__browser_navigate"),
  t("canva__list-brand-kits"),
];

describe("isFsEntryTool", () => {
  it("reconnaît les outils d'ENTRÉE, quel que soit le préfixe du connecteur", () => {
    expect(isFsEntryTool("local-filesystem__list_directory")).toBe(true);
    expect(isFsEntryTool("filesystem__find_files")).toBe(true);
    expect(isFsEntryTool("local-filesystem__list_allowed_directories")).toBe(true);
  });

  it("n'attrape ni une écriture, ni un outil d'un autre connecteur", () => {
    expect(isFsEntryTool("local-filesystem__write_file")).toBe(false);
    expect(isFsEntryTool("canva__list-brand-kits")).toBe(false);
  });
});

describe("routerSawFiles — l'évidence vient du routeur, pas d'une seconde heuristique", () => {
  it("un seul outil de fichiers suffit", () => {
    expect(routerSawFiles([t("local-filesystem__search_files")])).toBe(true);
  });

  it("aucun outil de fichiers ⇒ aucun rattrapage (pas de faux positif sur le texte)", () => {
    expect(routerSawFiles([t("canva__list-brand-kits")])).toBe(false);
  });
});

describe("rescueEntryTools", () => {
  // LA régression (trace du 01/08/2026) : le routeur avait gardé `search_files` SEUL. Le
  // modèle ne pouvait donc qu'apparier une sous-chaîne devinée — il a deviné « fiscal »,
  // n'a rien trouvé, et a conclu qu'aucun document fiscal n'existait. Il lui manquait de
  // quoi ÉNUMÉRER et de quoi demander PAR LE SENS.
  it("complète un pick qui n'a gardé que search_files", () => {
    const out = rescueEntryTools([t("local-filesystem__search_files")], ALL, "liste les documents fiscaux");
    expect(out.map((x) => x.name)).toEqual([
      "local-filesystem__search_files",
      "local-filesystem__list_allowed_directories",
      "local-filesystem__list_directory",
      "local-filesystem__find_files",
    ]);
  });

  it("n'enlève rien et ne réordonne pas ce que le routeur a gardé", () => {
    const kept = [t("local-filesystem__find_files"), t("local-filesystem__write_file")];
    const out = rescueEntryTools(kept, ALL, "");
    expect(out.slice(0, 2).map((x) => x.name)).toEqual(kept.map((x) => x.name));
    expect(out.filter((x) => x.name === "local-filesystem__find_files")).toHaveLength(1);
  });

  it("ne touche à rien quand la demande n'est ni web ni fichiers", () => {
    const kept = [t("canva__list-brand-kits")];
    expect(rescueEntryTools(kept, ALL, "fais-moi un logo")).toEqual(kept);
  });

  it("le rattrapage WEB reste indépendant du rattrapage FICHIERS", () => {
    const out = rescueEntryTools([t("canva__list-brand-kits")], ALL, "quelle actualité en France aujourd'hui ?");
    expect(out.map((x) => x.name)).toContain("browser__browser_navigate");
    expect(out.map((x) => x.name)).not.toContain("local-filesystem__list_directory");
  });

  it("no-op quand le connecteur n'est pas branché (rien dans `all` ne correspond)", () => {
    const kept = [t("local-filesystem__search_files")];
    expect(rescueEntryTools(kept, kept, "liste mes fichiers")).toEqual(kept);
  });
});
