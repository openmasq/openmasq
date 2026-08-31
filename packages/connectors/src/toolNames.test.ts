import { describe, expect, it } from "vitest";
import { CONNECTORS } from "./index";

/**
 * **A tool's name is its contract, not a label.**
 *
 * The agentic loop (`@openmasq/ui`) classifies read-vs-write on the HEAD VERB of the
 * bare name, and this classification decides three things at once: whether a
 * confirmation card is shown, whether the call goes out in parallel with the turn's other
 * reads, and whether the model is prompted to group its reads.
 *
 * These connectors run IN our process: the name is ours, so the mistake is
 * ours. `run_report` (a GA4 report, a read) passed for an execution — the
 * user confirmed every report, and nothing got parallelized. Hence this safeguard,
 * which lives here rather than on the classifier's side: `@openmasq/ui` doesn't depend on this
 * package, and a test that copied the list of names would go stale the day of a rename.
 */

/** Head verbs that the loop reads as "this executes something". No READ tool
 *  should carry one; a tool that truly executes is an exception to
 *  add here, knowingly. */
const EXECUTION_HEAD = /^(run|exec|execute|perform|apply|invoke|trigger)[_-]/i;

describe("les noms d'outils des connecteurs directs", () => {
  const tools = CONNECTORS.flatMap((c) => c.tools.map((t) => `${c.id}__${t.name}`));

  it("aucun ne commence par un verbe d'exécution", () => {
    expect(tools.filter((n) => EXECUTION_HEAD.test(n.split("__")[1]!))).toEqual([]);
  });

  it("le rapport GA4 s'appelle bien par un verbe de LECTURE", () => {
    expect(tools).toContain("google-analytics__get_report");
  });

  it("chaque nom est en snake_case minuscule — le classifieur découpe là-dessus", () => {
    for (const n of tools) expect(n.split("__")[1]!).toMatch(/^[a-z][a-z0-9_]*$/);
  });
});
