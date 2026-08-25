import { describe, it, expect } from "vitest";
import { applyVault, applyVaultVariants, disabledVaultTokens, replayVault, unredact } from "./vault";
import { unredactArgs, unredactReply } from "./vaultArgs";

/**
 * `disabledVaultTokens` decides which vault entries STOP being substituted — i.e.
 * whose REAL value goes back on the wire. It had no test at all; these pin the
 * fail-closed direction.
 */
describe("disabledVaultTokens", () => {
  it("excludes a labelled token whose category the user turned off", () => {
    const vault = { "[REDACTED_EMAIL_1]": "lea@example.test" };
    expect([...disabledVaultTokens(vault, { disabledKinds: ["email"] })]).toEqual([
      "[REDACTED_EMAIL_1]",
    ]);
  });

  it("excludes number tokens when numbers are off", () => {
    expect([...disabledVaultTokens({ n1: "42" }, { numbers: false })]).toEqual(["n1"]);
  });

  it("excludes a fake-data token when `kinds` PROVES its category is off", () => {
    const vault = { "Sarah Savel": "Léa Morvan" };
    const kinds = { "Léa Morvan": "name" };
    expect([...disabledVaultTokens(vault, { disabledKinds: ["name"], kinds })]).toEqual([
      "Sarah Savel",
    ]);
  });

  // The regression. A fake-data token carries no category, and `kinds` only covers
  // PRIOR turns — so on the first message it is empty for everything. The old code
  // defaulted an unknown kind to "secret", which meant ticking off the perfectly
  // ordinary "Clés & secrets" category un-substituted every name/company in the
  // message: the REAL value reached the model while `matches` still claimed a
  // redaction. Excluding is the UNSAFE direction; it must never be a guess.
  it("FAIL-CLOSED: an un-provable kind is NEVER excluded, whatever is disabled", () => {
    const vault = { "Sarah Savel": "Léa Morvan", "Norvik Group": "Karl Studio" };
    // No `kinds` at all — the first-message case.
    expect([...disabledVaultTokens(vault, { disabledKinds: ["secret"] })]).toEqual([]);
    expect([...disabledVaultTokens(vault, { disabledKinds: ["secret"], kinds: {} })]).toEqual([]);
    // Every category off at once still cannot un-substitute an unproven entry.
    const all = ["secret", "name", "company", "email", "apikey", "path", "number"];
    expect([...disabledVaultTokens(vault, { disabledKinds: all, kinds: {} })]).toEqual([]);
  });

  it("FAIL-CLOSED: a partially-known vault only excludes the entries it can prove", () => {
    const vault = { "Sarah Savel": "Léa Morvan", "Norvik Group": "Karl Studio" };
    const kinds = { "Karl Studio": "company" }; // only the company is known
    expect([...disabledVaultTokens(vault, { disabledKinds: ["company", "name"], kinds })]).toEqual([
      "Norvik Group",
    ]);
  });

  it("nothing disabled and numbers on ⇒ nothing excluded", () => {
    expect([...disabledVaultTokens({ "[REDACTED_EMAIL_1]": "a@b.test", n1: "42" }, {})]).toEqual([]);
  });
});

/**
 * `replayVault` is the CLEAR-MODE browser-result redaction: no detection, no new
 * entries — but a value the conversation ALREADY redacted must still hand the model
 * its fake wherever it appears in page text, casing/separators included. Under-matching
 * is the privacy direction; these pin the tolerance AND its risky-short-value limit.
 */
