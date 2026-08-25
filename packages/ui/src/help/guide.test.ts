import { describe, expect, it } from "vitest";
import { GUIDE, SECTION_GUIDE, sectionGuide, sectionSubtitle } from "./index";
import { DEFAULT_SETTINGS } from "../state/storePersistence";
import { isFreeModel } from "@openmasq/llm/pricing";
import { findModelAny } from "../prompt/models";

/**
 * THE GUIDE MUST STAY TRUE. It is the app's own account of what it does with someone's
 * data, so a claim that quietly stops holding is a trust bug — and « on mettra la doc à
 * jour » is exactly the promise that decays. Everything the guide asserts and the code
 * can check is checked HERE, against the real defaults, not against a second copy.
 */

/** Sections a user can navigate to. `settings` is excluded by design (a gear needs no
 *  guide chapter, and it has its own per-tab index). Kept literal on purpose: a new
 *  section added to `types.ts` must be added HERE too, which is what makes the next
 *  test fail until the guide learns about it. */
const NAVIGABLE = ["chats", "library", "competences", "memory", "vault"] as const;

describe("le guide décrit l'app RÉELLE", () => {
  it("couvre exactement les sections navigables — une section ajoutée sans être expliquée casse ici", () => {
    expect(SECTION_GUIDE.map((s) => s.id).sort()).toEqual([...NAVIGABLE].sort());
  });

  it("chaque section dit son nom ET son usage — une infobulle qui répète le libellé n'apprend rien", () => {
    for (const s of SECTION_GUIDE) {
      expect(s.label.length, s.id).toBeGreaterThan(2);
      // The tip must carry MORE than the label (that was the whole defect).
      expect(s.tip.length, `${s.id}: l'infobulle doit expliquer, pas répéter`).toBeGreaterThan(
        s.label.length + 12,
      );
      expect(s.tip.startsWith(s.label), `${s.id}: l'infobulle commence par le libellé`).toBe(true);
      expect(s.guide.length, s.id).toBeGreaterThan(60);
    }
  });

  it("toute section AYANT un en-tête de page a son sous-titre (les 5 pages le lisent d'ici)", () => {
    for (const id of ["library", "competences", "memory", "vault"] as const) {
      expect(sectionSubtitle(id), id).not.toBe("");
    }
    // `chats` n'a pas d'en-tête : ne jamais inventer une phrase que rien n'affiche.
    expect(sectionGuide("chats")?.subtitle).toBeUndefined();
    expect(sectionGuide("settings")).toBeUndefined();
  });

  it("« un modèle gratuit est déjà sélectionné » — vrai du modèle réellement semé", () => {
    const seeded = findModelAny(DEFAULT_SETTINGS.defaultModelId);
    expect(seeded, "le modèle par défaut doit exister dans le registre").toBeTruthy();
    expect(
      isFreeModel(DEFAULT_SETTINGS.defaultModelId),
      "le guide promet zéro configuration : le modèle semé doit être gratuit",
    ).toBe(true);
  });

  it("« le repérage s'exécute sur votre machine » — vrai du moteur réellement actif", () => {
    expect(DEFAULT_SETTINGS.redactEngine).toBe("local");
  });

  it("le guide reste un GUIDE : du français pour un humain, aucun terme d'implémentation", () => {
    const prose = GUIDE.flatMap((c) => [
      c.title,
      c.lead,
      ...(c.points ?? []),
      ...(c.terms ?? []).flatMap((t) => [t.term, t.def]),
    ]).join(" ");
    // Le vocabulaire interne n'a rien à faire devant l'utilisateur (règle 8).
    for (const banned of ["MCP", "vault", "packages/", "IPC", "API", "localStorage", "redaction."]) {
      expect(prose, `terme technique dans le guide : ${banned}`).not.toContain(banned);
    }
    expect(GUIDE.length).toBeGreaterThanOrEqual(4);
    // Chaque chapitre s'ouvre sur de VRAIES phrases, jamais un fragment de titre.
    for (const c of GUIDE) {
      expect(c.lead.length, c.id).toBeGreaterThan(60);
      expect(c.lead.trim().endsWith("."), `${c.id}: phrase complète`).toBe(true);
    }
  });

  it("le mot « redaction » est DÉFINI, pas seulement employé", () => {
    const lexicon = GUIDE.flatMap((c) => c.terms ?? []);
    expect(lexicon.some((t) => /redact/i.test(t.term))).toBe(true);
    // …et expliqué dès le premier chapitre, avant d'être réutilisé partout.
    expect(GUIDE[0].lead).toMatch(/redaction/i);
  });
});
