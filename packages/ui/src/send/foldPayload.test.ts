import { describe, it, expect } from "vitest";
import { ATTACHMENT_INLINE_NOTE, buildFoldedPayload, clipFileText } from "./foldPayload";

describe("buildFoldedPayload", () => {
  it("no attachments: modelText = prefix+text, hasFolded false, nothing to reuse", () => {
    const r = buildFoldedPayload("bonjour", undefined, {}, "");
    expect(r.modelText).toBe("bonjour");
    expect(r.fullModelText).toBe("bonjour");
    expect(r.hasFolded).toBe(false);
    expect(r.reuseParts).toEqual([]);
    expect(r.vaultPreload).toEqual({});
  });

  it("prepends the prefix to the model payload only", () => {
    const r = buildFoldedPayload("les données", undefined, {}, "PLOT>>\n");
    expect(r.modelText).toBe("PLOT>>\nles données");
    expect(r.modelText.startsWith("PLOT>>")).toBe(true);
  });

  it("SECURITY: the prefix is INSIDE modelText — a compétence prompt is redacted like any text", () => {
    // The store passes a compétence's prompt as the prefix. `modelText` is what the
    // engine runs on (store.sendMessage → pseudonymize), so a prompt carrying PII is
    // redacted exactly like the typed text. Appending it AFTER the engine instead would
    // ship it in clear — this test is the tripwire for that.
    const r = buildFoldedPayload("le rapport", undefined, {}, "Résume pour marc@acme.fr :\n\n");
    expect(r.modelText).toContain("marc@acme.fr");
    expect(r.modelText.indexOf("marc@acme.fr")).toBeLessThan(r.modelText.indexOf("le rapport"));
    expect(r.fullModelText).toContain("marc@acme.fr");
  });

  it("a RETRY (resendWire) ignores the prefix — the instruction is already in the resent wire", () => {
    // Re-prefixing on a retry would send the compétence's prompt twice.
    const r = buildFoldedPayload("le rapport", undefined, { resendWire: "WIRE" }, "PROMPT>>\n");
    expect(r.modelText).toBe("WIRE");
    expect(r.fullModelText).toBe("WIRE");
  });

  it("SECURITY: the real filename never reaches the wire — masked as document-N.<ext>", () => {
    const r = buildFoldedPayload(
      "résume",
      [{ name: "438-GAZ-20220208-jean-rebour.pdf", text: "contenu du relevé" }],
      {},
      "",
    );
    expect(r.modelText).toContain("=== Attached file: document-1.pdf ===");
    expect(r.modelText).toContain("contenu du relevé");
    // The real, PII-bearing filename must NOT appear anywhere in the payload.
    expect(r.modelText).not.toContain("438-GAZ");
    expect(r.modelText).not.toContain("jean-rebour");
    expect(r.fullModelText).not.toContain("438-GAZ");
    expect(r.hasFolded).toBe(true);
  });

  it("EVERY attachment header carries the inline-content note — detect, reuse AND image blocks", () => {
    // The masked name is a one-way alias (not vaulted): a tool call naming it can't be
    // un-redacted back to the real file. Without this note a small model with a
    // filesystem tool goes fetching "document-1" and retry-loops on the miss.
    const r = buildFoldedPayload(
      "go",
      [
        { name: "a.txt", text: "aaa" }, // detect
        { name: "b.txt", text: "bbb" }, // reuse
        { name: "c.png", text: "ccc" }, // image
      ],
      { docReplacements: { "b.txt": [{ real: "bbb", fake: "zzz" }] }, imageNames: ["c.png"] },
      "",
    );
    // Detect block: note sits between the header and the document text.
    expect(r.modelText).toContain(`=== Attached file: document-1.txt ===\n${ATTACHMENT_INLINE_NOTE}\naaa`);
    // Reuse header carries it too (the caller appends the text after applyVault)...
    expect(r.reuseParts[0].header).toContain(ATTACHMENT_INLINE_NOTE);
    // ...and the persisted image block (re-sent on a follow-up turn) as well.
    expect(r.fullModelText).toContain(`=== Attached file: document-3.png ===\n${ATTACHMENT_INLINE_NOTE}\nccc`);
  });

  it("keeps the extension only when there is a real dot (no dot ⇒ bare document-N)", () => {
    const r = buildFoldedPayload("x", [{ name: "README", text: "hi" }], {}, "");
    expect(r.modelText).toContain("=== Attached file: document-1 ===");
  });

  it("image-sent docs: text stays OUT of the wire but IS persisted in fullModelText", () => {
    const r = buildFoldedPayload(
      "analyse la facture",
      [{ name: "facture.pdf", text: "TOTAL 1234 EUR" }],
      { imageNames: ["facture.pdf"] },
      "",
    );
    // Not folded into the wire the model gets THIS turn (it receives the image instead)...
    expect(r.modelText).not.toContain("TOTAL 1234");
    expect(r.modelText).toBe("analyse la facture");
    // ...but retained in modelContent so a follow-up turn / run_python can access it.
    expect(r.fullModelText).toContain("TOTAL 1234");
    expect(r.fullModelText).toContain("=== Attached file: document-1.pdf ===");
    expect(r.hasFolded).toBe(true);
  });

  it("reused docs: text is NOT in modelText (not re-detected), vault is pre-seeded, reuseParts carry the wire part", () => {
    const r = buildFoldedPayload(
      "compare",
      [{ name: "contrat.txt", text: "Marc Savary habite Lyon" }],
      { docReplacements: { "contrat.txt": [{ real: "Marc Savary", fake: "Paul Morvan", tone: "violet" }] } },
      "",
    );
    // Reused doc text is withheld from the detector input (modelText)...
    expect(r.modelText).toBe("compare");
    // ...carried on reuseParts for deterministic applyVault by the caller...
    expect(r.reuseParts).toHaveLength(1);
    expect(r.reuseParts[0].header).toContain("document-1.txt");
    expect(r.reuseParts[0].text).toBe("Marc Savary habite Lyon");
    expect(r.reuseParts[0].reps).toEqual([{ real: "Marc Savary", fake: "Paul Morvan", tone: "violet" }]);
    // ...and the drop-time fake→real is pre-loaded into the vault preload.
    // Les reps du document + les paires d'ALIAS (restitution du nom de pièce, 15/08).
    expect(r.vaultPreload).toEqual({
      "Paul Morvan": "Marc Savary",
      "document-1.txt": "contrat.txt",
      "document-1": "contrat",
    });
    // fullModelText persists the reused doc's ORIGINAL text (modelContent).
    expect(r.fullModelText).toContain("Marc Savary habite Lyon");
    expect(r.hasFolded).toBe(true);
  });

  it("global doc numbering is coherent across detect → reuse → image", () => {
    const r = buildFoldedPayload(
      "go",
      [
        { name: "a.txt", text: "aaa" }, // detect → document-1
        { name: "b.txt", text: "bbb" }, // reuse   → document-2
        { name: "c.png", text: "ccc" }, // image   → document-3
      ],
      { docReplacements: { "b.txt": [{ real: "bbb", fake: "zzz" }] }, imageNames: ["c.png"] },
      "",
    );
    expect(r.modelText).toContain("document-1.txt"); // detect
    expect(r.reuseParts[0].header).toContain("document-2.txt"); // reuse
    expect(r.fullModelText).toContain("document-3.png"); // image
  });

  it("clips a document to maxFileChars with a truncation marker", () => {
    const big = "x".repeat(120);
    const r = buildFoldedPayload("t", [{ name: "big.txt", text: big }], {}, "", 50);
    expect(r.modelText).toContain("x".repeat(50) + "\n…(truncated)");
    expect(r.modelText).not.toContain("x".repeat(51));
  });

  it("skips whitespace-only attachments (no text to fold)", () => {
    const r = buildFoldedPayload("t", [{ name: "empty.txt", text: "   \n  " }], {}, "");
    expect(r.hasFolded).toBe(false);
    expect(r.modelText).toBe("t");
  });

  it("resendWire (retry): modelText AND fullModelText are the verbatim wire, no folding", () => {
    const r = buildFoldedPayload(
      "clean displayed text",
      [{ name: "doc.txt", text: "should be ignored on retry" }],
      { resendWire: "PRIOR WIRE incl. the folded document" },
      "PLOT>>\n",
    );
    expect(r.modelText).toBe("PRIOR WIRE incl. the folded document");
    expect(r.fullModelText).toBe("PRIOR WIRE incl. the folded document");
    // resendWire always marks the turn as carrying a payload to persist.
    expect(r.hasFolded).toBe(true);
    // The plot prefix / attachment text must NOT double-fold on a retry.
    expect(r.modelText).not.toContain("PLOT>>");
    expect(r.modelText).not.toContain("should be ignored");
  });

  it("a reused rep missing fake or real is not seeded into the vault preload", () => {
    const r = buildFoldedPayload(
      "x",
      [{ name: "d.txt", text: "data" }],
      { docReplacements: { "d.txt": [{ real: "", fake: "F" }, { real: "R", fake: "" }] } },
      "",
    );
    // Aucune rep bancale n'est semée — seules les paires d'ALIAS du document restent.
    expect(r.vaultPreload).toEqual({ "document-1.txt": "d.txt", "document-1": "d" });
    expect(Object.values(r.vaultPreload)).not.toContain("F");
    expect(Object.keys(r.vaultPreload)).not.toContain("R");
    // Still a reused doc (has reps), so it's on reuseParts, not detected.
    expect(r.reuseParts).toHaveLength(1);
  });
});

