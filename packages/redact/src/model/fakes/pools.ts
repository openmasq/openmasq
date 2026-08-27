import { nameGender } from "../gender";

// Small fake-data pools (locale-light, recognisably synthetic). First names are
// GENDERED so a fake can keep the real name's gender (see `firstNamePool` + `gender.ts`)
// — else the model derives a wrong honorific/pronoun/agreement (Madame/née/elle for a
// male "Julien" faked "Lucie") that can't be reversed.
//
// ⚠️ **RARE ON PURPOSE, and it is a correctness property — not a style choice.**
// NAME and EMAIL are EXEMPT from `collidesAvoid` (`allocate.ts` `skipAvoid`): the
// canonical-reuse machinery must not be perturbed, so a name fake is guarded only against
// the words of the CURRENT input (`mintTaken`), never against what the user types three
// messages LATER. The pool is therefore the whole defence, and a COMMON name in it is a
// live collision:
//
//   • the fake IS an ordinary word — « Rose », « Jade », « Petit », « Roux ». The user
//     later writes "un dossier petit format" and the global vault re-redacted it, or the
//     reverse pass rewrites the ordinary word into someone's real value;
//   • the fake is one of the MOST COMMON French names — « Martin », « Bernard »,
//     « Dubois », « Claire ». A conversation about a team routinely contains a REAL
//     Martin, so the fake minted for someone else collides with a real person, and the
//     restore hands one person's value to the other;
//   • the fake is FAMOUS. The notoriety filter never redacts a public figure, so a fake
//     that reads as one sends a browsing model researching the wrong person — the exact
//     failure the ORG roots were fixed for (« Tyrell Corp » → Blade Runner lore). The
//     old pools composed « Paul Simon » out of two innocuous halves;
//   • the fake is a STOPWORD (« Petit »). `identity/name.ts` `isNamePart` refuses to
//     alias one, so the person silently SPLITS into two identities on their next short
//     form — the pool was feeding the allocator a name it could not use.
//
// So: real French names, unmistakably names, but statistically rare; ≥5 characters (a
// ≤3-char single word is `isRisky` in `unredact` and only restores on an exact case, and
// short fakes glue inside other words); FIRST and LAST pools DISJOINT (« Simon » sat in
// both, so a fake could be « Simon Simon »). All four rules are mechanical, and
// `fakeNamePools.test.ts` is where they are enforced — add a name THERE first.
export const FAKE_FIRST_M = [
  "Amaury", "Anselme", "Aurèle", "Aymeric", "Basile", "Célestin", "Eudes", "Firmin",
  "Ghislain", "Gontran", "Hilaire", "Landry", "Lubin", "Séverin", "Thibaud", "Valère",
];
export const FAKE_FIRST_F = [
  "Armelle", "Bathilde", "Blandine", "Clotilde", "Domitille", "Eulalie", "Gwenola",
  "Hortense", "Isaure", "Mahaut", "Ninon", "Odile", "Sidonie", "Solange", "Tiphaine",
  "Violaine",
];
/** Union — used where gender is unknown/irrelevant (fallback, length variety). */
export const FAKE_FIRST = [...FAKE_FIRST_M, ...FAKE_FIRST_F];

/**
 * The first-name pool matching the REAL first name's gender (`m`→male, `f`→female,
 * unknown/unisex→the union). So a same-gender fake keeps the derived attributes
 * (Monsieur/né/il vs Madame/née/elle) correct — nothing to reverse.
 */
export function firstNamePool(realFirst: string): string[] {
  const g = nameGender(realFirst);
  return g === "m" ? FAKE_FIRST_M : g === "f" ? FAKE_FIRST_F : FAKE_FIRST;
}
/** Mêmes règles que les prénoms (voir plus haut) : patronymes français RÉELS mais rares,
 *  aucun mot ordinaire, aucun homonyme de personnalité, disjoints des prénoms. Les
 *  quatorze précédents étaient le palmarès des noms les plus portés en France — donc les
 *  plus susceptibles d'être aussi ceux d'une vraie personne dans la même conversation. */
