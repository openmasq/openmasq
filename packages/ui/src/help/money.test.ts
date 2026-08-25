import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BILLING_CTA, RETIRED_MONEY_WORDS, retiredMoneyPattern } from "./money";

/**
 * The money lexicon can only stay unified if something CHECKS it. A synonym never comes
 * back in a redesign — it comes back one CTA at a time, written by someone who never saw
 * the other three. So this scans the package source rather than trusting a convention.
 */

const SRC = join(__dirname, "..");
/** `money.ts` DEFINES the retired words; its own doc must be allowed to name them. */
const EXEMPT = ["help/money.ts", "help/money.test.ts"];

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      sourceFiles(full, out);
    } else if (/\.tsx?$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe("le lexique de l'argent — UN mot par concept", () => {
  const files = sourceFiles(SRC).filter((f) => !EXEMPT.some((e) => f.endsWith(e)));

  it.each(RETIRED_MONEY_WORDS)("« %s » n'est plus employé nulle part", (word) => {
    const re = retiredMoneyPattern(word);
    const guilty = files
      .filter((f) => re.test(readFileSync(f, "utf8")))
      .map((f) => f.slice(SRC.length + 1));
    expect(
      guilty,
      `« ${word} » est un synonyme retiré : le produit payant s'appelle « abonnement » (voir help/money.ts)`,
    ).toEqual([]);
  });

  it("« formule » : le SENS monétaire tombe, le verbe et le nom ordinaire non", () => {
    // Sans ce partage, le garde-fou attrapait « formuler » (un verbe, dans un
    // classificateur d'intention) et « sans formule creuse » (un prompt) — et la
    // réaction naturelle, exempter le fichier, aurait amnistié un vrai « changez de
    // formule » y atterrissant plus tard.
    const re = retiredMoneyPattern("formule");
    for (const money of [
      "VOTRE FORMULE",
      "Voir les formules",
      "changez de formule",
      "une formule adaptée",
      "formule gratuite",
    ]) {
      expect(re.test(money), money).toBe(true);
    }
    for (const notMoney of [
      "propose|proposer|formule|formuler|draft",
      "Ton courtois et direct, sans formule creuse.",
      "reformule la demande plus précisément",
      "une formule de politesse",
      // Son jumeau à l'autre bout d'une lettre : `prompt/systemPrompt.ts` décrit la
      // structure d'un courrier (« une formule d'appel … une formule de politesse »).
      // Seule la SECONDE était exemptée, donc le garde-fou passait au rouge sur une
      // phrase qui ne parle pas d'argent — un faux positif qui bloquait tout
      // déploiement, puisque `verify` porte `pnpm test`.
      "une formule d'appel, des paragraphes courts",
      "une formule d’appel", // apostrophe typographique : la même phrase, un autre clavier
      // Le tableur : `=SUM(A1:B2)` est une formule au sens ordinaire, comme
      // « mathématique » ou « de politesse » — même exemption, même forme (un
      // qualificatif explicite), donc « changez de formule » reste attrapé.
      "les formules de calcul survivent à l'aller-retour",
      "le `=` de la formule de calcul est ajouté",
    ]) {
      expect(re.test(notMoney), notMoney).toBe(false);
    }
  });

  it("les boutons qui mènent au paiement portent UN libellé par intention", () => {
    expect(BILLING_CTA.see).toMatch(/abonnement/i);
    expect(BILLING_CTA.upgrade).toMatch(/abonnement/i);
    expect(BILLING_CTA.see).not.toBe(BILLING_CTA.upgrade);
  });

  it("« jetons » reste réservé au REDACTION — jamais aux unités facturées", () => {
    // Les deux sens cohabitaient dans deux onglets voisins de Réglages, dont un sur ce
    // que l'utilisateur paie. Ici : « jetons » ne doit plus apparaître dans les surfaces
    // d'usage / facturation.
    const billing = files.filter((f) => /Settings\/billing\//.test(f));
    expect(billing.length).toBeGreaterThan(0);
    const guilty = billing
      .filter((f) => /jetons/i.test(readFileSync(f, "utf8")))
      .map((f) => f.slice(SRC.length + 1));
    expect(guilty, "dans la facturation, l'unité facturée se dit « tokens »").toEqual([]);
  });
});
