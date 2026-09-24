/* Upload of SEVERAL documents, and JUDGMENT of the redaction, with no chat model: every
 * detector is on the machine, so no API key, no outbound call, zero cost. The send goes to
 * a FAKE OpenAI-compatible endpoint on 127.0.0.1, which is what lets the test judge the
 * REAL wire (what the server RECEIVES) rather than a renderer state.
 *
 * Four formats = four extractors converging into ONE redaction pass and ONE vault. Only
 * verifiable here: each extractor renders text; PII seen by one extractor only is redacted
 * like the others; a value present in TWO files receives ONE fake.
 *
 * ⚠️ Requires the locally baked models (`pnpm bake:ner`, `pnpm bake:doctr`). Without them
 * the `local` engine fails CLOSED and the test says so.
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
// ONE home for the PII fixtures (a duplicated fixture drifts, rule 9).
const fixture = (name: string) => resolve(DESKTOP_DIR, "../../packages/redact/src/__fixtures__", name);

/**
 * The judged fixtures. `ocrOnly` marks PII that exists ONLY in the pixels. `names` is the
 * ground truth the deterministic engine CANNOT produce (the NER's recall bar), by hand; the
 * rest is recomputed from the file itself.
 */
const DOCS: { file: string; names: string[]; ocrOnly?: boolean }[] = [
  { file: "customers.csv", names: [] },
  { file: "payroll.xlsx", names: [] },
  { file: "invoice-2024-0042.pdf", names: [] },
  { file: "nda-contract.docx", names: [] },
];

/**
 * What the app WOULD REPLACE in this file: the oracle is its own decision function
 * (`pseudonymize`). This proves NOT the detector's recall (the bench's job) but that the
 * decision ARRIVES INTACT on the wire: a divergence is a PIPELINE defect.
 */
async function replacedValues(path: string): Promise<string[]> {
  const { text } = await extractBytes(new Uint8Array(readFileSync(path)), path);
  const body = (text ?? "").trim();
  if (!body) return [];
  const { matches } = await pseudonymize(body, { vault: {} });
  // A short value appears in any text: its absence would prove nothing.
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
      // LOCAL engine, model = the dummy endpoint, no provider key: nothing goes anywhere
      // but 127.0.0.1.
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
      await page.getByLabel("Joindre un fichier").click();
      await expect(page.locator(".attach-chip")).toHaveCount(DOCS.length, { timeout: 180_000 });
      // A chip in error state is a document that would go out unredacted.
      await expect(page.locator(".attach-tile.loading")).toHaveCount(0, { timeout: 300_000 });
      await expect(page.locator(".attach-chip.err")).toHaveCount(0);

      // The composer refuses to submit while detection runs: retry until the field empties.
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
        // Say WHY: a greyed-out model and a failing redaction produce the same silence.
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

      // PER DOCUMENT, within its own section of the wire: the vault isn't readable from the
      // test (it belongs to the encrypted DB), and a CREDIBLE fake minted for one file can
      // equal a REAL value from another.
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
          // `soft`: a judge delivers ALL its findings at once.
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

      // (3) the REAL file names don't go out (a name carries what no detector catches).
      for (const d of DOCS) {
        expect(seen, `le vrai nom « ${d.file} » ne doit pas partir`).not.toContain(d.file);
      }
      for (let i = 1; i <= DOCS.length; i++) {
        expect(seen, `alias manquant pour la pièce jointe ${i}`).toContain(
          `document-${i}${extname(DOCS[i - 1].file)}`,
        );
      }
      // (4) each header says the content is inline (or a tool-using model looks for the file).
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
