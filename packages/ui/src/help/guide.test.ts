import { describe, expect, it } from "vitest";
import { getMessages, LOCALES } from "@openmasq/i18n";
import { guideChapters, sectionGuide, sectionGuides, sectionSubtitle } from "./index";
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

/** Toute la prose d'une langue, mise bout à bout — ce qu'un utilisateur LIT. */
const proseOf = (locale: Parameters<typeof getMessages>[0]) =>
  guideChapters(getMessages(locale))
    .flatMap((c) => [
      c.title,
      c.lead,
      ...(c.points ?? []),
      ...(c.terms ?? []).flatMap((x) => [x.term, x.def]),
    ])
    .join(" ");

describe("le guide décrit l'app RÉELLE", () => {
  it.each(LOCALES)(
    "[%s] couvre exactement les sections navigables — une section ajoutée sans être expliquée casse ici",
    (locale) => {
      expect(sectionGuides(getMessages(locale)).map((s) => s.id).sort()).toEqual([...NAVIGABLE].sort());
    },
  );

  it.each(LOCALES)(
    "[%s] chaque section dit son nom ET son usage — une infobulle qui répète le libellé n'apprend rien",
    (locale) => {
      for (const s of sectionGuides(getMessages(locale))) {
        expect(s.label.length, s.id).toBeGreaterThan(2);
        // The tip must carry MORE than the label (that was the whole defect).
        expect(s.tip.length, `${s.id}: l'infobulle doit expliquer, pas répéter`).toBeGreaterThan(
          s.label.length + 12,
        );
        expect(s.tip.startsWith(s.label), `${s.id}: l'infobulle commence par le libellé`).toBe(true);
        expect(s.guide.length, s.id).toBeGreaterThan(60);
      }
    },
  );

  it.each(LOCALES)(
    "[%s] toute section AYANT un en-tête de page a son sous-titre (les 5 pages le lisent d'ici)",
    (locale) => {
      const t = getMessages(locale);
      for (const id of ["library", "competences", "memory", "vault"] as const) {
        expect(sectionSubtitle(id, t), id).not.toBe("");
      }
      // `chats` n'a pas d'en-tête : ne jamais inventer une phrase que rien n'affiche.
      expect(sectionGuide("chats", t)?.subtitle).toBeUndefined();
      expect(sectionGuide("settings", t)).toBeUndefined();
    },
  );

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

  it.each(LOCALES)("[%s] le guide reste un GUIDE : de vraies phrases, jamais un fragment", (locale) => {
    const chapters = guideChapters(getMessages(locale));
    expect(chapters.length).toBeGreaterThanOrEqual(4);
    for (const c of chapters) {
      expect(c.lead.length, c.id).toBeGreaterThan(60);
      expect(c.lead.trim().endsWith("."), `${c.id}: phrase complète`).toBe(true);
      expect(c.title.trim(), c.id).not.toBe("");
    }
  });

  it.each(LOCALES)("[%s] aucun terme d'IMPLÉMENTATION devant l'utilisateur", (locale) => {
    const prose = proseOf(locale);
    // Ceux-ci ne sont d'aucune langue : ce sont des noms de nos entrailles (règle 8).
    for (const banned of ["MCP", "packages/", "IPC", "localStorage"]) {
      expect(prose, `terme technique dans le guide : ${banned}`).not.toContain(banned);
    }
  });

  it("le guide FRANÇAIS n'emprunte pas le vocabulaire anglais du code", () => {
    // « vault » et « API » sont justes en anglais et faux en français : la liste est donc
    // par langue, pas commune. Une liste unique interdirait à la version anglaise d'écrire
    // « The vault », qui est précisément le mot de son lexique.
    const prose = proseOf("fr");
    for (const banned of ["vault", "API", "redaction."]) {
      expect(prose, `anglicisme ou coquille dans le guide FR : ${banned}`).not.toContain(banned);
    }
  });

  it.each([
    ["fr", /redact/i],
    ["en", /mask/i],
  ] as const)("[%s] le mot du produit est DÉFINI, pas seulement employé", (locale, word) => {
    const chapters = guideChapters(getMessages(locale));
    const lexicon = chapters.flatMap((c) => c.terms ?? []);
    expect(lexicon.some((x) => word.test(x.term))).toBe(true);
    // …et expliqué dès le premier chapitre, avant d'être réutilisé partout.
    expect(chapters[0].lead).toMatch(word);
  });
});
