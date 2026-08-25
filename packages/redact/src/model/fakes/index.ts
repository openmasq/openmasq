// Believable fake-data generation for the pseudonymisation engine: each sensitive
// span is swapped for synthetic data of the same KIND and (where it makes sense) the
// same LENGTH as the original. Split by concern (hard rule 2) behind this barrel, so
// `./fakes` importers are unchanged:
//   pools.ts      — the fake-data pools (names/orgs/places/email domains) + firstNamePool
//   primitives.ts — hashString/pick/fitLen/fakeToken/fakeDigits (low-level generators)
//   entities.ts   — fakeCity/fakeOrg/fakePostal/fakeDate/fakeIp/fakeEmail (per-kind)
//   paths.ts      — fakePath/splitPath/fakePathSegment (filesystem paths)
//   dispatch.ts   — fakeFor (the per-category switch)
// ⚠️ FAKE_ORG / the place pool are INVENTED + OBSCURE on purpose (see pools.ts) — a
// browser/search agent recognises a famous fake, so keep new entries obscure.
export * from "./pools";
export * from "./primitives";
export * from "./entities";
export * from "./paths";
export * from "./dispatch";
