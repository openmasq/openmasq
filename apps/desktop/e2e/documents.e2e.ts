/* Generated documents (fence ```document) — generation + EDITING, against the real
   OpenRouter API (free model by default → zero cost), on the workflows suite's
   harness (isolated built app, seeded session, `patterns` engine, wire log).

     OPENROUTER_API_KEY   required (root .env) — otherwise the suite is skipped (the
                          editing test needs a send to GO OUT to capture the wire).
     E2E_MODEL            model id (default: the workflows suite's free one).
     E2E_STRICT           "1" = model CONFORMANCE assertions (the fence properly
                          emitted, the email carried over in the letter) — otherwise only the
                          deterministic (privacy) assertions are hard.

   Invariants ALWAYS checked (deterministic):
     1. EDITING (test A — the model doesn't need to answer): a PII typed BY HAND
        into the document card's editor enters the VAULT on save
        (`redactEditedText` — the card re-renders it marked), the edit SURVIVES a
        reload, and the next turn goes out with the edit in the history BUT WITHOUT the
        PII in the clear (buildWireHistory replays the vault — this is the hole that the
        editing pass closes, pinned here end to end).
     2. GENERATION (test B): the prompt asking for a letter carries a real email;
        the wire NEVER contains it (`patterns` engine), even though the app may
        display it in the clear on the user's side. */

import { test, expect } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { KEY, MODEL, STRICT } from "./workflows/env";
import { launchWorkflowApp, seedSession, selectModel, submitPrompt } from "./workflows/harness";

/** PII that the test TYPES into the editor — must never reach the wire. */
const TYPED_EMAIL = "marceline.brivet@exemple-test.fr";
/** Inert marker (not PII) added by the edit — MUST reach the wire:
 *  it's the proof that the edit is indeed in the history sent back to the model. */
const EDIT_MARKER = "SECTION-AJOUTEE-E2E";
/** PII from the generation prompt (test B). */
const PROMPT_EMAIL = "camille.vernay@exemple-corp.fr";

const DOC_BODY = [
  "# Attestation de partenariat",
  "",
  "Madame, Monsieur,",
  "",
  "Nous confirmons le partenariat entre nos deux structures pour l'année en cours.",
  "",
  "Cordialement.",
].join("\n");

/** Test A's seeded conversation: an already-finished exchange whose answer
 *  contains the document — no model call needed to get it. */
function seededConversation() {
  const now = Date.now();
  return {
    id: "e2e-doc-conv",
    title: "Attestation (e2e documents)",
    modelId: MODEL,
    messages: [
      { id: "e2e-doc-u1", role: "user", content: "Rédige une attestation de partenariat." },
      {
        id: "e2e-doc-a1",
        role: "assistant",
        content: `Voici le document :\n\n\`\`\`document\n${DOC_BODY}\n\`\`\`\n`,
      },
    ],
    createdAt: now - 60_000,
    updatedAt: now,
  };
}

/** Waits until the wire log contains a request satisfying `has` — the CHAT send
 *  isn't necessarily the first line (the "tool router" pre-call goes out
 *  before it and doesn't carry the history). Then returns the ENTIRE log (the
 *  PII-absence assertions sweep every request, router included). */
async function waitForWire(path: string, has: string, timeoutMs = 120_000): Promise<string> {
  const start = Date.now();
  for (;;) {
    if (existsSync(path)) {
      const raw = readFileSync(path, "utf8");
      if (raw.includes(has)) return raw;
    }
    if (Date.now() - start > timeoutMs)
      throw new Error(`aucune requête wire ne contient « ${has} » après ${timeoutMs}ms`);
    await new Promise((r) => setTimeout(r, 1_000));
  }
}

