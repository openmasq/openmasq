import { describe, expect, it } from "vitest";
import {
  CONFIRMATION_POLICY,
  composeConfirmationMode,
  confirmationModeLocked,
  parseConfirmationMode,
  confirmationSurface,
  type ConfirmationCondition,
  type ConfirmationMode,
} from "./confirmationPolicy";

describe("confirmationSurface — mode standard", () => {
  it("un write sans exposition web ne confirme PAS (aucune règle ne matche)", () => {
    expect(confirmationSurface("standard", { risk: "high", searchToolCalls: 0 })).toBeNull();
  });

  it("après une recherche internet, la carte inline s'ouvre — UNE fois par conversation", () => {
    const first = confirmationSurface("standard", {
      risk: "low",
      searchToolCalls: 1,
      confirmationsShown: 0,
    });
    expect(first?.id).toBe("post-search-once");
    expect(first?.surface).toBe("inline");
    // The card has been shown once ⇒ the cap closes the rule for the conversation.
    expect(
      confirmationSurface("standard", { risk: "low", searchToolCalls: 3, confirmationsShown: 1 }),
    ).toBeNull();
  });

  it("PLANCHER : un signal d'exfil confirme toujours, même carte déjà montrée, même sans recherche", () => {
    const r = confirmationSurface("standard", {
      risk: "low",
      searchToolCalls: 0,
      exfilFlags: 1,
      confirmationsShown: 5,
    });
    expect(r?.id).toBe("exfil-floor");
    expect(r?.surface).toBe("inline");
  });

  it("PLANCHER : une pièce jointe confirme toujours", () => {
    const r = confirmationSurface("standard", {
      risk: "low",
      attachments: 2,
      confirmationsShown: 5,
    });
    expect(r?.id).toBe("attachments-floor");
    expect(r?.surface).toBe("inline");
  });

  it("ne route JAMAIS vers la fenêtre système (main n'ouvre pas de modale en standard)", () => {
    // MAIN's view: only `risk` is known, the counters are absent (⇒ 0).
    expect(confirmationSurface("standard", { risk: "high" })).toBeNull();
    for (const rule of CONFIRMATION_POLICY.standard) {
      expect(rule.surface).not.toBe("system-modal");
    }
  });
});

describe("les PLANCHERS sont déclarés dans la politique (floor) — pas dans un call site", () => {
  it("exfil / pièces jointes / envoi portent `floor` dans les DEUX modes", () => {
    // This is the bit the renderer reads to refuse the allow-list exemption
    // ("Allow" is not consent for the second send) — audit B.
    const floors = Object.values(CONFIRMATION_POLICY)
      .flat()
      .filter((r) => r.floor === true)
      .map((r) => r.id)
      .sort();
    expect(floors).toEqual([
      "attachments",
      "attachments-floor",
      "exfil",
      "exfil-floor",
      "send-floor",
      "send-floor",
    ]);
  });

  it("les règles exemptables ne portent PAS `floor` (« Autoriser » garde sa promesse)", () => {
    for (const mode of ["standard", "renforce"] as const) {
      for (const r of CONFIRMATION_POLICY[mode]) {
        if (!["exfil", "exfil-floor", "attachments", "attachments-floor", "send-floor"].includes(r.id)) {
          expect(r.floor, `${mode}/${r.id}`).not.toBe(true);
        }
      }
    }
  });

  it("un plancher n'est jamais plafonné — `maxPerConversation` et `floor` s'excluent", () => {
    for (const rules of Object.values(CONFIRMATION_POLICY)) {
      for (const r of rules) {
        if (r.floor) expect(r.maxPerConversation, r.id).toBeUndefined();
      }
    }
  });
});

describe("confirmationSurface — mode renforcé (le comportement historique)", () => {
  it("un write risqué va sur la fenêtre système", () => {
    expect(confirmationSurface("renforce", { risk: "high" })?.surface).toBe("system-modal");
  });

  it("un write ordinaire (low) est confirmé par la carte inline", () => {
    const r = confirmationSurface("renforce", { risk: "low" });
    expect(r?.id).toBe("every-write");
    expect(r?.surface).toBe("inline");
  });

  it("un ENVOI non risqué matche le plancher d'envoi — renforcé n'est jamais moins confirmant que standard", () => {
    const r = confirmationSurface("renforce", { risk: "low", sends: 1 });
    expect(r?.id).toBe("send-floor");
    expect(r?.floor).toBe(true);
    // A RISKY send keeps the system window (the floor is placed AFTER risky-system):
    expect(confirmationSurface("renforce", { risk: "high", sends: 1 })?.surface).toBe(
      "system-modal",
    );
  });

  it("un exfil / une pièce jointe gardent la carte inline (les signaux vivent côté renderer)", () => {
    expect(confirmationSurface("renforce", { risk: "high", exfilFlags: 2 })?.surface).toBe("inline");
    expect(confirmationSurface("renforce", { risk: "high", attachments: 1 })?.surface).toBe("inline");
  });
});

