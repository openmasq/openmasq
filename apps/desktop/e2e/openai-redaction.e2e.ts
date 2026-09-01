import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { config as loadEnv } from "dotenv";
import { ATTACHMENT_INLINE_NOTE } from "../../../packages/ui/src/send/foldPayload";
import { launchApp, sendPrompt, appAnswerText, awaitReply } from "./helpers";

/* Document redaction against the REAL OpenAI API.

   A CSV full of personal data is attached, and the model is asked to return a
   CONSOLIDATED CSV. We assert the whole privacy contract end-to-end:

     1. The payload that actually leaves for api.openai.com carries NO personal
        data — only the redacted placeholders. Captured at the exact boundary
        streamChat() POSTs from (main-process OPENMASQ_E2E_WIRE_LOG hook).
     2. + 3. The returned document (the consolidated CSV) is DE-redacted in the
        copy the user sees — the real emails are restored, no token leaks.

   Needs a real key in .env (OPENAI_API_KEY); skipped otherwise. Uses the
   deterministic `patterns` redaction engine so the "nothing leaked" assertion
   never depends on an LLM's recall — only OPENAI_API_KEY is required. */

loadEnv({ path: resolve(process.cwd(), "../../.env") });

const KEY = process.env.OPENAI_API_KEY;
const MODEL = "gpt-4o-mini";
const CSV_PATH = resolve(process.cwd(), "../../packages/redact/src/__fixtures__/customers.csv");
const EMAIL_RE = /[\w.+-]+@[\w.-]+\.\w+/g;
const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;

test.describe("OpenAI API — document redaction round-trip", () => {
  test.skip(!KEY, "OPENAI_API_KEY not set in .env — skipping live OpenAI test");

  test("CSV attachment → no PII sent, consolidated CSV restored on return", async () => {
    const wireLog = resolve(tmpdir(), `openmasq-wire-${process.pid}.jsonl`);
    // Forwarded into the Electron launch by launchApp (it spreads process.env):
    process.env.OPENMASQ_E2E_WIRE_LOG = wireLog;
    process.env.OPENMASQ_E2E_ATTACH = CSV_PATH; // files:pick returns this fixture

    const { app, page } = await launchApp(); // isolated profile, DB disabled
    try {
      // Seed settings LIVE: deterministic redaction + the real OpenAI key/model.
      await page.evaluate(
        ({ key, model }) => {
          const next = JSON.stringify({
            onboarded: true,
            redactEngine: "patterns",
            defaultModelId: model,
            apiKeys: { openai: key },
          });
          localStorage.setItem("openmasq.settings", next);
          window.dispatchEvent(
            new StorageEvent("storage", { key: "openmasq.settings", newValue: next }),
          );
        },
        { key: KEY, model: MODEL },
      );

      // New chat — picks up defaultModelId (gpt-4o-mini → provider "openai").
      await page.locator(".btn-new").click();

      // Attach the PII CSV via the picker (intercepted to our fixture).
      await page.locator('button[aria-label="Attach file"]').click();
      await expect(page.locator(".attach-chip").first()).toBeVisible();

      await sendPrompt(
        page,
        "Le fichier CSV en pièce jointe contient des clients. Renvoie UNIQUEMENT " +
          "un CSV consolidé avec les colonnes name,email,email_domain (le domaine " +
          "après le @). Recopie les emails EXACTEMENT tels qu'ils apparaissent, " +
          "y compris tout jeton de la forme [REDACTED_...]. Pas de texte autour.",
      );

      const { text: reply, errored } = await awaitReply(page, 180_000);
      expect(errored, `app errored instead of replying: ${reply}`).toBe(false);

      // ---------- (1) what actually left for OpenAI ----------
      const csv = readFileSync(CSV_PATH, "utf8");
      const realEmails = [...new Set(csv.match(EMAIL_RE) ?? [])];
      const realIps = [...new Set(csv.match(IPV4_RE) ?? [])];
      const wire = readFileSync(wireLog, "utf8");

      expect(realEmails.length, "fixture should contain emails").toBeGreaterThan(3);
      // The attachment reaches the wire under its MASKED name only (`safeName`): the
      // real filename is PII no detector catches and must never leave the machine.
      expect(wire, "the attachment must reach the wire under its alias").toContain(
        "=== Attached file: document-1.csv ===",
      );
      expect(wire, "real filename must not leave the machine").not.toContain("customers.csv");
      // Under the header, the model is told the content is inline and the alias exists
      // on no disk — without it a tool-happy model goes fetching "document-1" via a
      // filesystem tool and retry-loops on the miss.
      expect(wire, "the inline-content note must ride under the header").toContain(
        JSON.stringify(ATTACHMENT_INLINE_NOTE).slice(1, -1),
      );
      expect(wire, "request must target the OpenAI provider").toContain('"provider":"openai"');
      // No real personal value may appear in the OpenAI payload…
      for (const email of realEmails)
        expect(wire, `leaked email to OpenAI: ${email}`).not.toContain(email);
      for (const ip of realIps)
        expect(wire, `leaked IP to OpenAI: ${ip}`).not.toContain(ip);
      // …only the redacted placeholders did.
      expect(wire).toContain("[REDACTED_EMAIL_");

      // ---------- (2)+(3) the document the user gets back ----------
      const answer = await appAnswerText(page);
      // The consolidated CSV shown to the user has the REAL emails restored…
      const restored = realEmails.filter((e) => answer.includes(e));
      expect(
        restored.length,
        `returned document should restore real emails — got:\n${answer}`,
      ).toBeGreaterThan(0);
      // …and carries none of the redaction tokens.
      expect(answer).not.toContain("[REDACTED_");
    } finally {
      await app.close();
    }
  });
});
