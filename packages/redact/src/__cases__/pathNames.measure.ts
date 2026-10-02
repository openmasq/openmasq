/**
 * The three numbers `pathNames.test.ts` holds a floor on, measured over `PATH_CORPUS`:
 *  - LEAK     — an annotated span (or one of its words, ≥4 letters) found verbatim in the fake;
 *  - MEANING  — the share of the path's NON-sensitive words the fake still carries verbatim;
 *  - RESTORE  — the echoed path, its parent folder, its file name and the username alone,
 *               each restored by `unredact` from the conversation vault.
 */
import { pseudonymize, unredact, type Vault } from "../index";
import type { Detection } from "../types";
import { PATH_CORPUS, type PathCase } from "./pathNames.corpus";

const WORD = /\p{L}[\p{L}\p{M}'’]+/gu;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const sepOf = (p: string) => (p.includes("\\") ? "\\" : "/");

/** The username a path names, when it has the slot (`/Users/x`, `/home/x`, `C:\Users\x`). */
function usernameOf(path: string): string | undefined {
  return /^(?:\/(?:Users|home)\/|[A-Za-z]:\\Users\\)([^/\\]+)/.exec(path)?.[1];
}

/** A stand-in for the NER: names exactly the corpus's annotated people and companies (never a
 *  username, never an id), wherever they sit and whatever joins their words. */
export const oracleDetector = async (text: string): Promise<Detection[]> => {
  const out: Detection[] = [];
  for (const c of PATH_CORPUS) {
    for (const s of c.sensitive) {
      if (/\d/.test(s) || s === usernameOf(c.path)) continue;
      const re = new RegExp(`(?<![\\p{L}\\p{N}])${s.split(/\s+/).map(escape).join("[\\s_.-]")}(?![\\p{L}\\p{N}])`, "gu");
      for (const m of text.matchAll(re)) out.push({ value: m[0], category: /\s/.test(s) ? "PERSON" : "ORG" });
    }
  }
  return out;
};

export interface Score {
  leaks: string[];
  meaningKept: number;
  meaningTotal: number;
  restoreOk: number;
  restoreTotal: number;
  failures: string[];
  samples: [string, string][];
}

function leaked(c: PathCase, fake: string): string[] {
  const lower = fake.toLowerCase();
  const words = new Set((fake.match(WORD) ?? []).map((w) => w.toLowerCase()));
  const out: string[] = [];
  for (const s of c.sensitive) {
    if (lower.includes(s.toLowerCase())) out.push(s);
    else for (const w of s.match(WORD) ?? []) if (w.length >= 4 && words.has(w.toLowerCase())) out.push(w);
  }
  return out;
}

function meaning(c: PathCase, fake: string): [number, number] {
  let body = c.path.replace(/\.[A-Za-z0-9]{1,8}$/, "");
  for (const s of c.sensitive) body = body.split(s).join(" ");
  const fakeWords = new Set(fake.match(WORD) ?? []);
  const words = body.match(WORD) ?? [];
  return [words.filter((w) => fakeWords.has(w)).length, words.length];
}

export async function scoreCorpus(options: Parameters<typeof pseudonymize>[1]): Promise<Score> {
  const score: Score = { leaks: [], meaningKept: 0, meaningTotal: 0, restoreOk: 0, restoreTotal: 0, failures: [], samples: [] };
  const vault: Vault = {};
  for (const c of PATH_CORPUS) {
    const { text: fake } = await pseudonymize(c.path, { ...options, vault });
    score.samples.push([c.path, fake]);
    for (const l of leaked(c, fake)) score.leaks.push(`${l} ← ${fake}`);
    const [kept, total] = meaning(c, fake);
    score.meaningKept += kept;
    score.meaningTotal += total;
    const sep = sepOf(c.path);
    const cut = (p: string) => [p.slice(0, p.lastIndexOf(sep)), p.slice(p.lastIndexOf(sep) + 1)];
    const [realDir, realBase] = cut(c.path);
    const [fakeDir, fakeBase] = cut(fake);
    const checks: [string, string][] = [
      [fake, c.path],
      [fakeDir, realDir],
      [fakeBase, realBase],
    ];
    const user = usernameOf(c.path);
    const fakeUser = usernameOf(fake);
    if (user && fakeUser) checks.push([fakeUser, user]);
    for (const [f, real] of checks) {
      score.restoreTotal++;
      if (unredact(f, vault) === real) score.restoreOk++;
      else score.failures.push(`${f} → ${unredact(f, vault)} (want ${real})`);
    }
  }
  return score;
}