describe("l'alias d'une pièce est une entrée de coffre — la restitution le retourne", () => {
  // Vécu 15/08 (documentaliste) : un inventaire entier désignait chaque pièce par
  // « Document-3 » — un nom qui n'existe sur aucun disque — parce que l'alias était la
  // seule substitution du produit à ne jamais revenir.
  it("chaque pièce sème alias→réel et radical→radical, groupes image compris", () => {
    const r = buildFoldedPayload(
      "regarde ces pièces",
      [
        { name: "Contrat_LANTIVY_v3_SIGNE.txt", text: "contrat" },
        { name: "scan.png", text: "texte océrisé" },
      ],
      { imageNames: ["scan.png"] },
      "",
    );
    expect(r.vaultPreload["document-1.txt"]).toBe("Contrat_LANTIVY_v3_SIGNE.txt");
    expect(r.vaultPreload["document-1"]).toBe("Contrat_LANTIVY_v3_SIGNE");
    expect(r.vaultPreload["document-2.png"]).toBe("scan.png");
    expect(r.vaultPreload["document-2"]).toBe("scan");
  });

  it("bout en bout : « Document-3 » (casse du modèle) redevient le vrai nom", async () => {
    const { unredact } = await import("@openmasq/redact");
    const r = buildFoldedPayload(
      "x",
      [
        { name: "a.txt", text: "a" },
        { name: "b.txt", text: "b" },
        { name: "devis lantivy tranche 2.txt", text: "devis" },
      ],
      {},
      "",
    );
    const restored = unredact(
      "Le document-3.txt est le devis ; voir Document-3 pour le détail.",
      r.vaultPreload,
    );
    expect(restored).toContain("devis lantivy tranche 2.txt");
    expect(restored).toContain("devis lantivy tranche 2 pour le détail");
    expect(restored).not.toMatch(/document-3/i);
  });

  it("un nom sans extension ne sème qu'une paire (pas de radical dupliqué)", () => {
    const r = buildFoldedPayload("x", [{ name: "notes", text: "n" }], {}, "");
    expect(r.vaultPreload).toEqual({ "document-1": "notes" });
  });
});