describe("fail closed", () => {
  it("un mode inconnu évalue la politique renforcée", () => {
    const r = confirmationSurface("n'importe-quoi" as ConfirmationMode, { risk: "high" });
    expect(r?.surface).toBe("system-modal");
  });

  it("un op inconnu MATCHE (sur-confirmer, jamais sous-confirmer)", () => {
    // Found by ID, never by index — that is what the policy file demands, and an
    // indexed test breaks as soon as a rule is inserted before it (which is what
    // happened when the send floor was added). We also neutralize the floors placed
    // BEFORE it, else one of them would answer instead.
    const rules = CONFIRMATION_POLICY.standard;
    const target = rules.find((r) => r.id === "post-search-once")!;
    const before = rules.slice(0, rules.indexOf(target));
    const saved = new Map(rules.map((r) => [r.id, r.when]));
    const patched: ConfirmationCondition = { fact: "searchToolCalls", op: "@gt" as never, value: 0 };
    for (const r of before) r.when = [{ fact: "attachments", op: "gt", value: 999 }];
    target.when = [patched];
    try {
      expect(confirmationSurface("standard", { risk: "low" })?.id).toBe("post-search-once");
    } finally {
      for (const r of rules) r.when = saved.get(r.id)!;
    }
  });

  it("un ENVOI se confirme toujours en mode standard, et à CHAQUE fois", () => {
    // The bug from the 27/07/2026 journal: "Send nothing" and the e-mail went out with
    // no card, the conversation never having touched the web. A send cannot be undone,
    // so it's a floor — uncapped, unlike the post-search card.
    expect(confirmationSurface("standard", { risk: "low", sends: 1 })?.id).toBe("send-floor");
    expect(
      confirmationSurface("standard", { risk: "low", sends: 1, confirmationsShown: 12 })?.id,
      "un envoi déjà confirmé n'autorise pas le suivant",
    ).toBe("send-floor");
    // And nothing changes for an ordinary write: the mode stays light.
    expect(confirmationSurface("standard", { risk: "low" })).toBeNull();
  });
});

describe("composeConfirmationMode — an org floor may only TIGHTEN", () => {
  it("no floor ⇒ the member's own choice", () => {
    expect(composeConfirmationMode(null, "standard")).toBe("standard");
    expect(composeConfirmationMode(undefined, "renforce")).toBe("renforce");
  });

  it("a renforce floor wins over a member on standard", () => {
    expect(composeConfirmationMode("renforce", "standard")).toBe("renforce");
  });

  it("a standard floor NEVER loosens a member on renforce — the direction that matters", () => {
    // This is the property that makes an unverified, renderer-supplied floor safe:
    // whatever it says, it can only ADD confirmations.
    expect(composeConfirmationMode("standard", "renforce")).toBe("renforce");
  });

  it("is idempotent on equal values", () => {
    expect(composeConfirmationMode("renforce", "renforce")).toBe("renforce");
    expect(composeConfirmationMode("standard", "standard")).toBe("standard");
  });
});

describe("parseConfirmationMode", () => {
  it("accepts the two real modes and NOTHING else", () => {
    expect(parseConfirmationMode("standard")).toBe("standard");
    expect(parseConfirmationMode("renforce")).toBe("renforce");
    for (const bad of ["dangerous", "", null, undefined, 1, {}, ["renforce"]]) {
      expect(parseConfirmationMode(bad)).toBeNull();
    }
  });
});

describe("confirmationModeLocked", () => {
  it("locks the member's toggle only when the floor is already at the maximum", () => {
    expect(confirmationModeLocked("renforce")).toBe(true);
    expect(confirmationModeLocked("standard")).toBe(false);
    expect(confirmationModeLocked(null)).toBe(false);
  });
});
