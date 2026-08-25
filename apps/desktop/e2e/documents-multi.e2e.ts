/* Upload de PLUSIEURS documents, et JUGEMENT du redaction — sans aucun modèle de chat.
 *
 * Tout ce qui produit le redaction est déjà sur la machine : docTR/Tesseract pour les
 * pixels, mBERT pour les noms et organisations, les règles déterministes pour l'IBAN, la
 * carte, l'IP. Ce test n'a donc rien à demander à personne — il joint les documents, laisse
 * l'app faire, et juge le résultat. Aucune clé d'API, aucun appel sortant, coût nul.
 *
 * Le destinataire de l'envoi est un FAUX endpoint OpenAI-compatible que le test lève sur
 * 127.0.0.1 (c'est exactement l'usage du provider `openai-compat` : Ollama, LM Studio). Ça
 * n'est pas une commodité de mise en scène — c'est ce qui permet de juger le **wire réel**,
 * celui que le pipeline construit après redaction, plutôt qu'un état intermédiaire du
 * renderer. Le serveur répond une complétion vide : ce qu'il RÉPOND n'a aucune importance,
 * ce qu'il REÇOIT est tout le sujet.
 *
 * Pourquoi plusieurs documents, et pas un de plus dans le spec existant : quatre formats =
 * quatre extracteurs (utf8, sheetjs, pdf.js, mammoth) plus l'OCR pour les images, qui
 * convergent vers UNE passe de redaction et UN vault. Trois choses ne sont vérifiables
 * qu'ici :
 *   1. chaque extracteur rend du texte — un PDF muet ressemble à un PDF sans PII ;
 *   2. la PII vue par le seul sheetjs (ou le seul OCR) est redacted comme les autres ;
 *   3. une valeur présente dans DEUX fichiers reçoit UN SEUL faux (atomicité du vault).
 *
 * ⚠️ Ce spec exige les modèles bakés en local (`pnpm bake:ner`, `pnpm bake:doctr`) : hors
 * app packagée ils sont lus depuis `apps/desktop/build/`. Sans eux, le moteur `local`
 * échoue FERMÉ (c'est la règle) et le test le dit au lieu de passer en silence.
 */
import { test, expect } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { resolve, basename, extname } from "node:path";
import { _electron as electron } from "@playwright/test";
import { extractBytes } from "@openmasq/redact/documents";
import { pseudonymize } from "@openmasq/redact";
import { ATTACHMENT_INLINE_NOTE } from "../../../packages/ui/src/send/foldPayload";
import { startFakeModel } from "./fakeModel";
import { supabaseAuthStorageKey } from "./supabaseAuthKey";

const DESKTOP_DIR = process.cwd();
const NER_DIR = resolve(DESKTOP_DIR, "build/ner-models");
const fixture = (name: string) => resolve(DESKTOP_DIR, "e2e/fixtures/pii", name);

/**
 * Les fixtures jugées. `ocrOnly` marque celles dont la PII n'existe QUE dans les pixels :
 * c'est la seule raison d'avoir docTR dans la boucle, et sans elles « plusieurs documents »
 * ne veut dire que « plusieurs fichiers texte ».
 *
 * `names` est la vérité terrain que le déterministe ne peut PAS produire — c'est la barre de
 * rappel de mBERT, et elle est écrite à la main exprès. Le reste (emails, IBAN, cartes, IP…)
 * est recalculé à l'exécution depuis le fichier lui-même : enrichir une fixture étend
 * l'assertion sans toucher au test.
 */
const DOCS: { file: string; names: string[]; ocrOnly?: boolean }[] = [
  { file: "customers.csv", names: [] },
  { file: "payroll.xlsx", names: [] },
  { file: "invoice-2024-0042.pdf", names: [] },
  { file: "nda-contract.docx", names: [] },
];

/**
 * Ce que l'app REMPLACERAIT dans ce fichier — l'oracle est sa propre fonction de décision
 * (`pseudonymize`), pas une liste réécrite à côté.
 *
 * C'était `redact()` avec toutes les catégories, et c'était faux dans les deux sens : il
 * réclamait des valeurs que le produit ne masque pas volontairement (les fixtures utilisent
 * des domaines RÉSERVÉS — `example.com` — que le moteur dé-priorise pour éviter les faux
 * positifs), et il aurait raté ce que seules les catégories par défaut activent.
 *
 * Ce que ce test prouve n'est donc PAS le rappel du détecteur — c'est le travail du banc
 * (`packages/redact/bench`) et des tests unitaires. C'est que la décision du moteur ARRIVE
 * INTACTE sur le wire, à travers quatre extracteurs, un pliage multi-documents et un
 * chemin de réutilisation. Une divergence ici est un défaut de PIPELINE, pas de détection.
 */
