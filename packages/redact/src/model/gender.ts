// First-name → grammatical gender, so a fake NAME can keep the SAME gender as the
// real one. Without it, "Julien" (m) could be faked "Lucie" (f) → the model writes
// "Madame … née … dirigeante … elle" (derived from the fake's gender), which DOESN'T
// reverse (those are common words, not vault keys, and French agreement is pervasive).
// A same-gender fake makes the model's inference correct on the real person → nothing
// to reverse. Same design as: a fake email carries a greetable name, a fake city is a
// real city, a fake date is a valid date — the fake keeps the derived ATTRIBUTE.
//
// Lookup-only (no shaky suffix heuristics): an UNKNOWN or UNISEX name returns null and
// falls back to the any-gender pool — a random gender for an unknown name is no worse
// than today. Extend the sets; keep genuinely unisex names (Camille, Dominique, Claude,
// Sacha, Alix, Charlie, Andrea) out of BOTH so they stay null.

import { foldAccents } from "../util";
import { INSEE_MALE, INSEE_FEMALE } from "../engine/names/firstNames.insee.data";

const strip = (s: string) => foldAccents(s.trim().toLowerCase());

const MALE = new Set<string>(
  (
    "jean pierre michel andre philippe rene louis alain jacques bernard marcel daniel " +
    "roger robert paul henri georges joseph raymond francois christian gerard " +
    "julien nicolas julien maxime alexandre antoine romain kevin sebastien david olivier " +
    "vincent guillaume mathieu matthieu benjamin hugo lucas nathan leo theo gabriel " +
    "raphael arthur noah ethan adam tom jules marc luc morvan simon victor oscar gaspard " +
    "come aaron mohamed mohammed mehdi karim yanis rayan ismael samuel nael aymeric " +
    "baptiste clement corentin damien dorian enzo evan florian gaetan jordan loic mael " +
    "quentin remi thibault thibaut tristan valentin william axel bastien fabien gregory " +
    "jerome ludovic sylvain cedric anthony jonathan mickael steven bryan dylan " +
    "emmanuel patrick pascal thierry laurent frederic stephane didier eric bruno herve " +
    "yannick fabrice arnaud cyril mustapha said omar ali hassan youssef nabil bilal " +
    "elias gabin nolan liam noe aaron ayoub imran malo timothe titouan ferdinand augustin " +
    // Les prénoms des POOLS de faux (rares par construction — `fakes/pools.ts`). Sans eux
    // le lexique répond `null` sur un substitut, et une VRAIE personne portant l'un de ces
    // prénoms retombe sur le pool mixte : son faux peut changer de genre, ce qui fait
    // écrire « Madame … née … elle » sur un homme — et un accord ne se restitue pas.
    // `fakeNamePools.test.ts` épingle que chaque entrée d'un pool est classée du bon côté.
    "amaury anselme aurele aymeric basile celestin eudes firmin ghislain gontran hilaire " +
    "landry lubin severin thibaud valere"
  )
    .split(/\s+/)
    .filter(Boolean),
);

const FEMALE = new Set<string>(
  (
    "marie jeanne monique catherine francoise nathalie isabelle sylvie martine nicole " +
    "christine veronique sandrine valerie celine stephanie aurelie julie emilie laura " +
    "marion manon oceane emma lea chloe ines jade louise alice clara sarah lina lisa eva " +
    "mila rose anna mia juliette zoe agathe ambre apolline capucine charlotte elise elisa " +
    "garance margaux nina romane victoire adele anais aurore aline amelie angele beatrice " +
    "brigitte carole caroline cecile claire coralie delphine elodie estelle fanny florence " +
    "gaelle helene ingrid jessica joelle laetitia laurence lucie magali marguerite " +
    "mathilde melanie myriam nadia noemie ophelie pauline sabrina severine sonia virginie " +
    "yasmine fatima aicha leila samira nawel imane sofia sophia maryam khadija salma " +
    "louna jade lola inaya sarah lyna maelys ambre lou jeanne rose alba iris olivia " +
    "constance blanche philippine oriane albane domitille sixtine gabrielle raphaelle " +
    "veronica sabine muriel corinne chantal jacqueline ghislaine solange odette henriette " +
    // Idem côté féminin (voir la note ci-dessus).
    "armelle bathilde blandine clotilde domitille eulalie gwenola hortense isaure mahaut " +
    "ninon odile sidonie solange tiphaine violaine"
  )
    .split(/\s+/)
    .filter(Boolean),
);
/** "m" | "f" for a KNOWN gendered first name, else null (unknown / unisex). */
export function nameGender(firstName: string): "m" | "f" | null {
  const n = strip(firstName);
  if (!n) return null;
  // Try the whole name, then the FIRST part of a compound ("Jean-Pierre" → "jean",
  // "Marie-Claire" → "marie") — the lead part usually carries the gender. The curated
  // sets are consulted FIRST; the generated INSEE sets (≥95% single-sex among French
  // births, unisex names unmarked) only answer for names the curated sets don't know.
  for (const cand of [n, n.split(/[- ]/)[0]]) {
    if (MALE.has(cand)) return "m";
    if (FEMALE.has(cand)) return "f";
  }
  for (const cand of [n, n.split(/[- ]/)[0]]) {
    if (INSEE_MALE.has(cand)) return "m";
    if (INSEE_FEMALE.has(cand)) return "f";
  }
  return null;
}
