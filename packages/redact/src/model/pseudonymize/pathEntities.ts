/**
 * Phase 2b — what a PATH holds, found the way prose is: the distinctive segments of every
 * path candidate are read by the SAME detectors (one batched pass over a document of
 * segments, `_`/`-`/`.` read as spaces), screened by the SAME filter, completed by the
 * file-name net (`../pathText/heuristic.ts`). Each finding becomes an ordinary candidate in
 * the PATH'S OWN spelling, allocated before the path through the normal machinery — so one
 * company keeps one fake in a path and in a message, and a path the model recomposes from
 * its parts reverses part by part. `../paths.ts` then builds the fake path around them.
 *
 * Fail CLOSED: a detector that throws or signals an error marks the plan `failed`, and every
 * path falls back to the full-segment scramble — never to verbatim.
 */
import type { Detection } from "../../types";
import { redactionCategory } from "../../kinds";
import { keepSet, isKept } from "../../util";
import type { NotorietyOpts } from "../notorious";
import { splitPath, isDistinctivePathSegment, hasDistinctiveSegment } from "../fakes/paths";
import { usernameIndex, spacedForDetection, probableEntities, fakeSegmentText, occurrences, type Finding } from "../pathText";
import { gatherCandidates } from "./gather";
import type { PseudonymizeOptions } from "./options";

export interface PathPlan {
  /** Below Strict an undetected word stays verbatim; at Strict it is replaced. */
  strict: boolean;
  notoriety: NotorietyOpts;
  /** Segment detection failed ⇒ every path gets the full-segment scramble. */
  failed: boolean;
  /** The entities found inside paths (path spelling) — allocated BEFORE the paths. */
  extra: Detection[];
  /** Path value → the real entity values inside it. */
  entities: Map<string, string[]>;
  /** Paths in which nothing identifying was found: they stay verbatim (dropped). */
  unchanged: Set<string>;
}

interface Line {
  seg: string;
  text: string;
  at: number;
  paths: Set<string>;
}

const isPath = (c: Detection) => redactionCategory(c.category) === "path";

/** The distinctive, non-username segments of a path (the username has its own fake). */
function segmentsToRead(value: string): string[] {
  const { head, parts } = splitPath(value);
  const user = usernameIndex(head, parts);
  return parts.filter((s, i) => i % 2 === 0 && s && i !== user && isDistinctivePathSegment(s));
}

