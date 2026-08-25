/**
 * Vocabulary volume: **the furniture of a form and of a letter** — the words that hold a
 * document together rather than say anything about anybody. Labels, civil-status
 * connectives, postal furniture, courtesy formulas, multilingual.
 *
 * Every entry here was FOUND, not imagined: they are the residue of
 * `bench/auditFp.ts` — values the pipeline actually shipped to the vault across the
 * corpora, that no annotation could ever cover. « CEDEX », « demeurant », « Prescripteur »,
 * « Prénom », « Signé », « ci-dessus désigné » are not near-misses of a detector: they are
 * the printed scaffolding of the page, and faking one hands the model a document whose
 * own structure has been rewritten.
 *
 * ⚠️ The `./index` discipline decided several EXCLUSIONS here, each on a real collision —
 * they are in `../vocabGuards.test.ts` so they cannot creep back:
 *  - `né` — two characters (rule 3), and the French participle is everywhere;
 *  - `maire` — already on the absent roster, it is a surname;
 *  - `moy` — the bulletin's column header, but « Moy » is a surname (FR and ZH);
 *  - `iban` — already spared by the banking labels, and « Iban » is a Basque given name,
 *    so it stays out of any NEW list that could widen its reach;
 *  - `signe` — Scandinavian given name. Only the ACCENTED `signé` is here (rule 4), which
 *    is the participle a signature block actually prints.
 */
export const FORMULAIRE_TERMS: string[] = [
  // ── Libellés d'état civil et d'acte — français ─────────────────────────────
  "prénom", "prenom", "prénoms", "prenoms", "née", "nee", "demeurant", "domicilié",
  "domicilie", "domiciliée", "domiciliee", "domiciliation", "célibataire",
  "celibataire", "marié", "mariée", "mariee", "divorcé", "divorce",
  "divorcée", "divorcee", "veuf", "veuve", "pacsé", "pacse", "pacsée", "pacsee",
  "nationalité", "nationalite", "lieu de naissance", "date de naissance",
  "état civil", "etat civil", "situation de famille", "sexe", "signé", "signée",
  "signataire", "soussigné", "soussigne", "soussignée", "soussignee",
  "ci-dessus", "ci-dessous", "dessus", "désigné", "designe", "désignée", "designee",
  "ci-dessus désigné", "ci-dessus designe", "ci-après", "ci-apres", "ci-joint",
  "ci-annexé", "ci-annexe", "susnommé", "susnomme", "susvisé", "susvise",

  // ── Mobilier postal et administratif — français ────────────────────────────
  "cedex", "boîte postale", "boite postale", "lieu-dit", "bâtiment", "batiment",
  "escalier", "étage", "etage", "appartement", "résidence", "residence", "immeuble",
  "avis", "avis d'imposition", "accusé de réception", "accuse de reception",
  "récépissé", "recepisse", "quittance", "attestation", "certificat", "justificatif",
  "formulaire", "imprimé", "imprime", "notice", "volet", "cadre réservé",
  "cadre reserve", "case", "rubrique", "mention", "mentions légales",
  "mentions legales", "cachet", "tampon", "visa", "paraphe", "annexe", "annexes",
  // Codes de rubrique de formulaire — « B. Date de première immatriculation » (carte
  // grise) lisait « Date » comme un patronyme derrière son initiale de rubrique.
  "date", "dates",

  // ── Acronymes de guichet — français. Des SIGLES, jamais des noms ───────────
  "pdl", "sip", "sie", "caf", "cpi", "cgi", "asdir", "rsi",

  // ── Libellés de tableau et de bulletin — français ──────────────────────────
  "prescripteur", "prescriptrice", "destinataire", "expéditeur", "expediteur",
  "émetteur", "emetteur", "bénéficiaire", "beneficiaire", "titulaire", "mandataire",
  "correspondant", "interlocuteur", "responsable légal", "responsable legal",
  "libellé", "libelle", "intitulé", "intitule", "désignation", "designation",
  "référence", "reference", "références", "references", "coordonnées", "coordonnees",

  // ── Permis, titres et pièces — français ────────────────────────────────────
  "permis", "permis b", "permis de conduire", "carte grise", "titre de séjour",
  "titre de sejour", "livret de famille", "acte de naissance", "extrait d'acte",

  // ── Correspondance et courtoisie — multilingue ─────────────────────────────
  // DE — « Sehr geehrte Frau Kollegin » : le titre est déjà géré, le NOM COMMUN qui le
  // suit ne l'était pas, et il devenait la « personne » du courrier.
  "kollegin", "kollege", "kollegen", "kolleginnen", "sehr geehrte",
  "sehr geehrter", "mit freundlichen grüßen", "mit freundlichen grussen",
  "gesellschaftsvertrag", "vertragspartner", "unterzeichnete", "wohnhaft",
  "geburtsdatum", "geburtsort", "staatsangehörigkeit", "staatsangehorigkeit",
  // ES / PT
  "doña", "dona", "domicilio", "estado civil", "lugar de nacimiento",
  "fecha de nacimiento", "abajo firmante", "el presente documento",
  "morada", "naturalidade", "abaixo assinado",
  // IT
  "signorina", "residente", "domiciliato", "domiciliata", "luogo di nascita",
  "data di nascita", "il sottoscritto", "la sottoscritta", "portoghese",
  // EN
  "undersigned", "hereinafter", "aforementioned", "place of birth", "date of birth",
  "marital status", "next of kin", "yours sincerely", "yours faithfully",

  // ── Adjectifs de domaine qui traînent dans les en-têtes ────────────────────
  "médical", "medical", "médicale", "medicale", "médicaux", "medicaux",
  "judiciaire", "judiciaires", "notarial", "notariale", "fiscal", "fiscale",
  "sociale", "administratif", "administrative", "française", "francaise",
  "républicaine", "republicaine", "république", "republique",
];
