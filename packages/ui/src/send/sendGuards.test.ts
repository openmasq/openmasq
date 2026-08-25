import { describe, expect, it } from "vitest";
import type { Conversation } from "../types";
import type { PdfReplacement } from "@openmasq/redact/pdf-redact";
import {
  matchesAttachmentName,
  pickAttachmentMetas,
  redactEngineUnavailable,
  shouldImportLegacyKeysOnce,
  stripVaultForLocal,
  paintCoversReplacements,
} from "./sendGuards";

// M1 — resolveAttachments must NOT fall back to "all files" on a name miss.
describe("pickAttachmentMetas (audit M1)", () => {
  const metas = [
    { id: "1", name: "rapport.pdf" },
    { id: "2", name: "budget 2024.xlsx" },
    { id: "3", name: "photo.png" },
  ];

  it("resolves ONLY the named file(s)", () => {
    expect(pickAttachmentMetas(metas, ["rapport.pdf"]).map((m) => m.id)).toEqual(["1"]);
    // substring match (either direction) is intentional
    expect(pickAttachmentMetas(metas, ["budget"]).map((m) => m.id)).toEqual(["2"]);
  });

  it("returns NOTHING when the model names a file that does not exist — no 'attach all' fallback (the exfil hole)", () => {
    expect(pickAttachmentMetas(metas, ["does-not-exist.pdf"])).toEqual([]);
    // the regression: a bogus name must never resolve to the whole conversation's files
    expect(pickAttachmentMetas(metas, ["../../secret"])).toEqual([]);
  });

  it("returns NOTHING for an empty / blank name list (never all files)", () => {
    expect(pickAttachmentMetas(metas, [])).toEqual([]);
    expect(pickAttachmentMetas(metas, ["", "   "])).toEqual([]);
  });

  it("matchesAttachmentName is case-insensitive", () => {
    expect(matchesAttachmentName("Rapport.PDF", ["rapport.pdf"])).toBe(true);
    expect(matchesAttachmentName("x.pdf", ["totally-different"])).toBe(false);
  });

  it("un nom générique court ne matche plus tout (audit 2026-08-10 — « e » attachait la conversation)", () => {
    // `w.includes(n)` et le substring sans plancher rendaient « attacher tout »
    // atteignable par un nom d'une lettre — le repli que M1 avait pourtant fermé.
    expect(pickAttachmentMetas(metas, ["e"])).toEqual([]);
    expect(pickAttachmentMetas(metas, ["p"])).toEqual([]);
    // Le nom stocké contenu dans une PHRASE demandée ne matche plus non plus…
    expect(matchesAttachmentName("a.txt", ["attache a.txt s'il te plaît"])).toBe(false);
    // … mais l'exact (avec ou sans extension) et le radical ≥ 6 restent servis.
    expect(matchesAttachmentName("rapport-final.pdf", ["rapport-final"])).toBe(true);
    expect(pickAttachmentMetas(metas, ["budget"]).map((m) => m.id)).toEqual(["2"]);
  });
});

// M2 — an AI redaction engine with no detector on this host must FAIL CLOSED, never
// silently downgrade to regex-only.
describe("redactEngineUnavailable (audit M2 — no silent regex downgrade)", () => {
  it("flags 'local' when the host has no detectLocalPii", () => {
    expect(redactEngineUnavailable("local", {})).toBe("local");
    expect(redactEngineUnavailable("local", { detectLocalPii: () => {} })).toBeNull();
  });
  it("flags 'model' when the host has no complete", () => {
    expect(redactEngineUnavailable("model", {})).toBe("model");
    expect(redactEngineUnavailable("model", { complete: () => {} })).toBeNull();
  });
  it("never blocks the capability-free engines (patterns/remote)", () => {
    expect(redactEngineUnavailable("patterns", {})).toBeNull();
    expect(redactEngineUnavailable("remote", {})).toBeNull();
  });
});

// M11 — the legacy plaintext-localStorage keys import must run at most ONCE, for the
// first signed-in account, never a second one.
describe("shouldImportLegacyKeysOnce (audit M11 — no cross-account key leak)", () => {
  it("imports for the first signed-in account with pending legacy keys", () => {
    expect(shouldImportLegacyKeysOnce(false, "user-A", 3)).toBe(true);
  });
  it("does NOT re-import after the first import (account switch)", () => {
    // the regression: A imported → switching to B must NOT write A's keys into B
    expect(shouldImportLegacyKeysOnce(true, "user-B", 3)).toBe(false);
  });
  it("does not import when signed out or when there is nothing to import", () => {
    expect(shouldImportLegacyKeysOnce(false, null, 3)).toBe(false);
    expect(shouldImportLegacyKeysOnce(false, "user-A", 0)).toBe(false);
  });
});

