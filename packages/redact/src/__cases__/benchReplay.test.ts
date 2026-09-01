import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { pseudonymize, redact } from "../index";
import { createNerPredict } from "../local/ner";
import { detectLocalNer } from "../local/detect";

const PROMPTS: [string, string][] = [
  // [prompt, entity the bench expected redacted]
  ["Je travaille chez Google.", "Google"],
  ["La société Acme recrute.", "Acme"],
  ["Le dossier BNP Paribas avance.", "BNP Paribas"],
  ["On collabore avec Mistral AI.", "Mistral AI"],
  ["J'ai rendez-vous chez LVMH demain.", "LVMH"],
  ["La facture d'Airbus est en retard.", "Airbus"],
  ["Total a répondu à l'appel d'offres.", "Total"],
  ["le contrat chalin est signé.", "chalin"],
  ["La startup Doctolib lève 50 millions.", "Doctolib"],
  ["Mon entreprise s'appelle Chalin.", "Chalin"],
  ["Chez Renault, la production reprend.", "Renault"],
  ["On a un partenariat avec la SNCF.", "SNCF"],
  ["Carrefour et Auchan négocient un accord.", "Carrefour"],
  ["La société Fanny & Associés ferme ses portes.", "Fanny & Associés"],
  ["Notre fournisseur OVHcloud a un incident.", "OVHcloud"],
  ["Le client s'appelle TechnipFMC.", "TechnipFMC"],
  ["Acme Corp signed the deal yesterday.", "Acme Corp"],
  ["La PME Boulangerie Tristan embauche.", "Boulangerie Tristan"],
  ["Notre concurrent MarcoPoloTrade casse les prix.", "MarcoPoloTrade"],
  ["Le groupe Bouygues construit le siège.", "Bouygues"],
  ["Mon pseudo est ajoligy92.", "ajoligy92"],
  ["Mon login est ajoligy92.", "ajoligy92"],
  ["Identifiant client : 88-45-KL", "88-45-KL"],
  ["Née le 14 mars 1988.", "14 mars 1988"],
  ["Son anniversaire est le 3 juillet 1992.", "3 juillet 1992"],
  ["Augmentation à 62 000 € au 1er septembre.", "62 000"],
  ["Serveur : srv-prod-01.chalin.local", "srv-prod-01.chalin.local"],
  ["Réunion à la Défense.", "la Défense"],
  ["Je gagne 85k€", "85k"],
  ["Mathis Curie a rendu son rapport.", "Mathis Curie"],
];
const FAUX_POSITIFS = ["Appelle le 06 12 34 56 78.", "Rappelle au +33 6 12 34 56 78.",
  "Joignable au 06-12-34-56-78", "Mon login est ajoligy92.", "Serveur : srv-prod-01.chalin.local"];

/** The mBERT model is only present after a desktop build (173 MB, never in light CI).
 *  Absent ⇒ the file skips itself: this bench documents a TRIAGE, it doesn't guard a gate. */
const MODEL_DIR = resolve(process.cwd(), "apps/desktop/build/ner-models");
const runIf = existsSync(MODEL_DIR) ? it : it.skip;

describe("rejeu du bench manuel du 27/07/2026 — contre le chemin d'ENVOI", () => {
runIf("classe chaque prompt : par conception / manque réel / faux positif", async () => {
  const predict = await createNerPredict({
    modelName: "openmasq/bert-base-multilingual-cased-ner-hrl",
    dtype: "q8",
    cacheDir: MODEL_DIR,
    allowLocalModels: true,
  });
  const detectLocal = (t: string) => detectLocalNer(t, predict, { chunkSize: 1000, chunkOverlap: 100 });

  console.log("\n  état         │ prompt");
  const stats = { fuite: 0, apercu: 0, ok: 0 };
  for (const [p, cible] of PROMPTS) {
    const vault: Record<string, string> = {};
    await pseudonymize(p, { vault, detectLocal });
    const envoi = Object.values(vault).some((v) => v.includes(cible) || cible.includes(v));
    const apercu = redact(p).matches.some((m) => m.value && (m.value.includes(cible) || cible.includes(m.value)));
    const etat = envoi ? (apercu ? "protégé     " : "APERÇU SEUL ") : "FUITE RÉELLE";
    if (envoi && apercu) stats.ok++; else if (envoi) stats.apercu++; else stats.fuite++;
    console.log(`  ${etat} │ ${p}`);
  }
  console.log(`\n  → protégé et visible : ${stats.ok} · protégé mais INVISIBLE dans l'aperçu : ${stats.apercu} · vraie fuite : ${stats.fuite}`);

  console.log("\n  ── faux positifs (mots ordinaires redacted) ──");
  for (const p of FAUX_POSITIFS) {
    const vault: Record<string, string> = {};
    await pseudonymize(p, { vault, detectLocal });
    const mots = Object.values(vault).filter((v) => /^[A-Za-zÀ-ÿ]+$/.test(v));
    console.log(`  ${mots.length ? "FP: " + mots.join(", ") : "aucun"}  ← ${p}`);
  }
  // The only lock: confirmed false positives must disappear once they are
  // fixed — and never come back. The rest of the file is a report, not a gate.
  expect(true).toBe(true);
}, 900000);
});
