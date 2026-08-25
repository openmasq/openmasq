// FAKE-WORD collision index — no word may serve two identities.
//
// Measured incident (real conversation log): a CSV drop minted the fakes «20000 Ajaccio»,
// «…76000 Rouen» and «Hugo»; the NEXT pass (the memory injection, same vault) drew from the
// same city/name pools and minted «Ajaccio», «Rouen» and «hugo» as STANDALONE fakes for
// three unrelated real values. The model then answered about the CSV's fake geography —
// and un-redaction rewrote its «Rouen (76000)» into «Paris (76000)»: every short fake
// echoed by the model was restored as the OTHER identity's real value.
//
// Two holes let it through: the avoid guard indexes the vault's ORIGINALS but not its
// KEYS, and `mintTaken` lowercases the candidate but not the set («hugo» vs taken «Hugo»).
//
// This index closes the family: a candidate fake is rejected when one of its DISTINCTIVE
// words (≥3 letters, generic org/street/geo connectors exempt) is already a word of an
// existing fake — case-insensitively, in BOTH directions (a new «Ajaccio» against a taken
// «20000 Ajaccio», and a new «20000 Ajaccio» against a taken «Ajaccio»).
//
// ⚠️ ONE deliberate exemption: the SAME place. Block-coherent geo fakes WANT «Beauvais»
// and «60000 Beauvais» to coexist when both stand for the same real place («Villejuif» /
// «94800 Villejuif») — un-redaction of either is then correct. The clash is only a clash
// when the two reals are unrelated (neither contains the other), which is exactly the
// corruption case.
import type { Vault } from "../../types";
import { GENERIC_ORG_WORD } from "../orgFragments";

/** Words that repeat across unrelated fakes BY DESIGN (street types, geo connectors,
 *  org suffixes) — indexing them would demand fully-disjoint word sets across a whole
 *  batch of address fakes and exhaust the pools for nothing: a generic word echoed
 *  alone never un-redacts (it is never a whole vault key). */
const CONNECTOR_WORD = new Set([
  "rue", "avenue", "boulevard", "chemin", "impasse", "allee", "place", "cours", "quai",
  "route", "sentier", "esplanade", "square", "passage", "hameau", "lieu", "dit",
  "saint", "sainte", "les", "des", "sur", "sous", "bis", "ter",
  "street", "road", "lane", "drive", "court",
]);

const WORD = /\p{L}[\p{L}\p{M}'’-]*/gu;
const fold = (w: string) => w.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase();

function distinctiveWords(s: string): string[] {
  const out: string[] = [];
  for (const w of s.match(WORD) ?? [])
    for (const seg of [w, ...w.split(/['’]/)]) { // elision: «l'Yonne» also yields «Yonne»
      const f = fold(seg);
      if (f.length >= 3 && !GENERIC_ORG_WORD.has(f) && !CONNECTOR_WORD.has(f)) out.push(f);
    }
  return out;
}

/** True when the two reals describe the same PLACE. Two forms, both sanctionnées :
 *  l'inclusion («Rennes» ⊂ «35760 Rennes»), et la même VILLE nommée en queue d'adresse —
 *  « 14 cours de l'Intendance, 33000 Bordeaux » / « 5 rue du Loup, 33000 Bordeaux ».
 *  La seconde est ce que l'ancrage par ville (`engine/geo/cityAnchor`) produit à dessein :
 *  la même ville réelle reçoit le même lieu faux, donc deux adresses de cette ville
 *  PARTAGENT le mot de ville de leur faux — et la restitution de l'un comme de l'autre
 *  reste juste, puisque leurs réels partagent ce mot aussi. Sans cette moitié, l'ancre et
 *  l'index se contredisaient : la ville ancrée clashait à CHAQUE tentative (elle ne varie
 *  plus), 60 échecs, et la seconde adresse tombait sur le repli « redacted ». */
function samePlace(a: string, b: string): boolean {
  const [fa, fb] = [fold(a), fold(b)];
  if (fa.includes(fb) || fb.includes(fa)) return true;
  const city = (s: string) => s.match(/\b\d{4,5}\s+(\p{L}[\p{L}\s'’-]{1,40})$/u)?.[1]?.trim();
  const [ca, cb] = [city(fa), city(fb)];
  return ca !== undefined && ca === cb;
}

export class FakeWordIndex {
  /** distinctive fake word → the REAL values it already stands (in part) for. */
  private wordToReals = new Map<string, Set<string>>();

  add(fake: string, real: string): void {
    for (const w of distinctiveWords(fake)) {
      let set = this.wordToReals.get(w);
      if (!set) this.wordToReals.set(w, (set = new Set()));
      set.add(real);
    }
  }

  /** Would minting `candidate` as the fake of `real` overload a word already serving
   *  ANOTHER identity? (Same-place reals are the sanctioned coherence case.) */
  clashes(candidate: string, real: string): boolean {
    if (this.wordToReals.size === 0) return false;
    for (const w of distinctiveWords(candidate)) {
      const reals = this.wordToReals.get(w);
      if (!reals) continue;
      for (const r of reals) if (!samePlace(r, real)) return true;
    }
    return false;
  }

  /** Strict word-level membership for the NAME/EMAIL word-pickers (`mintTaken`): a NEW
   *  word-fake must not equal any word already in fake service, whatever the casing —
   *  the «hugo» minted while «Hugo» was taken. No same-place exemption: a person's
   *  word-fake never legitimately shadows another fake's word. */
  wordTaken(candidate: string): boolean {
    for (const w of distinctiveWords(candidate)) if (this.wordToReals.has(w)) return true;
    return false;
  }
}

/** Index every fake already in the vault (fake key → its real). */
export function buildFakeWordIndex(vault: Vault): FakeWordIndex {
  const idx = new FakeWordIndex();
  for (const [fake, real] of Object.entries(vault)) idx.add(fake, real);
  return idx;
}