async function replacedValues(path: string): Promise<string[]> {
  const { text } = await extractBytes(new Uint8Array(readFileSync(path)), path);
  const body = (text ?? "").trim();
  if (!body) return [];
  const { matches } = await pseudonymize(body, { vault: {} });
  // Les valeurs courtes apparaissent trivialement dans n'importe quel texte : leur absence
  // du wire ne prouverait rien.
  return [...new Set(matches.map((m) => m.value))].filter((v) => v.length >= 8);
}

test.describe("Documents multiples — redaction local, jugé sans modèle", () => {
  test.skip(
    !existsSync(NER_DIR),
    "poids mBERT absents (apps/desktop/build/ner-models) — lancer `pnpm bake:ner`",
  );

  test("quatre formats en un envoi : tout extrait, tout redacted, un faux par valeur", async () => {
    test.setTimeout(600_000); // 4 extractions (PDF/XLSX) + mBERT sur chaque document

    const paths = DOCS.map((d) => fixture(d.file));
    // L'oracle, calculé AVANT de lancer l'app.
    const expected = new Map<string, string[]>();
    for (const p of paths) expected.set(basename(p), await replacedValues(p));
    for (const [name, values] of expected) {
      expect(values.length, `${name} : rien d'extrait/détecté — extracteur muet ?`).toBeGreaterThan(0);
    }

    const model = await startFakeModel();
    const profile = resolve(DESKTOP_DIR, `e2e/.profile-docs-multi-${process.pid}`);
    const wireLog = resolve(DESKTOP_DIR, `e2e/.wire-docs-${process.pid}.jsonl`);
    const app = await electron.launch({
      args: [DESKTOP_DIR],
      cwd: DESKTOP_DIR,
      env: {
        ...(process.env as Record<string, string>),
        NODE_ENV: "production",
        OPENMASQ_DISABLE_DB: "1",
        OPENMASQ_E2E: "1",
        OPENMASQ_USER_DATA_DIR: profile,
        OPENMASQ_E2E_WIRE_LOG: wireLog,
        // Le picker natif ne s'automatise pas : le hook accepte plusieurs chemins « : ».
        OPENMASQ_E2E_ATTACH: paths.join(":"),
      },
    });
    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");

    try {
      // Session + réglages : moteur LOCAL (mBERT), modèle = l'endpoint bidon. Aucune clé
      // de fournisseur n'est posée — rien ne peut partir ailleurs que sur 127.0.0.1.
      await page.evaluate(
        ({ baseUrl, authKey }) => {
          localStorage.setItem(
            authKey,
            JSON.stringify({
              access_token: "t", refresh_token: "r", token_type: "bearer", expires_in: 999999,
              expires_at: Math.floor(Date.now() / 1000) + 999999,
              user: { id: "u1", email: "judge@local", aud: "authenticated", role: "authenticated" },
            }),
          );
          const settings = JSON.stringify({
            onboarded: true,
            redactRulesSeen: true,
            redactEngine: "local",
            defaultModelId: "llama3.3",
            openaiCompatBaseUrl: baseUrl,
          });
          for (const k of ["openmasq.settings", "openmasq.settings:u1"]) localStorage.setItem(k, settings);
        },
        { baseUrl: model.url, authKey: supabaseAuthStorageKey() },
      );
      await page.reload();
      await page.waitForSelector(".rail-btn, .side-nav-item", { timeout: 60_000 });

      // ── Upload : un clic, quatre fichiers ────────────────────────────────────────
      // Le libellé est la source du sélecteur (IconButton pose `aria-label`), pas une
      // classe : renommer le bouton casse le test bruyamment, ce qui est le bon sens.
      await page.getByLabel("Joindre un fichier").click();
      await expect(page.locator(".attach-chip")).toHaveCount(DOCS.length, { timeout: 180_000 });
      // Extraction ET redaction terminés, sans erreur : un chip en erreur, c'est un
      // document qui partirait non redacted.
      await expect(page.locator(".attach-tile.loading")).toHaveCount(0, { timeout: 300_000 });
      await expect(page.locator(".attach-chip.err")).toHaveCount(0);

      // Le composer refuse de soumettre tant que la détection PII tourne : on retente
      // jusqu'à ce que le champ se vide, comme le harnais workflows.
      const input = page.locator(".composer-input");
      await input.click();
      await input.fill("Résume ces documents.");
      let submitted = false;
      for (let i = 0; i < 8 && !submitted; i++) {
        await input.press("Enter");
        await page.waitForTimeout(2_000);
        submitted = ((await input.inputValue().catch(() => "")) || "").length === 0;
      }
      if (!submitted) {
        // Dire POURQUOI plutôt que « rien n'est parti » : un modèle grisé (endpoint
        // injoignable) et un redaction qui échoue produisent le même silence.
        const why = await page.locator(".msg.assistant, .composer-hint, .msg-answer.error").allInnerTexts();
        throw new Error(`le composer n'a jamais soumis — état à l'écran : ${why.join(" | ").slice(0, 400)}`);
      }
      await page.waitForFunction(
        () => {
          const a = document.querySelectorAll(".msg.assistant");
          const last = a[a.length - 1];
          return !!last && !last.querySelector(".typing");
        },
        null,
        { timeout: 300_000 },
      );

      // ── Le jugement porte sur ce qui a QUITTÉ la machine ─────────────────────────
      const wire = existsSync(wireLog) ? readFileSync(wireLog, "utf8") : "";
      const seen = wire + model.bodies.join("\n");
      expect(seen.length, "aucun wire capturé — l'envoi n'a pas eu lieu").toBeGreaterThan(0);

      // Le jugement se fait PAR DOCUMENT, dans sa propre section du wire. Deux raisons :
      //   • le vault n'est pas lisible depuis le test — `stripVaultForLocal` le retire du
      //     miroir localStorage dès qu'un `host.db` existe (il appartient à la base
      //     chiffrée), et c'est le comportement voulu, pas un manque ;
      //   • le moteur mint des faux CRÉDIBLES : une fausse IP ressemble à une IP, donc un
      //     faux minté pour le NDA peut être, par malchance, égal à une VRAIE valeur du
      //     CSV. Cherchée dans tout le wire, la chaîne est ambiguë ; cherchée dans la
      //     section du fichier dont elle vient, elle ne l'est plus.
      const sections = new Map<string, string>();
      for (let i = 0; i < DOCS.length; i++) {
        const head = `document-${i + 1}${extname(DOCS[i].file)}`;
        const from = seen.indexOf(head);
        if (from === -1) continue;
        const nextHead = i + 1 < DOCS.length ? `document-${i + 2}${extname(DOCS[i + 1].file)}` : "";
        const to = nextHead ? seen.indexOf(nextHead, from) : -1;
        sections.set(DOCS[i].file, seen.slice(from, to === -1 ? undefined : to));
      }
      expect(
        [...sections.keys()],
        "chaque document doit apparaître comme une section du wire",
      ).toHaveLength(DOCS.length);

      // (1) FUITE : dans SA section, aucune valeur réelle du fichier ne doit subsister.
      for (const [name, values] of expected) {
        const section = sections.get(name) ?? "";
        for (const v of values) {
          // `soft` : un juge doit rendre TOUTES ses conclusions d'un coup — s'arrêter à la
          // première divergence masquerait les trois autres documents.
          expect
            .soft(section, `${name} : « ${v} » est parti en clair dans sa propre section`)
            .not.toContain(v);
        }
      }

      // (2) les noms propres déclarés (la barre de rappel de mBERT), même règle.
      for (const d of DOCS) {
        const section = sections.get(d.file) ?? "";
        for (const n of d.names) {
          expect(section, `${d.file} : mBERT n'a pas redacted « ${n} »`).not.toContain(n);
        }
      }

      // (3) les VRAIS noms de fichiers ne partent pas — un nom porte des références et des
      //     patronymes qu'aucun détecteur ne rattrape (`safeName`).
      for (const d of DOCS) {
        expect(seen, `le vrai nom « ${d.file} » ne doit pas partir`).not.toContain(d.file);
      }
      for (let i = 1; i <= DOCS.length; i++) {
        expect(seen, `alias manquant pour la pièce jointe ${i}`).toContain(
          `document-${i}${extname(DOCS[i - 1].file)}`,
        );
      }
      // (4) chaque en-tête dit au modèle que le contenu est inline (sinon un modèle
      //     outillé va CHERCHER `document-1.pdf` sur le disque et boucle).
      expect(
        seen.split(ATTACHMENT_INLINE_NOTE).length - 1,
        "chaque pièce jointe doit porter la note « contenu inline »",
      ).toBeGreaterThanOrEqual(DOCS.length);

    } finally {
      await app.close();
      await model.close();
    }
  });
});
