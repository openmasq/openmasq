import type { Messages } from "@openmasq/i18n";
import { BRAND } from "@openmasq/branding";
import type { Section } from "../types";

/**
 * The user-facing VOCABULARY of the content sections — label, rail tooltip, page
 * subtitle, guide paragraph, ⌘K keywords — assembled from the ONE catalogue
 * (`@openmasq/i18n`, namespace `sections`).
 *
 * Why it exists: these strings describe the same thing to the same person, and they used
 * to live in as many files. The nav said « Coffre » and the tooltip said « Coffre » — the
 * sentence that explains what a Coffre IS only existed on the page you had to already be
 * on. Single-sourcing them (rule 9) is also what keeps the in-app guide TRUE: it renders
 * these strings rather than a second description that can drift.
 *
 * ## This file ASSEMBLES, it does not author
 *
 * The copy lives in the catalogue, in French AND English; here it is resolved (the brand
 * name is injected, not written into the catalogues) and presented in the shape that
 * the screens consume. Hence the `t: Messages` every function requires: this module
 * stays PURE — no React, no context — so it's usable by a test as much as by a
 * component, which passes it its own `useT()`.
 *
 * `settings` is deliberately absent — a gear is self-evident and has its own per-tab
 * index (`pages/Settings/settingsIndex.ts`).
 */
export interface SectionGuide {
  id: Exclude<Section, "settings">;
  /** The nav label — must read identically in the rail, the sidebar and the guide. */
  label: string;
  /** Rail/sidebar tooltip: the label PLUS what it is for, in one breath. A tooltip that
   *  only repeats the label teaches nothing, and four of these six names are the app's
   *  own words. */
  tip: string;
  /** The section page's header subtitle (`PageHeader subtitle`) — absent for `chats`,
   *  which has no page header (the conversation IS the screen). Never invent one here:
   *  a string no page renders is a claim nobody can check. */
  subtitle?: string;
  /** The guide's paragraph: plain language, no product jargon, no file names. */
  guide: string;
  /** What gets TYPED into ⌘K besides the label — words, not a sentence. */
  keywords: string;
}

/**
 * The `tip` without its label prefix: « Conversations — vos échanges avec les
 * modèles » gives « vos échanges avec les modèles ».
 *
 * The first launch lists the places with their NAME right beside them: putting the name
 * back in the sentence would say it twice, and the guide paragraph (`guide`) would be six
 * times too long there. So it DERIVES from the `tip` — whose « Label — what it's
 * for » shape is a catalogue convention, pinned by `sections.test.ts` in EVERY
 * language — rather than writing a third version of the same sentence somewhere.
 */
export function sectionOneLiner(s: SectionGuide): string {
  const cut = s.tip.indexOf("—");
  return cut < 0 ? s.tip : s.tip.slice(cut + 1).trim();
}

/** The sections' vocabulary in `t`'s language, in navigation order. */
export function sectionGuides(t: Messages): readonly SectionGuide[] {
  const s = t.sections;
  return [
    { id: "chats", ...s.chats, guide: s.chats.guide(BRAND.name) },
    { id: "library", ...s.library },
    { id: "competences", ...s.competences },
    {
      id: "memory",
      ...s.memory,
      tip: s.memory.tip(BRAND.name),
      subtitle: s.memory.subtitle(BRAND.name),
    },
    { id: "vault", ...s.vault, guide: s.vault.guide(BRAND.name) },
  ] as const;
}

/** The entry for a section, or `undefined` for `settings` (which has none by design). */
export function sectionGuide(id: Section, t: Messages): SectionGuide | undefined {
  return sectionGuides(t).find((s) => s.id === (id as SectionGuide["id"]));
}

/** The page-header subtitle for a section that HAS a page header. Every caller is such a
 *  page, and `sections.test.ts` pins that each one still has its sentence — so the empty
 *  fallback is unreachable, not a silent blank. */
export function sectionSubtitle(id: SectionGuide["id"], t: Messages): string {
  return sectionGuide(id, t)?.subtitle ?? "";
}
