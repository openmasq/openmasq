/* Documents générés (fence ```document) — génération + ÉDITION, contre la vraie API
   OpenRouter (modèle gratuit par défaut → coût nul), sur le harnais de la suite
   workflows (app buildée isolée, session seedée, moteur `patterns`, wire log).

     OPENROUTER_API_KEY   requis (.env racine) — sinon la suite est skip (le test
                          d'édition a besoin qu'un send PARTE pour capturer le wire).
     E2E_MODEL            id du modèle (défaut : le gratuit de la suite workflows).
     E2E_STRICT           "1" = assertions de CONFORMITÉ du modèle (le fence bien
                          émis, l'email repris dans la lettre) — sinon seules les
                          assertions déterministes (privacy) sont dures.

   Invariants TOUJOURS vérifiés (déterministes) :
     1. ÉDITION (test A — le modèle n'a pas besoin de répondre) : une PII tapée À LA
        MAIN dans l'éditeur de la carte document entre au VAULT à la sauvegarde
        (`redactEditedText` — la carte la re-rend marquée), l'édition SURVIT à un
        reload, et le tour suivant part avec l'édition dans l'historique MAIS SANS la
        PII en clair (buildWireHistory rejoue le vault — c'est ce trou que la passe
        d'édition ferme, épinglé ici de bout en bout).
     2. GÉNÉRATION (test B) : le prompt qui demande une lettre porte un email réel ;
        le wire ne le contient JAMAIS (moteur `patterns`), alors que l'app peut
        l'afficher en clair côté utilisateur. */

import { test, expect } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { KEY, MODEL, STRICT } from "./workflows/env";
import { launchWorkflowApp, seedSession, selectModel, submitPrompt } from "./workflows/harness";

/** PII que le test TAPE dans l'éditeur — ne doit jamais atteindre le wire. */
const TYPED_EMAIL = "marceline.brivet@exemple-test.fr";
/** Marqueur inerte (pas une PII) ajouté par l'édition — DOIT atteindre le wire :
 *  c'est la preuve que l'édition est bien dans l'historique renvoyé au modèle. */
const EDIT_MARKER = "SECTION-AJOUTEE-E2E";
/** PII du prompt de génération (test B). */
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

/** La conversation seedée du test A : un échange déjà terminé dont la réponse
 *  contient le document — aucun appel modèle pour l'obtenir. */
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

/** Attend que le wire log contienne une requête satisfaisant `has` — le send de CHAT
 *  n'est pas forcément la première ligne (le pré-appel « routeur d'outils » part
 *  avant et ne porte pas l'historique). Rend alors le log ENTIER (les assertions
 *  d'absence de PII balaient toutes les requêtes, routeur compris). */
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

      // La conversation seedée s'ouvre (activeId) — sinon, la retrouver par son titre.
      const card = page.locator(".md-document-card");
      if ((await card.count().catch(() => 0)) === 0) {
        await page.getByText("Attestation (e2e documents)").first().click().catch(() => {});
      }
      await expect(card).toBeVisible({ timeout: 20_000 });
      await expect(card).toContainText("Attestation de partenariat");

      // Modifier → ajouter une PII neuve + le marqueur inerte → Enregistrer.
      await card.getByRole("button", { name: /Modifier/ }).click();
      const editor = page.locator(".md-document-editor");
      await expect(editor).toBeVisible();
      const source = await editor.inputValue();
      await editor.fill(`${source}\nContact : ${TYPED_EMAIL}\nRéférence : ${EDIT_MARKER}.`);
      await card.getByRole("button", { name: /^Enregistrer/ }).click();
      await expect(editor).toBeHidden({ timeout: 20_000 });
      await expect(card).toContainText(EDIT_MARKER);

      // La passe de redaction d'édition a tourné : l'email tapé est MARQUÉ (il est
      // au vault, rehypeRedact le retrouve) — pas du texte libre.
      await expect(card.locator("mark.redaction-mark", { hasText: TYPED_EMAIL })).toBeVisible({
        timeout: 10_000,
      });

      // Tour suivant : l'historique (dont le document édité) part re-redacted.
      await selectModel(page);
      await submitPrompt(page, "Améliore la formulation de ce document, sans changer les coordonnées.");
      // Le send de chat (celui qui porte l'historique, donc le marqueur) est parti…
      const wire = await waitForWire(wireLog, EDIT_MARKER);
      // …et sur TOUTES les requêtes du log, la PII tapée n'apparaît JAMAIS en clair.
      expect(wire).not.toContain(TYPED_EMAIL);
      // (Pas d'attente de la réponse : l'invariant porte sur ce qui SORT, et un
      // reload en plein stream est un cas géré — `clearStuckPending`.)

      // Persistance : l'édition survit à un reload de l'app. Le miroir localStorage
      // est DEBOUNCÉ (700 ms) — attendre que le snapshot porte l'édition avant de
      // recharger (point de synchro déterministe, pas un timeout arbitraire).
      // ⚠️ Le CONTENU seulement : le VAULT est délibérément strippé du snapshot
      // (F1/M3 — la DB chiffrée en est le propriétaire au repos), et ce profil e2e
      // tourne sans DB (`OPENMASQ_DISABLE_DB`), donc le wire d'un send POST-reload
      // n'est pas vérifiable ici — d'où l'ordre wire-d'abord ci-dessus.
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
      // Une conversation VIDE seedée avec le bon modèle : sur l'écran d'accueil le
      // send crée la conversation avec le modèle PAR DÉFAUT (que le flux sign-in a
      // remis d'usine) — le chip sélectionné n'y suffit pas. Même approche que le
      // test A : l'état, pas l'UI, fixe le modèle ; `selectModel` reste en ceinture.
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
      // Invariant dur (privacy, déterministe — moteur `patterns`) : l'email réel ne
      // quitte JAMAIS la machine, sur aucune requête (send + éventuels tours outils).
      // Le send de chat est identifiable par la consigne du prompt (redacted, l'email
      // en moins). Indépendant de la RÉPONSE — l'invariant porte sur ce qui SORT.
      const wire = await waitForWire(wireLog, "résiliation");
      expect(wire).not.toContain(PROMPT_EMAIL);

      // Conformité modèle (souple hors E2E_STRICT : un petit gratuit peut ignorer la
      // consigne de fence — changer E2E_MODEL pour l'exercer strictement). On attend
      // la CARTE elle-même, pas la fin « propre » du tour (`awaitReply` exige la
      // rangée d'actions, que ce parcours ne produit pas toujours) : la carte se
      // rend dès que le fence streame.
      const card = page.locator(".md-document-card");
      const hasCard = await card
        .first()
        .waitFor({ state: "visible", timeout: 240_000 })
        .then(() => true)
        .catch(() => false);
      if (STRICT) {
        expect(hasCard, "le modèle n'a pas émis de bloc ```document").toBe(true);
        // Si le modèle a repris l'email (le fake) dans la lettre, l'app l'affiche RÉEL.
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
