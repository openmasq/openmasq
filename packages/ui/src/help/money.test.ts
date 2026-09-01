import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getMessages, LOCALES } from "@openmasq/i18n";
import { RETIRED_MONEY_WORDS, retiredMoneyPattern } from "./money";

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
    // Without this split, the guard caught « formuler » (a verb, in an intent
    // classifier) and « sans formule creuse » (a prompt) — and the natural reaction,
    // exempting the file, would have amnestied a real « changez de formule » landing
    // there later.
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
      // Its twin at the other end of a letter: `prompt/systemPrompt.ts` describes the
      // structure of a letter (« une formule d'appel … une formule de politesse »).
      // Only the SECOND was exempt, so the guard went red on a sentence that says
      // nothing about money — a false positive that blocked every deployment, since
      // `verify` carries `pnpm test`.
      "une formule d'appel, des paragraphes courts",
      "une formule d’appel", // typographic apostrophe: the same sentence, another keyboard
      // The spreadsheet: `=SUM(A1:B2)` is a formula in the ordinary sense, like
      // « mathématique » or « de politesse » — same exemption, same shape (an explicit
      // qualifier), so « changez de formule » is still caught.
      "les formules de calcul survivent à l'aller-retour",
      "le `=` de la formule de calcul est ajouté",
    ]) {
      expect(re.test(notMoney), notMoney).toBe(false);
    }
  });

  it("les boutons qui mènent au paiement portent UN libellé par intention", () => {
    const fr = getMessages("fr").billing;
    expect(fr.ctaSee).toMatch(/abonnement/i);
    expect(fr.ctaUpgrade).toMatch(/abonnement/i);
    // In each language the two intents stay TWO labels — and the product's word is not
    // translated as « plan »: English says « subscription ».
    for (const locale of LOCALES) {
      const b = getMessages(locale).billing;
      expect(b.ctaSee).not.toBe(b.ctaUpgrade);
      expect(b.ctaSee + b.ctaUpgrade).toMatch(/abonnement|subscription/i);
    }
  });

  it("« jetons » reste réservé au REDACTION — jamais aux unités facturées", () => {
    // The two senses coexisted in two neighbouring Settings tabs, one of them about what
    // the user pays. Here: « jetons » must no longer appear in the usage / billing
    // surfaces.
    const billing = files.filter((f) => /Settings\/billing\//.test(f));
    expect(billing.length).toBeGreaterThan(0);
    const guilty = billing
      .filter((f) => /jetons/i.test(readFileSync(f, "utf8")))
      .map((f) => f.slice(SRC.length + 1));
    expect(guilty, "dans la facturation, l'unité facturée se dit « tokens »").toEqual([]);
  });
});