describe("clipFileText — la coupe ne tranche JAMAIS une ligne (donc jamais une valeur)", () => {
  it("coupe à la dernière frontière de ligne dans la borne", () => {
    const text = "ligne-a\nligne-b\nemail: jean.dupont@exemple.fr\nligne-d";
    const clipped = clipFileText(text, 30); // 30 tombe AU MILIEU de l'adresse
    expect(clipped).toBe("ligne-a\nligne-b");
    expect(clipped).not.toContain("jean.dup"); // le fragment ne part pas à moitié
  });

  it("texte sous la borne : inchangé ; une seule ligne géante : coupe dure (rien de mieux)", () => {
    expect(clipFileText("court", 100)).toBe("court");
    expect(clipFileText("x".repeat(120), 50)).toBe("x".repeat(50));
  });

  it("le pli d'envoi utilise la MÊME coupe : le document plié se termine sur une ligne entière", () => {
    const doc = Array.from({ length: 20 }, (_, i) => `client ${i}: valeur-${i}`).join("\n");
    const r = buildFoldedPayload("t", [{ name: "list.txt", text: doc }], {}, "", 100);
    const folded = r.modelText.slice(r.modelText.indexOf("client 0"));
    const kept = folded.slice(0, folded.indexOf("\n…(truncated)"));
    // Chaque ligne présente est ENTIÈRE (elle se termine par sa propre valeur).
    for (const line of kept.split("\n")) expect(line).toMatch(/^client \d+: valeur-\d+$/);
  });
});
