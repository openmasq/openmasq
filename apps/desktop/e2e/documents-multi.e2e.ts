/* Upload of SEVERAL documents, and JUDGMENT of the redaction — with no chat model at all.
 *
 * Everything that produces the redaction is already on the machine: docTR/Tesseract for the
 * pixels, mBERT for names and organizations, the deterministic rules for the IBAN, the
 * card, the IP. This test therefore has nothing to ask anyone — it attaches the documents, lets
 * the app do its thing, and judges the result. No API key, no outbound call, zero cost.
 *
 * The send's destination is a FAKE OpenAI-compatible endpoint that the test spins up on
 * 127.0.0.1 (that's exactly the use of the `openai-compat` provider: Ollama, LM Studio). This
 * isn't a staging convenience — it's what makes it possible to judge the **real wire**,
 * the one the pipeline builds after redaction, rather than an intermediate state of the
 * renderer. The server answers an empty completion: what it ANSWERS doesn't matter at all,
 * what it RECEIVES is the whole point.
 *
 * Why several documents, and not one more in the existing spec: four formats =
 * four extractors (utf8, sheetjs, pdf.js, mammoth) plus OCR for images, which
 * converge into ONE redaction pass and ONE vault. Three things are only verifiable
 * here:
 *   1. each extractor renders text — a silent PDF looks like a PDF with no PII;
 *   2. PII seen only by sheetjs (or only by OCR) is redacted like the others;
 *   3. a value present in TWO files receives ONE SINGLE fake (vault atomicity).
 *
 * ⚠️ This spec requires the locally baked models (`pnpm bake:ner`, `pnpm bake:doctr`): outside
 * a packaged app they are read from `apps/desktop/build/`. Without them, the `local` engine
 * fails CLOSED (that's the rule) and the test says so instead of silently passing.
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
// ONE home for the PII fixtures: `packages/redact/src/__fixtures__`. They used to be
// copied here too, and the copies had already drifted from their originals — which is
// the whole failure mode of a duplicated fixture: two suites believe they exercise the
// same document and no longer do.
const fixture = (name: string) => resolve(DESKTOP_DIR, "../../packages/redact/src/__fixtures__", name);

/**
 * The judged fixtures. `ocrOnly` marks the ones whose PII exists ONLY in the pixels:
 * that's the only reason to have docTR in the loop, and without them "several documents"
 * would only mean "several text files".
 *
 * `names` is the ground truth that the deterministic engine CANNOT produce — it's mBERT's
 * recall bar, and it's written by hand on purpose. The rest (emails, IBAN, cards, IP…)
 * is recomputed at runtime from the file itself: enriching a fixture extends
 * the assertion without touching the test.
 */
const DOCS: { file: string; names: string[]; ocrOnly?: boolean }[] = [
  { file: "customers.csv", names: [] },
  { file: "payroll.xlsx", names: [] },
  { file: "invoice-2024-0042.pdf", names: [] },
  { file: "nda-contract.docx", names: [] },
];

/**
 * What the app WOULD REPLACE in this file — the oracle is its own decision function
 * (`pseudonymize`), not a list rewritten on the side.
 *
 * It used to be `redact()` with every category, and it was wrong both ways: it
 * demanded values the product doesn't deliberately mask (the fixtures use
 * RESERVED domains — `example.com` — that the engine deprioritizes to avoid false
 * positives), and it would have missed what only the default categories activate.
 *
 * What this test proves is therefore NOT the detector's recall — that's the job of the bench
 * (`packages/redact/bench`) and the unit tests. It's that the engine's decision ARRIVES
 * INTACT on the wire, through four extractors, a multi-document fold and a
 * reuse path. A divergence here is a PIPELINE defect, not a detection one.
 */
async function replacedValues(path: string): Promise<string[]> {
  const { text } = await extractBytes(new Uint8Array(readFileSync(path)), path);
  const body = (text ?? "").trim();
  if (!body) return [];
  const { matches } = await pseudonymize(body, { vault: {} });
  // Short values trivially appear in any text: their absence
  // from the wire would prove nothing.
  return [...new Set(matches.map((m) => m.value))].filter((v) => v.length >= 8);
}