// M3 — modelContent (up to ~50k chars of real PII) must not sit in the unencrypted
// localStorage snapshot when a durable encrypted DB owns it.
describe("stripVaultForLocal (audit M3 + F1 — nothing sensitive in localStorage)", () => {
  const conv = (): Conversation =>
    ({
      id: "c1",
      title: "t",
      redactionVault: { FAKE: "Real Person" },
      redactionKinds: { FAKE: "name" },
      // F1 second pass: these each hold `{value: <REAL>}` and used to survive the strip.
      forcedRedactions: [{ value: "Nightingale-Codename", category: "org" }],
      fileRedactions: [
        { name: "doc.pdf", spans: [{ value: "file-secret@acme.fr", kind: "email" }], at: 0 },
      ],
      // The in-flight turn's WIRE transcript: fakes, but also every non-protected word the
      // turn sent and every page it read. Encrypted DB only, like `modelContent`.
      turnCheckpoint: {
        turnId: "t1",
        at: 0,
        messages: [{ role: "user", content: "checkpoint-wire-text" }],
      },
      contextSummary: { throughTurn: 20, text: "compaction-wire-recap", at: 0 },
      messages: [
        {
          id: "m1",
          role: "user",
          content: "hello",
          modelContent: "hello + <full doc PII>",
          redactedSpans: [{ value: "spanned-real-value", kind: "name" }],
          // A compétence's prompt is user-authored free text and routinely holds the
          // real example pasted in while drafting it.
          competence: { id: "sk1", name: "Réponse e-mail", prompt: "Réponds comme competence-real-example@acme.fr" },
          // A workflow's prompt is the same class of user-authored free text.
          workflow: { id: "wf1", name: "Tri des tickets", prompt: "Trie les tickets de workflow-real-client@acme.fr", servers: ["github"] },
        },
        {
          id: "m2",
          role: "assistant",
          content: "hi",
          // The kept REFLECTION: un-redacted (the model reasoned about the fakes, the
          // vault restored them) and unbounded — the encrypted DB owns it.
          reasoning: "L'utilisateur s'appelle reasoning-real-person@acme.fr, donc…",
        },
      ],
    }) as unknown as Conversation;

  it("drops the vault, kinds AND every message.modelContent", () => {
    const out = stripVaultForLocal(conv()) as unknown as Record<string, unknown> & {
      messages: Record<string, unknown>[];
    };
    expect(out.redactionVault).toBeUndefined();
    expect(out.redactionKinds).toBeUndefined();
    expect(out.messages[0].modelContent).toBeUndefined();
    // the DISPLAYED content is intentionally kept (renders before the async DB load)
    expect(out.messages[0].content).toBe("hello");
    expect(out.messages[1].content).toBe("hi");
  });

  it("drops competence.prompt but KEEPS the tag's id/name (it renders before the DB load)", () => {
    const out = stripVaultForLocal(conv()) as unknown as {
      messages: { competence?: { id: string; name: string; prompt?: string } }[];
    };
    expect(out.messages[0].competence?.prompt).toBeUndefined();
    expect(out.messages[0].competence?.id).toBe("sk1");
    expect(out.messages[0].competence?.name).toBe("Réponse e-mail");
  });

  it("drops workflow.prompt but KEEPS id/name/servers (the tag + its connector chips)", () => {
    const out = stripVaultForLocal(conv()) as unknown as {
      messages: { workflow?: { id: string; name: string; prompt?: string; servers?: string[] } }[];
    };
    expect(out.messages[0].workflow?.prompt).toBeUndefined();
    expect(out.messages[0].workflow?.id).toBe("wf1");
    expect(out.messages[0].workflow?.name).toBe("Tri des tickets");
    expect(out.messages[0].workflow?.servers).toEqual(["github"]);
  });

  it("also drops redactedSpans, forcedRedactions and fileRedactions (audit F1 2nd pass)", () => {
    const out = stripVaultForLocal(conv()) as unknown as Record<string, unknown> & {
      messages: Record<string, unknown>[];
    };
    expect(out.forcedRedactions).toBeUndefined();
    expect(out.fileRedactions).toBeUndefined();
    expect(out.messages[0].redactedSpans).toBeUndefined();
  });

  it("drops the model's kept REFLECTION (un-redacted, unbounded — encrypted DB only)", () => {
    const out = stripVaultForLocal(conv()) as unknown as {
      messages: { content?: string; reasoning?: string }[];
    };
    expect(out.messages[1].reasoning).toBeUndefined();
    // …without taking the displayed answer with it.
    expect(out.messages[1].content).toBe("hi");
  });

  it("drops the in-flight turn CHECKPOINT (wire text is not localStorage's to hold)", () => {
    const out = stripVaultForLocal(conv()) as unknown as { turnCheckpoint?: unknown };
    expect(out.turnCheckpoint).toBeUndefined();
  });

  it("serialised localStorage snapshot contains NO real PII", () => {
    const json = JSON.stringify(stripVaultForLocal(conv()));
    expect(json).not.toContain("Real Person");
    expect(json).not.toContain("<full doc PII>");
    // The F1 second-pass values must not survive either.
    expect(json).not.toContain("Nightingale-Codename");
    expect(json).not.toContain("file-secret@acme.fr");
    expect(json).not.toContain("spanned-real-value");
    // A compétence's / workflow's prompt is REAL user text — never in the plaintext copy.
    expect(json).not.toContain("competence-real-example@acme.fr");
    expect(json).not.toContain("workflow-real-client@acme.fr");
    // The resume checkpoint is what LEFT the machine — same at-rest class as modelContent.
    expect(json).not.toContain("checkpoint-wire-text");
    expect(json).not.toContain("compaction-wire-recap");
    // The reflection is un-redacted display text — real values, and a lot of them.
    expect(json).not.toContain("reasoning-real-person@acme.fr");
  });

  it("returns the conversation untouched when nothing sensitive is present", () => {
    const plain = { id: "c2", messages: [{ id: "m", role: "user", content: "x" }] } as unknown as Conversation;
    expect(stripVaultForLocal(plain)).toBe(plain);
  });

  it("strips a competence prompt even when it is the ONLY sensitive field", () => {
    const only = {
      id: "c3",
      messages: [
        { id: "m", role: "user", content: "x", competence: { id: "s", name: "N", prompt: "solo-real-secret" } },
      ],
    } as unknown as Conversation;
    expect(JSON.stringify(stripVaultForLocal(only))).not.toContain("solo-real-secret");
  });
});

