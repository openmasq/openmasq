import { freeName } from "./claudeSkills";

/** What the import screen returns, sorted by the user line by line. */
export interface ImportChoice {
  name: string;
  desc: string;
  prompt: string;
  /** This skill looks like a ROUTINE (it drives tools) — a guess by the app that
   *  the preview lets you correct line by line. It no longer decides a destination
   *  LIST (there's only one), only the category the compétence is filed under. */
  asWorkflow: boolean;
}

export interface ImportTargets {
  /** Names ALREADY taken — an import never overwrites what the user has written. */
  competenceNames: readonly string[];
  addCompetence?: (input: {
    name: string;
    prompt: string;
    desc?: string;
    cat: string;
    servers?: string[];
  }) => void;
}

/**
 * File an imported batch — the SAME operation, whichever screen the import starts from.
 *
 * ⚠️ This file existed for a reason that disappeared with the merge: there used to be TWO
 * destination lists, each screen only knew its own, and an incoming name was only
 * compared against the wrong one — so a second routine could be born
 * bearing exactly the name of an existing one, when the name is what you find it by. There
 * is now only one list, so only one set of taken names: the bug class is
 * closed by construction, and all that's left here is freeing up the name.
 *
 * ⚠️ No `servers` is ever guessed: a Claude skill names none of the app's connectors, and
 * inventing one would attach the routine to a service the person may not have
 * connected. The « looks like a routine » guess therefore never goes further than the
 * CATEGORY, which is corrected from a menu.
 *
 * Nothing is ever overwritten: a taken name gets « (2) », so re-running an import carries no
 * risk for what the user has since modified.
 */
export function applySkillImport(items: readonly ImportChoice[], t: ImportTargets): void {
  const taken = new Set(t.competenceNames);
  for (const it of items) {
    const name = freeName(it.name, taken);
    taken.add(name);
    t.addCompetence?.({
      name,
      prompt: it.prompt,
      desc: it.desc,
      cat: it.asWorkflow ? "routine" : "redaction",
    });
  }
}
