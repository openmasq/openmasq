import { describe, it, expect } from "vitest";
import { pseudonymize } from "./index";
import { scoreCorpus, coversTruth, pct, type BenchCase } from "../bench/metric";
import corpus from "../bench/corpora/categoriesRares.json";

/* Recall bench for the RARE categories — BIC, carte, société, URL, montant, date d'acte,
   lieu « VILLE (CP) », chemin, secret.

   Ce corpus existe pour une raison de MESURE, pas de couverture produit : neuf catégories
   comptaient moins de 20 vérités dans le banc (BIC et CARD n'en avaient qu'UNE), et sous ce
   seuil un pourcentage par catégorie ne veut rien dire — une seule valeur fait 0 ou 100 %.
   Chaque catégorie porte désormais au moins 20 vérités, réparties sur des documents réels de
   leur milieu naturel : RIB et mandats SEPA pour le BIC, exports de caisse et tickets SAV
   pour la carte, actes et Kbis pour la société, configs et runbooks pour le secret.

   Les valeurs sont VALIDES par construction : cartes Luhn-valides, IBAN à clé de contrôle
   juste. Une donnée invalide mesurerait la tolérance du moteur, pas son rappel.

   Score le pipeline déterministe COMPLET tel qu'il est livré (`pseudonymize`, sans modèle),
   comme `juridique` / `layouts` / `technique`. */

const cases = corpus as BenchCase[];

const detect = async (text: string): Promise<string[]> => {
  const vault: Record<string, string> = {};
  await pseudonymize(text, { vault });
  return Object.values(vault);
};

/** Les catégories que le DÉTERMINISTE doit tenir à 100 % : elles ont une forme, une somme de
 *  contrôle ou un préfixe — aucune n'a besoin de contexte linguistique. C'est le vrai
 *  plancher de ce corpus ; le taux global, lui, est plombé par des catégories hors périmètre
 *  (voir le test suivant). */
const STRUCTURED = ["CARD", "IBAN", "PATH", "EMAIL", "PHONE"] as const;

describe("rare-category recall (full deterministic pipeline)", () => {
  it("ne rate AUCUNE donnée à forme vérifiable (carte, IBAN, chemin, e-mail, téléphone)", async () => {
    const missed: string[] = [];
    for (const c of cases) {
      const detected = await detect(c.text);
      for (const [value, cat] of c.truth) {
        if ((STRUCTURED as readonly string[]).includes(cat) && !coversTruth(value, detected))
          missed.push(`${c.id}/${cat}:${value}`);
      }
    }
    expect(missed, `structuré manqué : ${missed.join(" · ")}`).toEqual([]);
  });

  it("holds the recall floor on the categoriesRares corpus", async () => {
    const s = await scoreCorpus(cases, detect);
    // eslint-disable-next-line no-console
    console.log(
      `[categoriesRares] overall ${s.found}/${s.total} (${pct(s.found, s.total)}%) FP ${s.fp}` +
        (s.misses.length ? `\n  misses: ${s.misses.join(" · ")}` : ""),
    );
    // ⚠️ Le plancher est BAS parce que deux familles de vérités sont hors du périmètre que le
    // produit couvre AUJOURD'HUI, et le corpus les annote quand même — c'est ce qui rend la
    // mesure honnête :
    //   · `AMOUNT` est une catégorie RETIRÉE par décision (`RETIRED_CATEGORIES`) : 23 vérités
    //     qui ne seront jamais trouvées tant que la décision tient ;
    //   · `DATE` porte ici des dates d'ACTE, d'embauche, de mariage — le détecteur de dates
    //     est délibérément gardé par le contexte de NAISSANCE, pour ne pas redact toutes
    //     les dates d'un document.
    // Le plancher garde donc le RESTE : que le déterministe ne perde pas ce qu'il tient déjà.
    // Cliquet 0.65 → 0.75 (traîne INSEE des prénoms, mesuré 79 %) → 0.78 (particules
    // + « initiale + NOM » de la phase B, mesuré 82 %).
    expect(s.found / s.total).toBeGreaterThanOrEqual(0.78);
  });

  it("garde un taux de faux positifs BAS", async () => {
    const s = await scoreCorpus(cases, detect);
    // Ces documents sont pleins d'étiquettes en majuscules (BIC, IBAN, KBIS, RUNBOOK) et de
    // raisons sociales : exactement la matière qui fait over-redact. Presidio y produit 28
    // faux positifs sur les mêmes textes, dont les mots « BIC » et « IBAN » eux-mêmes.
    expect(s.fp / s.total).toBeLessThanOrEqual(0.1);
  });
});
