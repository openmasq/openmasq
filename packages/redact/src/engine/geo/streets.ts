// Fake STREET names, per address language. COMBINATORIAL (type × name): the fixed 4-6
// entry lists made the same «rue des Lilas» recur on every multi-address document, the
// exact symptom the org pool had. Order is STABLE (type-major) — the pick is
// `h % length`, so reordering would silently remap every address fake. Names are
// deliberately BORING common street names, never a person-gazetteer word that could
// collide with `avoid`. The address LAYOUT half lives in ./index.ts (`FORMATTERS`).

export const STREET_PARTS: Record<string, { types: string[]; names: string[] }> = {
  fr: {
    types: ["rue", "avenue", "boulevard", "impasse", "chemin", "allée", "place", "square"],
    names: [
      "des Lilas", "de la Paix", "des Roses", "du Moulin", "des Tilleuls", "des Acacias",
      "de la Gare", "des Écoles", "de Verdun", "de la Fontaine", "des Peupliers",
      "du Stade", "de la Mairie", "des Cerisiers", "du Lavoir", "des Genêts",
    ],
  },
  en: {
    types: ["Street", "Avenue", "Road", "Lane", "Drive", "Close"],
    names: ["Oak", "Elm", "Maple", "Mill", "Church", "Station", "Meadow", "Orchard", "Willow", "Cedar"],
  },
  de: {
    types: ["straße", "weg", "allee", "gasse"],
    names: ["Garten", "Linden", "Schul", "Birken", "Wiesen", "Mühlen", "Amsel", "Buchen"],
  },
  es: {
    types: ["Calle", "Avenida", "Paseo", "Plaza"],
    names: ["del Sol", "Real", "Nueva", "del Prado", "de la Fuente", "de los Olivos", "del Pinar", "Mayor"],
  },
  it: {
    types: ["Via", "Corso", "Viale", "Piazza"],
    names: ["dei Tigli", "delle Rose", "del Mulino", "della Stazione", "dei Pini", "Verdi", "delle Querce", "del Sole"],
  },
  nl: {
    types: ["straat", "weg", "laan", "pad"],
    names: ["Kerk", "Dorps", "Molen", "School", "Nieuw", "Linden", "Beuken", "Wilgen"],
  },
  pt: {
    types: ["Rua", "Avenida", "Travessa", "Largo"],
    names: ["Nova", "do Comércio", "das Flores", "do Moinho", "da Fonte", "dos Pinheiros", "da Estação", "das Oliveiras"],
  },
};
/** en/es/it/pt/fr compose «type name»; de/nl GLUE name+type («Gartenweg», «Kerkstraat»). */
const GLUED_STREET = new Set(["de", "nl"]);
export const STREETS: Record<string, string[]> = Object.fromEntries(
  Object.entries(STREET_PARTS).map(([lang, { types, names }]) => [
    lang,
    types.flatMap((t) =>
      names.map((n) => (GLUED_STREET.has(lang) ? `${n.toLowerCase()}${t}`.replace(/^./, (c) => c.toUpperCase()) : `${t} ${n}`)),
    ),
  ]),
);
