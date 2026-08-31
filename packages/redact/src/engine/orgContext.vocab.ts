// The VOCABULARY of the context-gated ORG detector — data half of orgContext.ts
// (300-LOC split, root rule 1). Every list's rationale lives on the list; the
// FAMILIES that consume them (and their guards) stay in orgContext.ts.

export const LEGAL_SUFFIXES = [
  "sarl", "sasu", "eurl", "selarl", "selas", "scop", "snc", "sas",
  // "sl" (ES) is safe in the /i arm — unlike "sa", it is no possessive/pronoun in
  // any covered language, and prose "sl" does not exist.
  "gmbh", "srl", "ltda", "ltd", "llc", "llp", "plc", "inc", "corp", "sl",
];

// Family 5 — the legal form as a PREFIX. French/Spanish/Italian deeds write it BEFORE
// the name at least as often as after ("La S.A.S. TECHNIVERT", "La SCI DU PONT NEUF",
// "la société LE FOURNIL D'ANTAN", "la mercantil INVERSIONES DEL SUR, S.L.") — and the
// suffix-only shapes above left the CONTRACT PARTY in clear on every one of them.
// Dotted renderings are folded by the `\.?` between letters, so "S.A.R.L." and "SARL"
// are one entry. `société/mercantil/società` are gates rather than forms: they take the
// name that follows, which is why they also appear in PROF_GATES.
export const PREFIX_FORMS = [
  "s\\.?a\\.?r\\.?l", "s\\.?a\\.?s\\.?u", "s\\.?a\\.?s", "s\\.?c\\.?i", "s\\.?c\\.?p",
  "s\\.?c\\.?m", "s\\.?e\\.?l\\.?a\\.?r\\.?l", "e\\.?u\\.?r\\.?l", "s\\.?n\\.?c",
  "s\\.?a", "g\\.?i\\.?e", "s\\.?c\\.?a", "s\\.?e\\.?m",
  "gmbh", "ug", "ag", "s\\.?l", "s\\.?r\\.?l", "spa", "lda",
  "société", "societe", "sociedad", "mercantil", "società", "societa", "sociedade",
  "association", "fondation", "mutuelle", "coopérative", "cooperative",
  // BUSINESS-RELATION leads — measured on a manual bench: the NER produces
  // NOTHING on « chez LVMH », « le groupe Bouygues », « notre fournisseur OVHcloud », even
  // though the phrasing unambiguously names an organisation. The casing gate below
  // does the sorting: the captured token must be Uppercase-initial, so « chez moi »,
  // « chez le médecin » or « chez nous » capture nothing.
  // « client » is deliberately ABSENT: « notre client Jean Rebour » names a
  // person far more often than a company, and giving it a company fake
  // would split its identity.
  "chez", "groupe", "entreprise", "startup", "start-up", "pme", "eti",
  "enseigne", "filiale", "fournisseur", "prestataire", "employeur",
];

export const PROF_GATES = ["chez", "cabinet", "étude", "etude", "office", "maison", "société", "societe"];
export const PROF_SUFFIXES = [
  "avocats", "notaires", "huissiers", "architectes",
  "géomètres", "geometres", "experts-comptables",
];

export const CONJ_SUFFIXES = [
  // `filles`/`frères` are the exact symmetric of `fils` — same firm form, same guards
  // (the KINSHIP set bounds the LEFT token, so "entre père et filles" stays prose).
  "fils", "filles", "frères", "freres", "associés", "associes", "partners", "partner", "sons", "associates",
  "söhne", "soehne", "asociados", "associati", "figli", "hijos", "filhos", "cie",
];

// "entre père et fils" is family prose, not a company (fr/en/de/es/it/pt).
export const KINSHIP = new Set([
  "père", "pere", "mère", "mere", "frère", "frere", "sœur", "soeur",
  "oncle", "tante", "parents", "fils", "fille", "filles", "mari", "femme",
  "mother", "father", "brother", "sister", "son", "daughter",
  "vater", "mutter", "bruder", "schwester", "sohn", "tochter",
  "padre", "madre", "hermano", "hermana", "hijo", "hija",
  "fratello", "sorella", "figlio", "figlia",
  "irmão", "irmao", "irmã", "irma",
]);

export const PREFIX_PARTICLES = new Set([
  "de", "du", "des", "la", "le", "les", "d", "l", "del", "della", "dos", "das",
  "van", "von", "der", "y", "e", "et", "and", "&",
]);