export const FAKE_LAST = [
  "Aubertin", "Bouchereau", "Cazenave", "Chastanet", "Delsart", "Fressineau",
  "Grandjean", "Guilbaud", "Hennequin", "Lachaud", "Mabille", "Malbrancq",
  "Ouvrard", "Pilorget", "Quémener", "Sauvestre",
];
// Fake-company names are COMBINATORIAL: invented roots × common legal/type suffixes.
// The old pool was 30 FIXED names partitioned by exact length — 1 to 3 candidates per
// length — so the allocator's 60-attempt retry loop explored ≤3 names, every second
// same-length company in a document cascaded into the suffixed fallback («Brantley
// Systems-2/-3/-4»), and across conversations the same handful of fakes recurred no
// matter the salt (a single-candidate length made the fake a pure function of length).
// Roots × suffixes gives ~640 names across lengths 4-23 while staying curated.
//
// ⚠️ Roots are INVENTED on purpose — NOT famous real OR fictional brands. The pool used
// to be Acme/Hooli/Globex/Cyberdyne/Tyrell Corp/Oscorp/Umbrella/Weyland-Yutani/Stark
// Industries…, which a browser/search AGENT RECOGNISES: given "Tyrell Corp" as the
// subject to research, the model went off and searched "Tyrell Corporation Blade
// Runner fictional corporation" — pulling in real Blade Runner lore instead of the
// user's actual company. An obscure invented name carries no such associations. Keep
// new roots invented + obscure (`fakes.test.ts` pins the famous-brand ban).
//
// ⚠️ Every multi-word combination must END in a `GENERIC_ORG_WORD` suffix
// (`../orgFragments.ts`) or the fake-fragment guard stops recognising it as a company —
// add suffixes THERE first. And ONE identity per ROOT per conversation (the
// `fakeWordIndex` word guard), so the real per-conversation capacity is ROOTS.length,
// not the full combination count — grow ROOTS, not SUFFIXES, for more capacity.
export const ORG_ROOTS = [
  "Voxa", "Nuvel", "Kelby", "Vantel", "Ostrel", "Ardenco", "Velmara", "Trivell",
  "Calderis", "Halbrook", "Verdanta", "Northmoor", "Corvanics", "Brightpath",
  "Marnco", "Oslen", "Norwood", "Fenwick", "Corvane", "Ashborne", "Delvane",
  "Brantley", "Ashcombe",
  "Torvel", "Vostrim", "Quillon", "Merova", "Selwick", "Ambrell", "Nerivo",
  "Solvane", "Kestrion", "Marovel", "Duneval", "Ostrave", "Fabrion", "Weldora",
  "Perbeck", "Anverell", "Cormedan",
];
export const ORG_SUFFIXES = [
  "", " Labs", " Group", " Systems", " Works", " Partners", " Logistics",
  " Industries", " Solutions", " Analytics", " Consulting", " Holdings",
  " Ventures", " Capital", " Technologies", " & Co",
];
/** The full combinatorial pool, in a STABLE order (root-major) — the pick is
 *  `hash % length`, so reordering would silently remap every org fake. */
