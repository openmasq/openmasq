import { describe, expect, it } from "vitest";
import { skillsFromPaths } from "./skillsFromPaths";

const f = (path: string, text = "corps") => ({ path, text });

describe("skillsFromPaths", () => {
  it("prend un dossier porteur d'un SKILL.md, et le nomme par son dossier", () => {
    const out = skillsFromPaths([f("skills/relecture/SKILL.md", "Relis.")]);
    expect(out).toEqual([{ folder: "relecture", text: "Relis.", siblings: [] }]);
  });

  it("range les autres fichiers du dossier en ANNEXES", () => {
    const out = skillsFromPaths([
      f("design-system/SKILL.md", "Lis readme.md."),
      f("design-system/readme.md"),
      f("design-system/tokens/colors.css"),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].siblings).toEqual(["readme.md"]);
  });

  // Le piège du dépôt de `~/.claude/skills` : il embarque des dossiers de documentation
  // entiers. Les prendre pour des compétences en fabriquerait dix que personne n'a écrites.
  it("IGNORE un dossier de .md sans SKILL.md", () => {
    const out = skillsFromPaths([
      f("_lifecycles/rules.md"),
      f("_lifecycles/release.md"),
      f("relecture/SKILL.md", "Relis."),
    ]);
    expect(out.map((s) => s.folder)).toEqual(["relecture"]);
  });

  it("un readme À CÔTÉ d'un SKILL.md est une annexe, jamais une compétence", () => {
    const out = skillsFromPaths([f("a/SKILL.md"), f("a/readme.md")]);
    expect(out).toHaveLength(1);
  });

  // On a déposé CE fichier : il est l'objet du geste, même sans dossier ni frontmatter.
  it("accepte un .md déposé à la RACINE de la sélection", () => {
    const out = skillsFromPaths([f("mon-prompt.md", "Fais ceci.")]);
    expect(out).toEqual([{ folder: "mon-prompt", text: "Fais ceci.", siblings: [] }]);
  });

  it("un SKILL.md déposé seul garde un nom utilisable", () => {
    expect(skillsFromPaths([f("SKILL.md", "x")])[0].folder).toBe("skill");
  });

  it("normalise les séparateurs Windows et les préfixes ./", () => {
    const out = skillsFromPaths([f(".\\skills\\a\\SKILL.md", "x")]);
    expect(out[0].folder).toBe("a");
  });

  it("écarte les fichiers cachés", () => {
    const out = skillsFromPaths([f("a/SKILL.md"), f("a/.DS_Store"), f(".hidden.md")]);
    expect(out).toHaveLength(1);
    expect(out[0].siblings).toEqual([]);
  });

  it("plusieurs compétences dans un même dépôt", () => {
    const out = skillsFromPaths([
      f("skills/a/SKILL.md", "A"),
      f("skills/b/SKILL.md", "B"),
      f("skills/b/notes.md"),
    ]);
    expect(out.map((s) => s.folder).sort()).toEqual(["a", "b"]);
  });
});