describe("replayVault", () => {
  const vault = { "Sarah Savel": "Julien Sabourdin", "Norvik Group": "Karl Studio" };

  it("is a strict no-op on an empty vault (pristine conversation ⇒ page passes verbatim)", () => {
    const page = "Espagne : la ministre Teresa Ribera annonce un plan à Madrid.";
    expect(replayVault(page, {})).toBe(page);
  });

  it("replays a known real to its existing fake, without touching the rest", () => {
    expect(replayVault("Le PDG de Karl Studio a démenti.", vault)).toBe(
      "Le PDG de Norvik Group a démenti.",
    );
  });

  it("matches case-insensitively (a headline UPPER-CASES the value)", () => {
    expect(replayVault("KARL STUDIO EN CRISE", vault)).toBe("Norvik Group EN CRISE");
    expect(replayVault("Contact : julien sabourdin", vault)).toBe("Contact : Sarah Savel");
  });

  it("matches a slugified value inside a URL (separator tolerance)", () => {
    expect(replayVault("https://news.example/karl-studio/bilan", vault)).toBe(
      "https://news.example/Norvik Group/bilan",
    );
  });

  it("never rewrites a value glued inside a larger word", () => {
    const v = { fake1: "ana" };
    expect(replayVault("la banane est mûre", v)).toBe("la banane est mûre");
  });

  it("a RISKY short value (≤3 chars) replays on exact case only", () => {
    const v = { fakeCountry: "us" };
    expect(replayVault("the US announced", v)).toBe("the US announced"); // no over-mask
    expect(replayVault("contact us today", v)).toBe("contact fakeCountry today");
  });

  it("does not mutate the vault (replay only, never detection)", () => {
    const v = { ...vault };
    replayVault("Karl Studio et Jean Rebour à Madrid", v);
    expect(v).toEqual(vault); // Jean Rebour / Madrid NOT minted — that's full redaction's job
  });
});

/**
 * `applyVaultVariants` est la passe TOLÉRANTE résiduelle du trajet MODÈLE (après
 * `applyVault`) : une entité déjà en coffre revient en variante — « KARL_STUDIO » dans
 * un nom de fichier, un slug, une MAJUSCULE — et la passe exacte seule l'expédiait EN
 * CLAIR (journal 01/08). Ces cas épinglent la tolérance ET ses gardes anti-prose.
 */
describe("applyVaultVariants", () => {
  const vault = { "Kelby Works": "Karl Studio", "Sarah Savel": "Marie" };

  it("mappe la variante underscore/MAJUSCULES d'une valeur multi-mots sur SON fake", () => {
    expect(applyVaultVariants("dossier KARL_STUDIO ouvert", vault)).toBe(
      "dossier Kelby Works ouvert",
    );
    expect(applyVaultVariants("slug karl-studio et KarlStudio", vault)).toBe(
      "slug Kelby Works et Kelby Works",
    );
  });

  it("laisse l'orthographe EXACTE à `applyVault` (pas de double passe)", () => {
    expect(applyVaultVariants("chez Karl Studio", vault)).toBe("chez Karl Studio");
  });

  it("un alias UN SEUL MOT ne mange jamais la prose minuscule (« se marie »)", () => {
    expect(applyVaultVariants("il se marie demain", vault)).toBe("il se marie demain");
    expect(applyVaultVariants("MARIE signe le bail", vault)).toBe("Sarah Savel signe le bail");
  });

  it("respecte l'exclusion (catégorie éteinte = valeur réelle conservée)", () => {
    expect(applyVaultVariants("KARL_STUDIO", vault, new Set(["Kelby Works"]))).toBe(
      "KARL_STUDIO",
    );
  });
});

describe("unredactArgs — restauration des fakes MUTÉS (troncature du dernier mot)", () => {
  it("restaure le fake tronqué par le modèle vers la vraie valeur (le raté web vivant)", () => {
    const vault = { "Léa Croshml": "Karl Studio" };
    expect(unredactArgs("q=Léa Cros agence", vault)).toBe("q=Karl Studio agence");
    expect(unredactArgs("q=Léa+Cros+agence", vault)).toBe("q=Karl Studio+agence");
    expect(unredactArgs("léa crosh dossier", vault)).toBe("Karl Studio dossier");
  });
  it("ne sur-restaure JAMAIS un autre nom ni un motif ambigu", () => {
    const vault = { "Léa Croshml": "Karl Studio" };
    expect(unredactArgs("Léa Berliand habite ici", vault)).toBe("Léa Berliand habite ici");
    expect(unredactArgs("Léa Ro min trop court", vault)).toBe("Léa Ro min trop court");
    // Deux fakes partageant le même motif tronqué → aucun des deux n'est deviné.
    const ambiguous = { "Léa Croshml": "Karl Studio", "Léa Crosbzq": "Atelier Torbel" };
    expect(unredactArgs("contacte Léa Cros", ambiguous)).toBe("contacte Léa Cros");
  });
  it("le fake EXACT reste restauré par la passe principale (aucune régression)", () => {
    const vault = { "Léa Croshml": "Karl Studio" };
    expect(unredactArgs("rdv avec Léa Croshml demain", vault)).toBe("rdv avec Karl Studio demain");
  });
});