test.describe(`Documents générés — ${MODEL}`, () => {
  test.skip(!KEY, "OPENROUTER_API_KEY absent du .env racine — suite live skippée");

  test("édition : la PII tapée entre au vault, persiste, et ne part jamais en clair", async () => {
    test.setTimeout(300_000);
    const { app, page, wireLog } = await launchWorkflowApp("doc-edit");
    try {
      await seedSession(page, {
        "openmasq.conversations:u1": JSON.stringify([seededConversation()]),
        "openmasq.activeId:u1": "e2e-doc-conv",
      });

      // The seeded conversation opens (activeId) — otherwise, find it back by its title.
      const card = page.locator(".md-document-card");
      if ((await card.count().catch(() => 0)) === 0) {
        await page.getByText("Attestation (e2e documents)").first().click().catch(() => {});
      }
      await expect(card).toBeVisible({ timeout: 20_000 });
      await expect(card).toContainText("Attestation de partenariat");

      // Edit → add a new PII + the inert marker → Save.
      await card.getByRole("button", { name: /Modifier/ }).click();
      const editor = page.locator(".md-document-editor");
      await expect(editor).toBeVisible();
      const source = await editor.inputValue();
      await editor.fill(`${source}\nContact : ${TYPED_EMAIL}\nRéférence : ${EDIT_MARKER}.`);
      await card.getByRole("button", { name: /^Enregistrer/ }).click();
      await expect(editor).toBeHidden({ timeout: 20_000 });
      await expect(card).toContainText(EDIT_MARKER);

      // The edit redaction pass has run: the typed email is MARKED (it's
      // in the vault, rehypeRedact finds it) — not free text.
      await expect(card.locator("mark.redaction-mark", { hasText: TYPED_EMAIL })).toBeVisible({
        timeout: 10_000,
      });

      // Next turn: the history (including the edited document) goes out re-redacted.
      await selectModel(page);
      await submitPrompt(page, "Améliore la formulation de ce document, sans changer les coordonnées.");
      // The chat send (the one carrying the history, hence the marker) has gone out…
      const wire = await waitForWire(wireLog, EDIT_MARKER);
      // …and across ALL requests in the log, the typed PII NEVER appears in the clear.
      expect(wire).not.toContain(TYPED_EMAIL);
      // (No waiting for the answer: the invariant is about what goes OUT, and a
      // reload mid-stream is a handled case — `clearStuckPending`.)

      // Persistence: the edit survives an app reload. The localStorage mirror
      // is DEBOUNCED (700 ms) — wait for the snapshot to carry the edit before
      // reloading (a deterministic sync point, not an arbitrary timeout).
      // ⚠️ CONTENT only: the VAULT is deliberately stripped from the snapshot
      // (F1/M3 — the encrypted DB owns it at rest), and this e2e profile
      // runs without a DB (`OPENMASQ_DISABLE_DB`), so a POST-reload send's wire
      // isn't verifiable here — hence the wire-first order above.
      await page.waitForFunction(
        (marker) => (localStorage.getItem("openmasq.conversations:u1") ?? "").includes(marker),
        EDIT_MARKER,
        { timeout: 15_000 },
      );
      await page.reload();
      await page.waitForLoadState("domcontentloaded");
      await expect(page.locator(".md-document-card")).toContainText(EDIT_MARKER, {
        timeout: 30_000,
      });
    } finally {
      await app.close().catch(() => {});
    }
  });

  test("génération : la lettre demandée s'affiche en carte, l'email du prompt reste hors wire", async () => {
    test.setTimeout(300_000);
    const { app, page, wireLog } = await launchWorkflowApp("doc-gen");
    try {
      // An EMPTY conversation seeded with the right model: on the welcome screen the
      // send creates the conversation with the DEFAULT model (which the sign-in flow
      // reset to factory) — the selected chip alone isn't enough. Same approach as
      // test A: the state, not the UI, sets the model; `selectModel` stays a belt-and-braces.
      const now = Date.now();
      await seedSession(page, {
        "openmasq.conversations:u1": JSON.stringify([
          {
            id: "e2e-doc-gen",
            title: "Génération (e2e documents)",
            modelId: MODEL,
            messages: [],
            createdAt: now,
            updatedAt: now,
          },
        ]),
        "openmasq.activeId:u1": "e2e-doc-gen",
      });
      await selectModel(page);
      await submitPrompt(
        page,
        `Rédige une courte lettre de résiliation de mon abonnement internet. ` +
          `Mon adresse e-mail de contact : ${PROMPT_EMAIL}. ` +
          `Réponds avec la lettre complète dans un bloc \`\`\`document (commence par un titre « # … »).`,
      );
      // Hard invariant (privacy, deterministic — `patterns` engine): the real email
      // NEVER leaves the machine, on any request (send + any tool turns).
      // The chat send is identifiable by the prompt's instruction (redacted, minus
      // the email). Independent of the ANSWER — the invariant is about what goes OUT.
      const wire = await waitForWire(wireLog, "résiliation");
      expect(wire).not.toContain(PROMPT_EMAIL);

      // Model conformance (soft outside E2E_STRICT: a small free model may ignore the
      // fence instruction — change E2E_MODEL to exercise it strictly). We wait for
      // the CARD itself, not the turn's "clean" end (`awaitReply` requires the
      // action row, which this path doesn't always produce): the card
      // renders as soon as the fence streams.
      const card = page.locator(".md-document-card");
      const hasCard = await card
        .first()
        .waitFor({ state: "visible", timeout: 240_000 })
        .then(() => true)
        .catch(() => false);
      if (STRICT) {
        expect(hasCard, "le modèle n'a pas émis de bloc ```document").toBe(true);
        // If the model carried the email (the fake) into the letter, the app displays it as REAL.
        const inCard = (await card.first().innerText()).includes(PROMPT_EMAIL);
        test.info().annotations.push({
          type: "email-dans-la-carte",
          description: inCard ? "oui (un-redacted)" : "non repris par le modèle",
        });
      } else {
        test.info().annotations.push({
          type: "fence-document",
          description: hasCard ? "émis" : `non émis par ${MODEL} (soft hors E2E_STRICT)`,
        });
      }
    } finally {
      await app.close().catch(() => {});
    }
  });
});
