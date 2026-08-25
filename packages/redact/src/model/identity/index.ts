// Atomic fake IDENTITY across the conversation vault. A real person (name) or email must
// keep ONE stable fake EVERYWHERE — standalone, inside an email, in any casing, joined by
// any separator, and whether the person appears with their full name or only a fragment
// (just the surname). Without this, a tool/search RESULT that re-introduces the same person
// (Title-Cased "Julien Sabourdin", a bare "Sabourdin", a URL slug "Julien_Sabourdin") is
// re-detected by the NER as fresh PII and gets a BRAND-NEW fake every round — the "remapping
// involontaire" where one real person ends up behind a dozen unrelated fakes and the chain
// can't be reversed. Two mechanisms, mirrored for emails and plain names:
//   - `buildFake*`  constructs the fake by REUSING each token's existing canonical
//                   fake (case-insensitive) so shared tokens stay consistent;
//   - `*Aliases`    returns per-token `fake↔real` pairs (capital + lowercase) the
//                   caller registers in the vault, so every fragment/casing both
//                   substitutes to AND reverses from the SAME fake.
// Split by the SPELLING a value arrives in, each family in one file: `email.ts` (an
// address), `name.ts` (whitespace- or `.`/`_`/`-`-separated), `glued.ts` (separatorless).
export { emailNameAliases, buildFakeEmail } from "./email";
export { buildFakeName, nameAliases } from "./name";
export { reconstructGlued } from "./glued";
export { placeAliases } from "./place";
// …et les DEUX façons de retrouver le faux déjà attribué, que l'allocateur consulte avant
// d'en battre un neuf. `reconstructName` n'est plus exporté d'ici : `reuse.ts` est son seul
// appelant et l'importe directement.
export { reuseNameFake } from "./reuse";