describe("unredact — le modèle RÉ-ORTHOGRAPHIE un faux (accents)", () => {
  // ⛔ LA RÉGRESSION, constatée le 15/08 sur une carte d'identité. Le faux « Quémener »
  // est revenu « Quéméner » : le modèle a « corrigé » vers la graphie qu'il connaît. Un
  // seul signe de différence — et la tolérance de CASSE n'y pouvait rien. Le nom de
  // famille et la ville, eux, ont été restitués : l'utilisateur a donc lu un prénom
  // INVENTÉ collé à son vrai nom, sans rien pour le lui signaler. C'est la promesse du
  // produit qui tombe, pas un détail d'affichage.
  const vault = { "AMAURY QUÉMENER": "CAMILLE CROS", ODILE: "MORVAN", BASTIA: "RENNES" };

  it("restitue un faux dont un accent a bougé", () => {
    const reply = "il s'agit d'Amaury Quéméner Odile, né à Bastia en 1996.";
    const out = unredactReply(reply, vault);
    expect(out).toContain("CAMILLE CROS");
    expect(out).toContain("MORVAN");
    expect(out).toContain("RENNES");
    expect(out).not.toMatch(/Quém?éner/i);
  });

  it("dans l'autre sens aussi : un accent RETIRÉ par le modèle", () => {
    expect(unredactReply("selon Amaury Quemener…", vault)).toContain("CAMILLE CROS");
  });

  it("deux faux qui PLIENT sur la même clé ⇒ abstention, jamais le mauvais réel", () => {
    // « Rene » et « René » sont deux personnes différentes : plié, c'est la même clé.
    // Deviner afficherait la donnée de QUELQU'UN D'AUTRE — on ne restitue donc rien.
    const ambigu = { Rene: "PAUL SAVARY", René: "LUCIE VIDAL" };
    expect(unredactReply("d'après Renè, …", ambigu)).toContain("Renè");
  });

  it("un jeton RISQUÉ garde sa casse exacte, plié ou non", () => {
    const risque = { n1: "42", ABC: "SIRET-VRAI" };
    expect(unredactReply("la note n1 et le sigle abc", risque)).toBe("la note 42 et le sigle abc");
  });
});

describe("unredactReply — réparation d'un pseudonyme MUTÉ à l'affichage", () => {
  const FAKE = "f0Rsf0P4lIl-grI9EJQjm_52-P47-a3it_0b-YRI-nKVc.csv";
  const REAL = "transaction-statement_01-Jan-2025_31-Dec-2025.csv";

  it("restaure la mutation par duplication de queue mesurée au journal du 02/08", () => {
    const vault = { [FAKE]: REAL };
    const reply = `Le relevé f0Rsf0P4lIl-grI9EJQjm_52-P47-a3it_0b-YRI-nKVnKV-nKV-nKV.csv liste les paiements.`;
    expect(unredactReply(reply, vault)).toBe(`Le relevé ${REAL} liste les paiements.`);
    // …et la troncature du même fake aussi (préfixe ≥ 75 %).
    expect(unredactReply("voir f0Rsf0P4lIl-grI9EJQjm_52-P47-a3it_0b-YRI.csv", vault)).toBe(`voir ${REAL}`);
  });

  it("le fake EXACT reste l'affaire d'unredact ; un mot ordinaire n'est jamais touché", () => {
    const vault = { [FAKE]: REAL };
    expect(unredactReply(`fichier ${FAKE} ouvert`, vault)).toBe(`fichier ${REAL} ouvert`);
    const prose = "la facture 2024-01-15_commande_client-standard.csv est un NOM RÉEL du texte";
    expect(unredactReply(prose, vault)).toBe(prose); // long token à séparateurs ≠ candidat (préfixe insuffisant)
  });

  it("deux fakes « frères » partageant un long préfixe ⇒ abstention (jamais deviné)", () => {
    // Même préfixe de répertoire scramblé, fins différentes : la mutation ne désigne
    // personne de façon unique — on n'affiche RIEN de réel.
    const vault = {
      "/Users/g1GdGVu36x2JQTC/Desktop/ibin-kRQf8/rapport-a1.pdf": "/x/vrai-a.pdf",
      "/Users/g1GdGVu36x2JQTC/Desktop/ibin-kRQf8/rapport-b2.pdf": "/x/vrai-b.pdf",
    };
    const reply = "voir /Users/g1GdGVu36x2JQTC/Desktop/ibin-kRQf8/rapport-zz.pdf";
    expect(unredactReply(reply, vault)).toBe(reply);
  });
});

