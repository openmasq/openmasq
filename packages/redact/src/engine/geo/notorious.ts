// A fake PLACE should be an OBSCURE real city — one the user is UNLIKELY to type
// themselves — so it doesn't collide with a legitimately-typed place later in the
// same conversation (the "amiens → france, then the user types france" trap: once a
// famous word is a vault fake, the real word collides with it). Same spirit as the
// ORG faker preferring invented/obscure companies over famous brands: here we can't
// invent a city (the model must treat it as real), so instead we EXCLUDE the
// world-famous ones from the fake pool and fall back only if nothing else remains.
//
// The set holds the FR metropolises + major world capitals/cities most people would
// spontaneously write, PLUS bare country/region words (so a fake is never a plain
// "France"/"Belgique"). Matching is accent- and case-insensitive.

const strip = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

const NOTORIOUS = new Set(
  [
    // FR metropolises + very common cities
    "Paris", "Marseille", "Lyon", "Toulouse", "Nice", "Nantes", "Montpellier",
    "Strasbourg", "Bordeaux", "Lille", "Rennes", "Reims", "Toulon", "Cannes",
    "Versailles", "Grenoble", "Dijon", "Angers", "Nîmes", "Aix-en-Provence",
    "Biarritz", "Saint-Tropez", "Deauville",
    // Major world cities the user might type
    "London", "Londres", "Madrid", "Barcelona", "Barcelone", "Berlin", "Munich",
    "München", "Rome", "Roma", "Milan", "Milano", "Amsterdam", "Brussels",
    "Bruxelles", "Lisbon", "Lisbonne", "Lisboa", "Geneva", "Genève", "Zurich",
    "Vienna", "Vienne", "Dublin", "New York", "Los Angeles", "Chicago", "Boston",
    "Toronto", "Montreal", "Montréal",
    // Bare country / region words — a fake must never be one of these
    "France", "Belgique", "Belgium", "Suisse", "Switzerland", "Allemagne",
    "Germany", "Deutschland", "Espagne", "Spain", "España", "Italie", "Italy",
    "Italia", "Portugal", "Angleterre", "England", "Royaume-Uni", "Luxembourg",
    "Ireland", "Irlande", "Canada", "Pays-Bas", "Netherlands", "Nederland",
    "Autriche", "Austria",
  ].map(strip),
);

/** True when `name` is a world-famous place / a bare country word — a fake city
 *  should avoid it so it can't collide with a value the user later types. */
export function isNotoriousPlace(name: string): boolean {
  return NOTORIOUS.has(strip(name));
}
