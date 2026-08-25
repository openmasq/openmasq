import { describe, it, expect } from "vitest";
import { buildSystemContent, buildWireHistory, type ToWire } from "./buildWire";
import { NUMBER_TOKEN_INSTRUCTION } from "@openmasq/redact";
import type { Message } from "../types";

// A fake redaction pass that UPPER-CASES — proves `toWire` is actually applied to each
// wire string (the real one replays the vault; here we just check the plumbing).
const up: ToWire = (s) => ({ text: s.toUpperCase() });
const msg = (m: Partial<Message>): Message => ({ id: "x", role: "user", content: "", ...m }) as Message;

describe("buildSystemContent", () => {
  it("redacts the custom system prompt via toWire and drops empty parts", () => {
    const out = buildSystemContent(up, "mon prompt", false);
    expect(out).toContain("MON PROMPT"); // toWire applied
    expect(out).not.toContain(NUMBER_TOKEN_INSTRUCTION); // numberMode off
  });

  it("adds the number-token instruction only when numberMode is on", () => {
    expect(buildSystemContent(up, undefined, true)).toContain(NUMBER_TOKEN_INSTRUCTION);
  });

  /* Usage des Compétences fermé : on cesse de DEMANDER au modèle d'en proposer. Sans
     ça, la porte fermée par l'avant se rouvre par le modèle — un bloc ```competence
     rendu avec un bouton d'adoption vers une fonctionnalité retirée. */
  it("retire la consigne « fabrique une compétence » quand leur usage est fermé", () => {
    expect(buildSystemContent(up, undefined, false)).toContain("```competence");
    expect(buildSystemContent(up, undefined, false, { skills: false })).not.toContain(
      "```competence",
    );
  });

  it("la consigne reste par défaut — omettre l'option ne ferme rien", () => {
    expect(buildSystemContent(up, undefined, false, {})).toContain("```competence");
  });
});

describe("buildWireHistory", () => {
  it("assembles system + redacted turns + final user turn, surfacing assistant FILES", () => {
    const history = buildWireHistory(
      [
        msg({ role: "user", content: "salut" }),
        msg({
          role: "assistant",
          content: "ok",
          attachments: [
            { name: "rapport.pdf", kind: "file" },
            { name: "chart.png", kind: "image" },
          ],
        }),
      ],
      { text: "USER WIRE" },
      "SYS",
      undefined,
      up,
    );
    expect(history[0]).toEqual({ role: "system", content: "SYS" });
    expect(history[1]).toEqual({ role: "user", content: "SALUT" }); // toWire applied
    // assistant turn: prose + a generatedFilesNote naming the NON-image file (toWire'd)…
    expect(history[2].role).toBe("assistant");
    expect(history[2].content).toContain("OK");
    expect(history[2].content).toContain("RAPPORT.PDF");
    expect(history[2].content).not.toContain("CHART.PNG"); // image excluded
    // final user turn, no image attachments here
    expect(history[3]).toEqual({ role: "user", content: "USER WIRE" });
  });

  it("replays the working script on its LAST occurrence only (one copy per send)", () => {
    const history = buildWireHistory(
      [
        msg({ role: "assistant", content: "v1", pythonScript: "print('v1')" }),
        msg({
          role: "assistant",
          content: "v2",
          pythonScript: "print('v2')",
          attachments: [{ name: "rapport.pdf", kind: "file" }],
        }),
      ],
      { text: "u" },
      "",
      undefined,
      up,
    );
    // v1's marker is dropped (the LATEST script only)…
    expect(history[0].content).not.toContain("print('v1')");
    expect(history[0].content).not.toContain("Script d'analyse");
    // …v2 carries it, and the script is NOT wrapped by toWire (already wire form).
    expect(history[1].content).toContain("Script d'analyse");
    expect(history[1].content).toContain("print('v2')");
    // The deliverables note still rides alongside.
    expect(history[1].content).toContain("RAPPORT.PDF");
  });

  it("prefers modelContent over content, and attaches redacted page images when present", () => {
    const imgs = [{ type: "image" as const, mimeType: "image/png", data: "b64" }];
    const history = buildWireHistory(
      [msg({ role: "user", content: "shown", modelContent: "with doc folded" })],
      { text: "u" },
      "",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      imgs as any,
      up,
    );
    // no systemContent → no leading system message
    expect(history[0]).toEqual({ role: "user", content: "WITH DOC FOLDED" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((history[1] as any).attachments).toEqual(imgs);
  });
});

describe("buildSystemContent — la règle de langue atteint les DEUX chemins", () => {
  it("est dans le message système partagé, donc aussi sous la boucle agentique", () => {
    // La boucle AJOUTE sa guidance à ce même message : la porter ici la donne au flux
    // simple comme au tour d'outils, en un seul exemplaire (règle 9).
    const sys = buildSystemContent((t) => ({ text: t }) as never, undefined, false);
    expect(sys).toMatch(/LANGUE du message de l'utilisateur/);
    expect(sys).toMatch(/thinking|chaîne de pensée/);
  });
});