describe("unredact — un faux de DATE reformulé en toutes lettres est restitué", () => {
  // Le cas vécu (15/08, inventaire documentaliste) : le tableau recopiait le faux
  // `13/08/2024` verbatim (restitué), la phrase d'à côté l'écrivait « du 13 août 2024
  // au… » — la même date, autre format, la clé de rien : l'utilisateur lisait une date
  // FAUSSE présentée comme un fait, au milieu d'un document par ailleurs juste.
  const vault = { "13/08/2024": "12/02/2026" };

  it("restitue la forme longue française, avec et sans zéro de tête", () => {
    expect(unredact("Les dates couvertes vont du 13 août 2024 au 3 mars.", vault)).toBe(
      "Les dates couvertes vont du 12 février 2026 au 3 mars.",
    );
    // La forme numérique exacte reste restituée comme avant.
    expect(unredact("Signé le 13/08/2024.", vault)).toBe("Signé le 12/02/2026.");
    // Jour < 10 : les deux graphies du faux mappent la même forme canonique du réel.
    const v2 = { "05/01/2026": "09/11/2025" };
    expect(unredact("délivrée le 5 janvier 2026", v2)).toBe("délivrée le 9 novembre 2025");
    expect(unredact("délivrée le 05 janvier 2026", v2)).toBe("délivrée le 9 novembre 2025");
  });

  it("« 1er » est couvert, dans les deux sens", () => {
    const v = { "01/03/2026": "07/06/2026" };
    expect(unredact("le 1er mars 2026", v)).toBe("le 7 juin 2026");
    const v1 = { "15/04/2026": "01/05/2026" };
    expect(unredact("le 15 avril 2026", v1)).toBe("le 1er mai 2026");
  });

  it("ne touche pas une date ordinaire absente du coffre, ni un non-date", () => {
    expect(unredact("le 14 juillet 2026, fête nationale", vault)).toBe(
      "le 14 juillet 2026, fête nationale",
    );
    expect(unredact("réf 13/08 sans année", vault)).toBe("réf 13/08 sans année");
    // Un faux non-date ne dérive rien.
    expect(unredact("chez Oslen Group", { "Oslen Group": "Karl Studio" })).toBe(
      "chez Karl Studio",
    );
  });

  it("une entrée EXISTANTE du coffre gagne toujours sur une forme dérivée", () => {
    const v = { "13/08/2024": "12/02/2026", "13 août 2024": "le vrai texte prioritaire" };
    expect(unredact("du 13 août 2024", v)).toBe("du le vrai texte prioritaire");
  });
});

describe("un fragment de SIGLE n'est pas une valeur (constat 15/08, reproduit le 16/08)", () => {
  /** Sur un acte légal, « 863 471 587 R.C.S. Paris » ressortait « … GAP.S. Nevers » : le
   *  modèle lit un registre qui n'existe pas. Le constat en avait l'hypothèse sans repro —
   *  la voici : DEUX substitutions, dont une entrée de coffre de deux caractères. */
  it("une entrée courte ne réécrit plus l'intérieur d'un sigle", () => {
    expect(applyVault("863 471 587 R.C.S. Paris", { GAP: "R.C" })).toBe("863 471 587 R.C.S. Paris");
    // …et la ville, elle, est bien remplacée : c'est l'intention.
    expect(applyVault("863 471 587 R.C.S. Paris", { Nevers: "Paris" })).toBe("863 471 587 R.C.S. Nevers");
  });

  it("⚠️ mais la même valeur AUTONOME garde sa substitution", () => {
    // Le garde est le pendant FORWARD d'`isRisky` : borné aux valeurs courtes ET au point
    // INTERNE au jeton. Un point de fin de phrase ne doit rien bloquer, sinon on
    // fabriquerait une fuite en corrigeant une corruption.
    expect(applyVault("le service R.C a répondu", { GAP: "R.C" })).toBe("le service GAP a répondu");
    expect(applyVault("le service R.C.", { GAP: "R.C" })).toBe("le service GAP.");
  });

  it("…et une valeur LONGUE n'est pas concernée", () => {
    expect(applyVault("Karl Studio. Suite", { Voxa: "Karl Studio" })).toBe("Voxa. Suite");
  });
});
