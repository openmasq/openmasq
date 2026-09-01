// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mount } from "../../../testKit";
import { MarkdownDocContext } from "../context";
import { SkillProposalCard } from "./SkillProposalCard";
import type { ProposedSkill } from "../../../suggestions/proposedSkill";

/**
 * The card's contract, in three points that are all DECISIONS, not layout:
 * nothing is added without a click, a block still being written cannot be added,
 * and a second click cannot create a duplicate.
 */

const COMP = `# Compte rendu
description: Structure un compte rendu.
catégorie: redaction
---
Tu rédiges un compte rendu de {réunion}.`;

function monter(
  text: string,
  onAddSkill?: (s: ProposedSkill) => boolean,
  kind: "competence" | "workflow" = "competence",
  isSkillAdded?: (s: ProposedSkill) => boolean,
) {
  return mount(
    <MarkdownDocContext.Provider value={{ onAddSkill, isSkillAdded }}>
      <SkillProposalCard kind={kind} text={text} />
    </MarkdownDocContext.Provider>,
  );
}

describe("SkillCard", () => {
  it("montre le nom, la description et la catégorie", async () => {
    const m = await monter(COMP, () => true);
    expect(m.el.textContent).toContain("Compte rendu");
    expect(m.el.textContent).toContain("Structure un compte rendu.");
    expect(m.el.textContent).toContain("Rédaction");
    await m.unmount();
  });

  it("n'ajoute RIEN tant qu'on ne clique pas", async () => {
    const vus: ProposedSkill[] = [];
    const m = await monter(COMP, (s) => (vus.push(s), true));
    expect(vus).toEqual([]);
    await m.unmount();
  });

  it("le clic transmet le skill parsé, et le bouton se fige", async () => {
    const vus: ProposedSkill[] = [];
    const m = await monter(COMP, (s) => (vus.push(s), true));
    await m.click(".btn-primary");

    expect(vus).toHaveLength(1);
    expect(vus[0]).toMatchObject({ kind: "competence", name: "Compte rendu", cat: "redaction" });
    expect(vus[0].prompt).toContain("{réunion}");
    expect(m.el.textContent).toContain("Ajouté");

    // A second click cannot create a duplicate — the button is disabled.
    await m.click(".btn-primary");
    expect(vus).toHaveLength(1);
    await m.unmount();
  });

  it("un bloc INCOMPLET se lit mais n'offre pas le bouton", async () => {
    const m = await monter("# Compte rendu\ndescription: D", () => true);
    expect(m.el.textContent).toContain("Compte rendu");
    expect(m.findAll(".btn-primary")).toHaveLength(0);
    await m.unmount();
  });

  it("sans `onAddSkill` (bulle en flux, aperçu) la carte reste lisible et n'agit pas", async () => {
    const m = await monter(COMP, undefined);
    expect(m.el.textContent).toContain("Compte rendu");
    expect(m.findAll(".btn-primary")).toHaveLength(0);
    await m.unmount();
  });

  it("un workflow montre ses connecteurs et part vers le bon rail", async () => {
    const vus: ProposedSkill[] = [];
    const m = await monter(
      "# Tri des mails\nconnecteurs: gmail\n---\nTrie ma boîte {période}.",
      (s) => (vus.push(s), true),
      "workflow",
    );
    expect(m.el.textContent).toContain("Workflow");
    await m.click(".btn-primary");
    expect(vus[0]).toMatchObject({ kind: "workflow", servers: ["gmail"] });
    await m.unmount();
  });

  it("un refus du store laisse le bouton actif — l'utilisateur peut réessayer", async () => {
    const m = await monter(COMP, () => false);
    await m.click(".btn-primary");
    expect(m.el.textContent).not.toContain("Ajouté");
    await m.unmount();
  });
});

describe("« Ajouté » est dérivé de la LISTE — le remount ne réarme pas le bouton (13/08)", () => {
  it("une proposition déjà dans la liste monte directement figée « Ajouté »", async () => {
    // The message list is VIRTUALIZED: the card remounts on scroll. With a lone
    // instance state, it remounted with an active button and every re-click created a duplicate.
    const onAddSkill = () => {
      throw new Error("ne doit jamais être appelable sur une carte déjà ajoutée");
    };
    const m = await monter(COMP, onAddSkill, "competence", () => true);
    const btn = [...m.el.querySelectorAll("button")].find((b) => /Ajouté/.test(b.textContent ?? ""));
    expect(btn).toBeTruthy();
    expect(btn!.disabled).toBe(true);
    expect(m.el.textContent).not.toContain(">Ajouter<");
  });

  it("absente de la liste : « Ajouter » actif, comme avant", async () => {
    const m = await monter(COMP, () => true, "competence", () => false);
    const btn = [...m.el.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === "Ajouter");
    expect(btn).toBeTruthy();
    expect(btn!.disabled).toBe(false);
  });
});