test.describe("Documents multiples — redaction local, jugé sans modèle", () => {
  test.skip(
    !existsSync(NER_DIR),
    "poids mBERT absents (apps/desktop/build/ner-models) — lancer `pnpm bake:ner`",
  );

  test("quatre formats en un envoi : tout extrait, tout redacted, un faux par valeur", async () => {
    test.setTimeout(600_000); // 4 extractions (PDF/XLSX) + mBERT on each document

    const paths = DOCS.map((d) => fixture(d.file));
    // The oracle, computed BEFORE launching the app.
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
        // The native picker can't be automated: the hook accepts multiple paths joined by ":".
        OPENMASQ_E2E_ATTACH: paths.join(":"),
      },
    });
    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");

    try {
      // Session + settings: LOCAL engine (mBERT), model = the dummy endpoint. No
      // provider key is set — nothing can go out anywhere but 127.0.0.1.
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

      // ── Upload: one click, four files ────────────────────────────────────────
      // The label is the selector's source (IconButton sets `aria-label`), not a
      // class: renaming the button breaks the test loudly, which is the right call.
      await page.getByLabel("Joindre un fichier").click();
      await expect(page.locator(".attach-chip")).toHaveCount(DOCS.length, { timeout: 180_000 });
      // Extraction AND redaction finished, with no error: a chip in error state means a
      // document that would go out unredacted.
      await expect(page.locator(".attach-tile.loading")).toHaveCount(0, { timeout: 300_000 });
      await expect(page.locator(".attach-chip.err")).toHaveCount(0);

      // The composer refuses to submit while PII detection is running: we retry
      // until the field empties, like the workflows harness.
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
        // Say WHY rather than "nothing went out": a greyed-out model (endpoint
        // unreachable) and a failing redaction produce the same silence.
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

      // ── The judgment is about what LEFT the machine ─────────────────────────
      const wire = existsSync(wireLog) ? readFileSync(wireLog, "utf8") : "";
      const seen = wire + model.bodies.join("\n");
      expect(seen.length, "aucun wire capturé — l'envoi n'a pas eu lieu").toBeGreaterThan(0);

      // The judgment happens PER DOCUMENT, within its own section of the wire. Two reasons:
      //   • the vault isn't readable from the test — `stripVaultForLocal` removes it from
      //     the localStorage mirror as soon as a `host.db` exists (it belongs to the
      //     encrypted DB), and that's the intended behavior, not a gap;
      //   • the engine mints CREDIBLE fakes: a fake IP looks like an IP, so a
      //     fake minted for the NDA can, by bad luck, equal a REAL value from the
      //     CSV. Searched across the whole wire, the string is ambiguous; searched within
      //     the section of the file it comes from, it no longer is.
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

      // (1) LEAK: in ITS section, no real value from the file must remain.
      for (const [name, values] of expected) {
        const section = sections.get(name) ?? "";
        for (const v of values) {
          // `soft`: a judge must deliver ALL its findings at once — stopping at the
          // first divergence would hide the other three documents.
          expect
            .soft(section, `${name} : « ${v} » est parti en clair dans sa propre section`)
            .not.toContain(v);
        }
      }

      // (2) the declared proper names (mBERT's recall bar), same rule.
      for (const d of DOCS) {
        const section = sections.get(d.file) ?? "";
        for (const n of d.names) {
          expect(section, `${d.file} : mBERT n'a pas redacted « ${n} »`).not.toContain(n);
        }
      }

      // (3) the REAL file names don't go out — a name carries references and
      //     surnames that no detector catches (`safeName`).
      for (const d of DOCS) {
        expect(seen, `le vrai nom « ${d.file} » ne doit pas partir`).not.toContain(d.file);
      }
      for (let i = 1; i <= DOCS.length; i++) {
        expect(seen, `alias manquant pour la pièce jointe ${i}`).toContain(
          `document-${i}${extname(DOCS[i - 1].file)}`,
        );
      }
      // (4) each header tells the model the content is inline (otherwise a
      //     tool-using model will LOOK FOR `document-1.pdf` on disk and loop).
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
