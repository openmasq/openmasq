/**
 * PUBLIC ADMINISTRATIONS, including their territorial suffix — the compound the flat
 * deny-list structurally cannot reach.
 *
 * `isGenericCompound` spares a multi-word value only when EVERY word is covered. So
 * « URSSAF » alone was already spared and « URSSAF ÎLE-DE-FRANCE » shipped to the vault;
 * likewise « CAISSE D'ALLOCATIONS FAMILIALES DU RHÔNE », « SIP NANTES CENTRE »,
 * « TRIBUNAL JUDICIAIRE DE NANTERRE ». Measured in `bench/sourceFp.bench.ts`: the whole
 * family escaped, one branch name at a time.
 *
 * ⚠️ **The allow-list is deliberately NARROW, and the audit is why.** The obvious
 * generalisation — « institutional word + place » — would also spare « COLLÈGE
 * JEAN-BAPTISTE CARPEAUX », « LABORATOIRE BIOMÉRIDIEN », « Académie de Lille ». Those are
 * the establishment ATTACHED to a named private person (the pupil's school, the patient's
 * lab); the annotation audit filed them as real personal data (`CONTEXT` truths in
 * `bench/corpora/`), and sparing them would undo that finding. So this list holds only
 * bodies whose name is a FUNCTION of the State — an office anyone in that département
 * deals with, revealing nothing about who the person is.
 *
 * Two guards keep the tail from swallowing data:
 *  - **no DIGIT anywhere** — « URSSAF 117 0001234567 » is an account number wearing an
 *    institution's name, and it must stay redacted;
 *  - **a bounded tail** — a long run is a sentence that happens to start with the body.
 *
 * Residual, stated: sparing « Tribunal judiciaire de NANTERRE » or « Mairie de Vernon »
 * ships that COMMUNE in clear. It is the seat of a public office, not the person's
 * address — which is detected and redacted on its own — but it is a real disclosure and
 * the reason this file names its members one by one rather than deriving them.
 */

/** First word(s) of a public body, as printed. Longest match wins. */
const BODIES: string[] = [
  // Sécurité sociale, famille, retraite, emploi
  "urssaf", "cpam", "caf", "cnaf", "carsat", "cnav", "cramif", "msa", "cnam",
  "caisse primaire d'assurance maladie", "caisse d'allocations familiales",
  "caisse nationale", "caisse régionale", "caisse regionale", "assurance maladie",
  "assurance retraite", "sécurité sociale", "securite sociale", "pôle emploi",
  "pole emploi", "france travail", "mission locale",
  // Fisc et finances publiques
  "sip", "sie", "sdif", "direction générale des finances publiques",
  "direction generale des finances publiques", "service des impôts",
  "service des impots", "centre des finances publiques", "trésor public",
  "tresor public", "recette des finances",
  // Justice
  "tribunal judiciaire", "tribunal administratif", "tribunal de commerce",
  "tribunal correctionnel", "tribunal de police", "conseil de prud'hommes",
  "cour d'appel", "cour administrative d'appel", "cour de cassation",
  "conseil d'état", "conseil d'etat", "parquet", "greffe",
  // Territoires et représentation de l'État
  "préfecture", "prefecture", "sous-préfecture", "sous-prefecture", "mairie",
  "hôtel de ville", "hotel de ville", "conseil départemental",
  "conseil departemental", "conseil régional", "conseil regional",
  "communauté de communes", "communaute de communes", "ambassade", "consulat",
  "consulat général", "consulat general",
  // Chambres et opérateurs
  "chambre de commerce", "chambre des métiers", "chambre des metiers",
  "chambre d'agriculture", "direction départementale", "direction departementale",
  "agence régionale de santé", "agence regionale de sante",
];

const SORTED = [...BODIES].sort((a, b) => b.length - a.length);
/** Beyond this many extra words the value is a sentence, not an office name. */
const MAX_TAIL_WORDS = 5;

/**
 * True when `value` is a public administration WITH its territorial suffix
 * (« URSSAF Île-de-France », « Tribunal judiciaire de Nanterre »). The body alone is
 * already covered by the flat deny-list; this is only about the compound.
 */
export function isPublicBodyCompound(value: string): boolean {
  const v = value.trim().replace(/\s+/g, " ");
  if (!v || /\d/.test(v)) return false; // a digit is data, never an office name
  const lower = v.toLowerCase();
  const body = SORTED.find(
    (b) => lower.startsWith(b) && (lower.length === b.length || /[\s'’-]/.test(lower[b.length])),
  );
  if (!body) return false;
  const tail = v.slice(body.length).trim();
  if (!tail) return false; // the bare acronym is already covered by the flat list
  const words = tail.split(/[\s'’-]+/).filter(Boolean);
  return words.length <= MAX_TAIL_WORDS;
}
