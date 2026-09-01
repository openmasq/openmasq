import { describe, expect, it } from "vitest";
import { freeName, parseSkill, parseSkills, splitFrontmatter } from "./claudeSkills";

const SKILL = `---
name: release-version
description: Publier une nouvelle version de bout en bout. À invoquer quand on veut « sortir une version ».
user-invocable: true
---

# Release

1. Bump la version.
2. Rédige la note.
`;

describe("splitFrontmatter", () => {
  it("sépare le frontmatter du corps", () => {
    const { fm, body } = splitFrontmatter(SKILL);
    expect(fm.name).toBe("release-version");
    expect(fm.description).toContain("Publier une nouvelle version");
    expect(body.startsWith("# Release")).toBe(true);
  });

  // A SKILL.md without frontmatter stays importable: it loses its declared name, not its
  // content. Refusing the whole file over two missing lines would be a net loss.
  it("accepte un fichier SANS frontmatter", () => {
    const { fm, body } = splitFrontmatter("Juste des instructions.");
    expect(fm).toEqual({});
    expect(body).toBe("Juste des instructions.");
  });

  it("survit à un BOM et à des guillemets autour de la valeur", () => {
    const { fm } = splitFrontmatter('﻿---\nname: "mon-skill"\n---\ncorps');
    expect(fm.name).toBe("mon-skill");
  });
});

describe("parseSkill", () => {
  it("mappe nom, description et prompt", () => {
    const s = parseSkill({ folder: "release-version", text: SKILL })!;
    expect(s.name).toBe("Release-version".replace("-", " ")); // dé-kebabisé + capitalisé
    expect(s.desc).toContain("sortir une version");
    expect(s.prompt).toContain("# Release");
    expect(s.extras).toBe(0);
    expect(s.needsFiles).toBe(false);
  });

  it("prend le nom du DOSSIER quand le frontmatter n'en donne pas", () => {
    const s = parseSkill({ folder: "compte-rendu_reunion", text: "Fais un compte rendu." })!;
    expect(s.name).toBe("Compte rendu reunion");
  });

  // The case that breaks in use: a skill whose body refers to its own files.
  // It imports all the same, but the screen must SAY so — otherwise one discovers after
  // the fact a skill that asks the model to open files that do not exist.
  it("signale un skill dont le corps renvoie à des fichiers annexes", () => {
    const s = parseSkill({
      folder: "design-system",
      text: "Read the readme.md file within this skill, and explore the other files.",
      siblings: ["readme.md", "tokens/colors.css"],
    })!;
    expect(s.needsFiles).toBe(true);
    expect(s.extras).toBe(2);
  });

  it("ne signale RIEN quand le dossier a des fichiers mais que le corps les ignore", () => {
    const s = parseSkill({
      folder: "x",
      text: "Rédige une réponse polie.",
      siblings: ["notes.md"],
    })!;
    expect(s.needsFiles).toBe(false);
  });

  it("devine « workflow » quand le corps pilote des outils, « compétence » sinon", () => {
    const wf = parseSkill({ folder: "a", text: "Cherche dans Gmail et Slack les messages du jour." })!;
    const skill = parseSkill({ folder: "b", text: "Relis ce texte et corrige la grammaire." })!;
    expect(wf.looksLikeWorkflow).toBe(true);
    expect(skill.looksLikeWorkflow).toBe(false);
  });

  it("rejette un SKILL.md sans corps — une coquille n'est pas une compétence", () => {
    expect(parseSkill({ folder: "vide", text: "---\nname: vide\n---\n" })).toBeNull();
  });
});

describe("parseSkills", () => {
  it("trie par nom et écarte les vides", () => {
    const out = parseSkills([
      { folder: "zebre", text: "Z." },
      { folder: "vide", text: "---\nname: vide\n---\n" },
      { folder: "alpha", text: "A." },
    ]);
    expect(out.map((s) => s.name)).toEqual(["Alpha", "Zebre"]);
  });
});

describe("freeName", () => {
  // The rule that makes the button safe to click twice: we never overwrite what the user
  // may have changed since the first import.
  it("suffixe au lieu d'écraser, et cherche le premier libre", () => {
    expect(freeName("Résumé", new Set())).toBe("Résumé");
    expect(freeName("Résumé", new Set(["Résumé"]))).toBe("Résumé (2)");
    expect(freeName("Résumé", new Set(["Résumé", "Résumé (2)"]))).toBe("Résumé (3)");
  });
});