export const FAKE_ORG: string[] = ORG_ROOTS.flatMap((r) => ORG_SUFFIXES.map((s) => r + s));
// Real French cities paired with a REAL postal code AND their region, so a faked
// city/postcode is a genuine, internally-consistent place (just not the user's) AND
// can be picked in the SAME region as the original (a Breton letter stays Breton —
// plausible). Several communes per region + varied name lengths so a same-length /
// same-region real city can usually be chosen. `region` names match frGeo `REGIONS`.
export interface FakePlace { city: string; cp: string; region: string }
export const FAKE_PLACES: FakePlace[] = [
  { city: "Paris", cp: "75001", region: "Île-de-France" }, { city: "Versailles", cp: "78000", region: "Île-de-France" }, { city: "Nanterre", cp: "92000", region: "Île-de-France" }, { city: "Créteil", cp: "94000", region: "Île-de-France" }, { city: "Melun", cp: "77000", region: "Île-de-France" }, { city: "Cergy", cp: "95000", region: "Île-de-France" },
  { city: "Lyon", cp: "69002", region: "Auvergne-Rhône-Alpes" }, { city: "Grenoble", cp: "38000", region: "Auvergne-Rhône-Alpes" }, { city: "Clermont-Ferrand", cp: "63000", region: "Auvergne-Rhône-Alpes" }, { city: "Annecy", cp: "74000", region: "Auvergne-Rhône-Alpes" }, { city: "Valence", cp: "26000", region: "Auvergne-Rhône-Alpes" }, { city: "Chambéry", cp: "73000", region: "Auvergne-Rhône-Alpes" },
  { city: "Dijon", cp: "21000", region: "Bourgogne-Franche-Comté" }, { city: "Besançon", cp: "25000", region: "Bourgogne-Franche-Comté" }, { city: "Belfort", cp: "90000", region: "Bourgogne-Franche-Comté" }, { city: "Nevers", cp: "58000", region: "Bourgogne-Franche-Comté" }, { city: "Auxerre", cp: "89000", region: "Bourgogne-Franche-Comté" },
  { city: "Rennes", cp: "35000", region: "Bretagne" }, { city: "Brest", cp: "29200", region: "Bretagne" }, { city: "Quimper", cp: "29000", region: "Bretagne" }, { city: "Vannes", cp: "56000", region: "Bretagne" }, { city: "Lorient", cp: "56100", region: "Bretagne" }, { city: "Saint-Brieuc", cp: "22000", region: "Bretagne" },
  { city: "Tours", cp: "37000", region: "Centre-Val de Loire" }, { city: "Orléans", cp: "45000", region: "Centre-Val de Loire" }, { city: "Bourges", cp: "18000", region: "Centre-Val de Loire" }, { city: "Chartres", cp: "28000", region: "Centre-Val de Loire" }, { city: "Blois", cp: "41000", region: "Centre-Val de Loire" },
  { city: "Strasbourg", cp: "67000", region: "Grand Est" }, { city: "Metz", cp: "57000", region: "Grand Est" }, { city: "Nancy", cp: "54000", region: "Grand Est" }, { city: "Reims", cp: "51100", region: "Grand Est" }, { city: "Mulhouse", cp: "68100", region: "Grand Est" }, { city: "Troyes", cp: "10000", region: "Grand Est" },
  { city: "Lille", cp: "59000", region: "Hauts-de-France" }, { city: "Amiens", cp: "80000", region: "Hauts-de-France" }, { city: "Arras", cp: "62000", region: "Hauts-de-France" }, { city: "Beauvais", cp: "60000", region: "Hauts-de-France" }, { city: "Roubaix", cp: "59100", region: "Hauts-de-France" },
  { city: "Rouen", cp: "76000", region: "Normandie" }, { city: "Caen", cp: "14000", region: "Normandie" }, { city: "Le Havre", cp: "76600", region: "Normandie" }, { city: "Évreux", cp: "27000", region: "Normandie" }, { city: "Cherbourg", cp: "50100", region: "Normandie" },
  { city: "Bordeaux", cp: "33000", region: "Nouvelle-Aquitaine" }, { city: "Poitiers", cp: "86000", region: "Nouvelle-Aquitaine" }, { city: "Limoges", cp: "87000", region: "Nouvelle-Aquitaine" }, { city: "Pau", cp: "64000", region: "Nouvelle-Aquitaine" }, { city: "La Rochelle", cp: "17000", region: "Nouvelle-Aquitaine" }, { city: "Niort", cp: "79000", region: "Nouvelle-Aquitaine" }, { city: "Angoulême", cp: "16000", region: "Nouvelle-Aquitaine" },
  { city: "Toulouse", cp: "31000", region: "Occitanie" }, { city: "Montpellier", cp: "34000", region: "Occitanie" }, { city: "Nîmes", cp: "30000", region: "Occitanie" }, { city: "Perpignan", cp: "66000", region: "Occitanie" }, { city: "Carcassonne", cp: "11000", region: "Occitanie" }, { city: "Albi", cp: "81000", region: "Occitanie" }, { city: "Tarbes", cp: "65000", region: "Occitanie" },
  { city: "Nantes", cp: "44000", region: "Pays de la Loire" }, { city: "Angers", cp: "49000", region: "Pays de la Loire" }, { city: "Le Mans", cp: "72000", region: "Pays de la Loire" }, { city: "Laval", cp: "53000", region: "Pays de la Loire" }, { city: "La Roche-sur-Yon", cp: "85000", region: "Pays de la Loire" },
  { city: "Marseille", cp: "13006", region: "Provence-Alpes-Côte d'Azur" }, { city: "Nice", cp: "06000", region: "Provence-Alpes-Côte d'Azur" }, { city: "Toulon", cp: "83000", region: "Provence-Alpes-Côte d'Azur" }, { city: "Avignon", cp: "84000", region: "Provence-Alpes-Côte d'Azur" }, { city: "Aix-en-Provence", cp: "13100", region: "Provence-Alpes-Côte d'Azur" }, { city: "Gap", cp: "05000", region: "Provence-Alpes-Côte d'Azur" },
  { city: "Ajaccio", cp: "20000", region: "Corse" }, { city: "Bastia", cp: "20200", region: "Corse" },
];

// ⚠️ INVENTED domains, on purpose — same rule as the ORG roots above, and it is a
// correctness property, not style. The pool used to be the real big providers
// (gmail.com, outlook.com, proton.me…), and a REAL domain as a fake poisons the vault
// both ways: the alias `gmail.com → <someone's real domain>` rewrites every honest
// later mention of Gmail into that value, and a model that legitimately types
// "gmail.com" in its reply gets it "restored" into a stranger's domain. An invented,
// mail-provider-shaped domain is never spontaneously typed, so neither corruption can
// occur — `notoriousDomains.test.ts` pins the disjointness with the real-provider and
// notoriety lists. Believability holds (plausible small-provider names, natural-length
// local parts), which is what stops weak models from "correcting" the fake.
// A NOTORIOUS real domain isn't even swapped under the commercial dispensation — it is
// KEPT verbatim (`identity/email.ts`); this pool serves the identifying-domain case.
export const FAKE_EMAIL_DOMAINS = [
  "@melvio.com", "@ordimel.fr", "@postelio.com", "@courlys.fr", "@mailvane.com",
  "@brevanet.fr", "@ecrimel.com", "@messadora.com", "@plumtel.net", "@telmiot.net",
];