export async function planPathEntities(
  deNested: Detection[],
  kept: Detection[],
  options: PseudonymizeOptions,
  screen: (candidates: Detection[], doc: string) => Detection[],
): Promise<PathPlan | undefined> {
  const paths = deNested.filter(isPath).map((c) => c.value);
  if (!paths.length) return undefined;
  const plan: PathPlan = {
    // Fail closed: only an EXPLICIT non-Strict level (`peopleNotoriety: true`, which every
    // level but Strict passes) opens the verbatim residual; an unset flag masks.
    strict: options.peopleNotoriety !== true,
    notoriety: { commercial: options.commercialNotoriety === true, people: options.peopleNotoriety !== false },
    failed: false,
    extra: [],
    entities: new Map(paths.map((p) => [p, []])),
    unchanged: new Set(),
  };
  const lines = new Map<string, Line>();
  let doc = "";
  for (const p of paths) {
    for (const seg of segmentsToRead(p)) {
      const line = lines.get(seg) ?? { seg, text: spacedForDetection(seg), at: -1, paths: new Set<string>() };
      if (line.at < 0) {
        line.at = doc.length + (doc ? 2 : 0);
        doc += (doc ? "\n\n" : "") + line.text;
        lines.set(seg, line);
      }
      line.paths.add(p);
    }
  }
  let found: Detection[] = [];
  if (doc) {
    try {
      // The LLM is NOT re-asked (one extra paid call per path): what it saw in the path in
      // the main pass joins below. The local detector and every rule do re-read the segments.
      const { candidates, modelError } = await gatherCandidates(doc, { ...options, complete: undefined });
      if (modelError) plan.failed = true;
      else found = screen(candidates.filter((c) => !isPath(c)), doc);
    } catch {
      plan.failed = true;
    }
  }
  if (plan.failed) return plan;
  // The main pass's findings that sit inside a path (the LLM's, the NER's on the raw path).
  for (const k of kept) {
    if (!isPath(k) && paths.some((p) => p.includes(k.value))) found.push({ ...k, value: spacedForDetection(k.value) });
  }
  const seen = new Set(deNested.map((d) => d.value));
  const add = (line: Line, f: Finding) => {
    const real = line.seg.slice(f.start, f.end);
    for (const p of line.paths) {
      const list = plan.entities.get(p) ?? [];
      if (!list.includes(real)) list.push(real);
      plan.entities.set(p, list);
    }
    if (!seen.has(real)) {
      seen.add(real);
      plan.extra.push({ value: real, category: f.category });
    }
  };
  const claims = new Map<Line, Finding[]>();
  for (const line of lines.values()) {
    const claimed: Finding[] = [];
    for (const f of found) {
      for (const at of occurrences(line.text, f.value)) claimed.push({ start: at, end: at + f.value.length, category: f.category });
    }
    const guesses = probableEntities(line.text, claimed, plan.notoriety)
      .filter((g) => screen([{ value: line.text.slice(g.start, g.end), category: g.category }], line.text).length);
    claims.set(line, [...claimed, ...guesses]);
    for (const f of claims.get(line) ?? []) add(line, f);
  }
  // A value already masked — earlier in the conversation, or in another path of this send —
  // is masked here too, even where nothing around it gave it away (« Quillfeather SOW 3.pdf »
  // after « … - Quillfeather Analytics.pdf »): one real value, one fake, every path.
  const known = knownValues(options, plan.extra);
  for (const line of lines.values()) {
    const claimed = claims.get(line) ?? [];
    for (const [value, category] of known) {
      for (const at of occurrences(line.seg, value)) {
        const end = at + value.length;
        if (!claimed.some((c) => at < c.end && end > c.start)) add(line, { start: at, end, category });
      }
    }
  }
  for (const p of paths) if (!changes(p, plan)) plan.unchanged.add(p);
  return plan;
}

/** The real values this conversation already masks, with the words of a named person. */
function knownValues(options: PseudonymizeOptions, extra: Detection[]): [string, string][] {
  const keep = keepSet(options.keep);
  const out = new Map<string, string>();
  const put = (v: string, category: string) => {
    if (v.length >= 3 && /\p{L}/u.test(v) && !/[\\/]/.test(v) && !isKept(v, keep) && !out.has(v)) out.set(v, category);
  };
  for (const v of Object.values(options.vault ?? {})) put(v, options.kinds?.[v] ?? "NAME");
  for (const e of extra) {
    put(e.value, e.category);
    if (redactionCategory(e.category) === "name") {
      for (const w of e.value.split(/[\s_.-]+/)) if (/^\p{Lu}/u.test(w) && w.length >= 4) put(w, e.category);
    }
  }
  return [...out];
}

/** Would the fake differ from the real path? (A stand-in resolver: any entity changes.) */
function changes(path: string, plan: PathPlan): boolean {
  const { head, parts } = splitPath(path);
  if (!hasDistinctiveSegment(parts)) return plan.strict; // nothing distinctive: Strict still fakes it
  const user = usernameIndex(head, parts);
  if (user >= 0 && isDistinctivePathSegment(parts[user])) return true;
  const ctx = {
    strict: plan.strict,
    notoriety: plan.notoriety,
    entities: plan.entities.get(path) ?? [],
    resolve: (v: string) => `\u0000${v}`,
    attempt: 0,
  };
  return segmentsToRead(path).some((seg) => fakeSegmentText(seg, ctx) !== seg);
}