// H2 — sending a PDF as "redacted images" must fail closed when nothing was painted
// (a scanned PDF with no text layer would otherwise leak raw pixels).
describe("paintCoversReplacements (audit H2 — per-VALUE image-leak proof)", () => {
  const rep = (real: string): PdfReplacement =>
    ({ real, fake: "x", tone: "coral" }) as unknown as PdfReplacement;
  const page = (reals: string[], covered = reals) => ({
    boxes: reals.map((real) => ({ real, revealed: false })),
    covered: new Set(covered),
  });

  it("FAILS CLOSED: replacements pending but zero boxes painted (scan, no text layer)", () => {
    const scannedPages = [{ boxes: [], covered: new Set<string>() }, { boxes: [], covered: new Set<string>() }];
    expect(paintCoversReplacements(scannedPages, [rep("Jean Morvan")])).toBe(false);
  });

  it("passes a digital PDF whose paint covers EVERY expected value", () => {
    const pages = [page(["Jean Morvan"]), page(["52 impasse des Roses, 64000 PAU"])];
    expect(
      paintCoversReplacements(pages, [rep("Jean Morvan"), rep("52 impasse des Roses, 64000 PAU")]),
    ).toBe(true);
  });

  it("REGRESSION: ONE painted box no longer blesses the whole doc — an uncovered value refuses", () => {
    // The old floor was `painted > 0`: a name painted on page 1 shipped the address's
    // real pixels when its per-item match failed. Per-value coverage refuses that doc.
    const pages = [page(["Jean Morvan"])];
    expect(
      paintCoversReplacements(pages, [rep("Jean Morvan"), rep("52 impasse des Roses, 64000 PAU")]),
    ).toBe(false);
  });

  it("an OCR-only value (detected from pixels, absent from every page text) refuses", () => {
    // A stamp / scanned insert: the value is in the doc's drop-time map but no text
    // layer holds it — its pixels would leave in CLEAR if the images shipped.
    const pages = [page(["Jean Morvan"])];
    expect(paintCoversReplacements(pages, [rep("Jean Morvan"), rep("RCS PAU 863 471 587")])).toBe(false);
  });

  it("a value SUBSUMED under a longer painted value counts as covered (no box of its own)", () => {
    // "64000 PAU" lies inside the painted address box → covered set carries it, boxes don't.
    const pages = [page(["52 impasse des Roses, 64000 PAU"], ["52 impasse des Roses, 64000 PAU", "64000 PAU"])];
    expect(
      paintCoversReplacements(pages, [rep("52 impasse des Roses, 64000 PAU"), rep("64000 PAU")]),
    ).toBe(true);
  });

  it("nothing to redact (no replacements, or all revealed) → passes", () => {
    expect(paintCoversReplacements([{ boxes: [] }], [])).toBe(true);
    expect(
      paintCoversReplacements([{ boxes: [] }], [rep("A")], new Set(["A"])),
    ).toBe(true);
  });

  it("a REVEALED-only paint with a still-hidden expected value fails closed", () => {
    // one value revealed (painted with clean glyphs → revealed:true), another still
    // expected but never painted → the doc isn't fully covered
    const pages = [{ boxes: [{ real: "A", revealed: true }], covered: new Set(["A"]) }];
    expect(paintCoversReplacements(pages, [rep("A"), rep("B")])).toBe(false);
  });

  it("pages WITHOUT a covered set (legacy/partial caller) account for nothing → fails closed", () => {
    const pages = [{ boxes: [{ real: "Jean Morvan", revealed: false }] }];
    expect(paintCoversReplacements(pages, [rep("Jean Morvan")])).toBe(false);
  });
});
