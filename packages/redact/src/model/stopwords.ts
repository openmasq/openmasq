/**
 * Ultra-common FUNCTION words — never sensitive on their own. Split from
 * `genericTerms.ts` (300-LOC rule) and re-exported there, so every import path is
 * unchanged. Same allow-list discipline as GENERIC_TERMS: only a candidate whose
 * ENTIRE value is one of these is dropped, so a multi-word span ("Le Corbusier")
 * is unaffected — and any word that doubles as a real first name/surname/brand is
 * deliberately OMITTED (no "belle", "young", "long", "otto"…), because an entry
 * here ships that word in CLEAR forever.
 *
 * Besides the NER/LLM standalone-drop, this set is the TOKEN GUARD of the
 * deterministic context detectors (`engine/honorifics.ts`, `engine/orgContext.ts`):
 * "madame la présidente" / "une petite sarl" must NOT yield a candidate, and that
 * safety is exactly as good as the coverage here — hence the multilingual blocks.
 */
const STOPWORDS = new Set<string>([
  // ── French ──
  "le", "la", "les", "un", "une", "des", "du", "de", "d", "au", "aux", "à",
  // Elided forms, as their own token: `isGenericCompound` splits on the apostrophe, so
  // « d'assurances » / « l'Autonomie » / « qu'elle » yield a bare `d` / `l` / `qu`. A
  // single letter is never an identity, and without them one elision kept a whole
  // institutional phrase alive ("Commission des Droits et de l'Autonomie…").
  "l", "c", "j", "m", "n", "s", "t", "qu",
  "ce", "cet", "cette", "ces", "mon", "ton", "son", "ma", "ta", "sa",
  "mes", "tes", "ses", "notre", "votre", "leur", "nos", "vos", "leurs",
  "je", "tu", "il", "elle", "on", "nous", "vous", "ils", "elles",
  "me", "te", "se", "lui", "y", "en", "et", "ou", "mais", "donc", "or", "ni",
  "car", "que", "qui", "quoi", "dont", "où", "ne", "pas", "plus",
  // Politesse abrégée — « Contact Jean-Pierre Morvan SVP » lisait « SVP » comme un
  // patronyme (morvan est AUSSI un prénom, la paire semblait complète).
  "svp", "stp",
  "pour", "par", "sur", "sous", "dans", "avec", "sans", "chez", "vers",
  "entre", "est", "sont", "être", "etre", "doit", "doivent", "devrait", "était",
  "etait", "sera", "seront", "peut", "peuvent",
  // ── English ──
  "the", "a", "an", "of", "to", "in", "on", "at", "for", "and", "or", "but",
  "is", "are", "was", "were", "be", "been", "i", "you", "he", "she", "it",
  "we", "they", "my", "your", "his", "her", "its", "our", "their",
  "this", "that", "these", "those", "as", "by", "from", "with", "not",
  // ── German ──
  "der", "die", "das", "den", "dem", "des", "ein", "eine", "einer", "einem",
  "einen", "und", "oder", "aber", "wenn", "dass", "als", "auch", "noch",
  "schon", "sehr", "nicht", "mit", "ohne", "für", "fuer", "von", "zu", "zum",
  "zur", "auf", "aus", "bei", "nach", "über", "ueber", "unter", "ist", "sind",
  "wird", "werden", "mein", "meine", "dein", "deine", "sein", "seine",
  "ihr", "ihre", "unser", "unsere", "kein", "keine", "dieser", "diese",
  "dieses", "jeder", "jede", "jedes", "welche",
  // ── Spanish ──
  "el", "los", "las", "unos", "unas", "o", "pero", "si", "no", "con", "sin",
  "por", "para", "del", "al", "lo", "su", "sus", "mi", "mis", "tus", "es",
  "este", "esta", "estos", "estas", "ese", "esa", "esos", "esas", "muy",
  "más", "mas", "como", "cuando", "donde", "porque", "hay", "fue",
  // ── Italian ──
  "gli", "uno", "ma", "non", "senza", "per", "di", "da", "della", "dei",
  "delle", "dello", "degli", "alla", "ai", "alle", "questo", "questa",
  "questi", "queste", "quella", "suo", "sua", "suoi", "sue", "mio", "mia",
  "è", "sono", "era", "erano", "molto", "più", "piu", "dove",
  "sul", "sulla", "sulle", "nel", "nella", "nelle", "dal", "dalla", "col",
  // ── Portuguese ──
  "os", "uma", "uns", "umas", "e", "não", "nao", "em", "com", "sem",
  "do", "dos", "das", "ao", "às", "aos", "na", "nas", "seu", "seus", "suas",
  "meu", "minha", "é", "são", "sao", "foi", "ser", "muito", "quando", "onde",
  // ── Dutch ── ("dan" the conjunction is OMITTED — "Dan" is a first name)
  "het", "een", "voor", "met", "aan", "bij", "uit", "over", "onder", "tussen",
  "deze", "dit", "dat", "zijn", "onze", "ons", "hun", "haar", "wordt", "werd",
  "niet", "ook", "naar", "door", "tegen", "tot", "er", "ze", "wij", "hij", "u",
  // ── Polish ──
  "nie", "się", "sie", "jest", "oraz", "albo", "lub", "dla", "przez", "przy",
  "pod", "nad", "między", "miedzy", "jego", "jej", "ten", "ta", "to", "te",
  "który", "ktory", "która", "ktora", "które", "ktore", "w", "z", "i", "od", "po",
  // ── Nordic (SV / DA / NO — they share most function words). Swedish "till"
  // is OMITTED — "Till" is a German first name (the allow-list discipline). ──
  "och", "att", "som", "för", "for", "från", "fran", "fra", "av", "på", "pa",
  "og", "ikke", "inte", "til", "hos", "efter", "över", "det", "den",
  "et", "ett", "är", "ar", "har", "ved", "eller", "også", "ogsa",
  // ── Quantifiers + small-number words (a candidate exactly "deux"/"several" is
  // never PII, and they precede the nouns the context detectors guard against:
  // "deux notaires", "plusieurs avocats") ──
  "plusieurs", "quelques", "certains", "certaines", "chaque", "aucun", "aucune",
  "tout", "toute", "tous", "toutes", "même", "meme", "autre", "autres",
  "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix",
  "two", "three", "four", "five", "seven", "eight", "nine", "ten",
  "some", "many", "most", "each", "every", "any", "both", "all", "few",
  "several", "other", "others", "another",
  // ── Common pre-noun adjectives (the org-context guard: "une petite sarl
  // familiale" must not read as a company name). Name-doubling adjectives are
  // omitted per the allow-list discipline (belle, young, long, small…). ──
  "petit", "petite", "petits", "petites", "grand", "grande", "grands", "grandes",
  "nouveau", "nouvelle", "nouveaux", "nouvelles", "ancien", "ancienne",
  "anciens", "anciennes", "jeune", "jeunes", "premier", "première", "premiere",
  "dernier", "dernière", "derniere", "bon", "bonne", "bons", "bonnes",
  "seul", "seule", "futur", "future", "vrai", "vraie", "gros", "grosse",
  "vieux", "vieille", "double", "simple",
  "new", "old", "big", "good", "bad", "first", "last", "next",
]);

/**
 * True when `value` is a single ultra-common function word (never PII alone).
 *
 * CASE- and SEPARATOR-insensitive, mirroring `isGenericTerm`: a dotted/spaced form is the
 * same word ("S.A" → "sa", the French legal form the NER tags as an ORG and fakes to an
 * invented company). Only DELIMITERS are stripped, and only as a SECOND test, so no letter
 * or accent is touched. The cost of the symmetry is that a pair of initials whose glued
 * form happens to be a function word ("M.A.", "J.E.") is spared — two letters, no identity
 * on their own, which is the same bar every entry in this file already meets.
 */
export function isStopword(value: string): boolean {
  const lower = value.trim().toLowerCase();
  if (STOPWORDS.has(lower)) return true;
  const noSep = lower.replace(/[.\s_'’-]+/g, "");
  return noSep !== lower && STOPWORDS.has(noSep);
}
