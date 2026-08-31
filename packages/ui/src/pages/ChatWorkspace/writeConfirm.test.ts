import { describe, it, expect, beforeEach } from "vitest";
import {
  applyWriteAllowLists,
  convWriteToolKey,
  describeWriteArgs,
  pendingGateToRelease,
  writeToolKey,
  writeConfirmDecision,
} from "./writeConfirm";
import {
  _resetConfirmationFacts,
  recordConfirmationShown,
  confirmationsShownCount,
  recordWebSearch,
  webSearchCount,
} from "../../agent/confirmationFacts";

describe("writeConfirmDecision — the policy-driven card decision", () => {
  const base = {
    tool: "gmail__send_email",
    server: "gmail",
    exfilFlags: 0,
    attachments: 0,
    searchToolCalls: 0,
    confirmationsShown: 0,
    mainWriteGate: true,
  };

  it("standard : un write sans exposition web passe SANS carte", () => {
    expect(writeConfirmDecision({ ...base, mode: "standard" })).toEqual({
      decision: "auto",
      floor: false,
    });
  });

  it("standard : après une recherche internet, UNE carte — puis plus rien", () => {
    expect(writeConfirmDecision({ ...base, mode: "standard", searchToolCalls: 1 })).toEqual({
      decision: "card",
      floor: false, // the post-search card is NOT a floor: « Autoriser » exempts it
    });
    expect(
      writeConfirmDecision({ ...base, mode: "standard", searchToolCalls: 1, confirmationsShown: 1 })
        .decision,
    ).toBe("auto");
  });

  it("standard : les planchers exfil / pièces jointes ouvrent toujours la carte — et sont marqués PLANCHERS", () => {
    expect(
      writeConfirmDecision({ ...base, mode: "standard", exfilFlags: 1, confirmationsShown: 3 }),
    ).toEqual({ decision: "card", floor: true });
    expect(
      writeConfirmDecision({ ...base, mode: "standard", attachments: 2, confirmationsShown: 3 }),
    ).toEqual({ decision: "card", floor: true });
  });

  it("renforcé : un write risqué est déféré à la fenêtre main (pas de double prompt)", () => {
    expect(writeConfirmDecision({ ...base, mode: "renforce" }).decision).toBe("defer-to-main");
  });

  it("renforcé : un write ordinaire (low) garde la carte inline", () => {
    expect(
      writeConfirmDecision({ ...base, mode: "renforce", tool: "gmail__create_draft" }),
    ).toEqual({ decision: "card", floor: false });
  });

  it("renforcé : un exfil garde la carte (les signaux vivent côté renderer)", () => {
    expect(writeConfirmDecision({ ...base, mode: "renforce", exfilFlags: 1 })).toEqual({
      decision: "card",
      floor: true,
    });
  });

  it("renforcé : un ENVOI ordinaire est un plancher aussi — jamais moins confirmant que standard", () => {
    expect(
      writeConfirmDecision({ ...base, mode: "renforce", tool: "gmail__create_draft", sends: true }),
    ).toEqual({ decision: "card", floor: true });
  });

  it("SANS fenêtre main (preview web), un verdict system-modal retombe sur la carte — jamais sur rien", () => {
    expect(writeConfirmDecision({ ...base, mode: "renforce", mainWriteGate: false }).decision).toBe(
      "card",
    );
  });
});

describe("applyWriteAllowLists — un « Autoriser » n'exempte JAMAIS un plancher (audit B)", () => {
  const base = {
    tool: "gmail__send_email",
    server: "gmail",
    exfilFlags: 0,
    attachments: 0,
    searchToolCalls: 0,
    confirmationsShown: 0,
    mainWriteGate: true,
  };

  it("RÉGRESSION : deux send_email après « Autoriser », le 2e avec pièce jointe ⇒ les DEUX passent par la carte", () => {
    // The order was the bug: ChatView tested the allow-lists BEFORE the policy, so
    // after an « Autoriser » on the first send, the second — attachment included —
    // went out without a card, even though `send-floor` declares « every send confirms,
    // including the second ».
    const first = writeConfirmDecision({ ...base, mode: "standard", sends: true });
    expect(applyWriteAllowLists(first, false)).toBe("card"); // nothing authorized yet
    // The user clicks « Autoriser » ⇒ the tool enters the conversation's
    // allow-list. Second send, SAME tool, this time with an attachment:
    const second = writeConfirmDecision({
      ...base,
      mode: "standard",
      sends: true,
      attachments: 1,
      confirmationsShown: 1,
    });
    expect(applyWriteAllowLists(second, true)).toBe("card"); // the floor holds
  });

  it("« Autoriser » continue d'exempter une écriture ORDINAIRE répétée (non-plancher)", () => {
    const ordinary = writeConfirmDecision({
      ...base,
      mode: "standard",
      tool: "notion__update_page",
      server: "notion",
      searchToolCalls: 1, // conversation exposed to the web ⇒ the post-search card would match
    });
    expect(ordinary.decision).toBe("card");
    expect(applyWriteAllowLists(ordinary, true)).toBe("auto"); // the click's promise holds too
  });

  it("l'auto-approbation globale de session est bornée pareil : les planchers redemandent", () => {
    const send = writeConfirmDecision({ ...base, mode: "standard", sends: true });
    // `allowedByUser` covers all three lists, including the global toggle.
    expect(applyWriteAllowLists(send, true)).toBe("card");
  });

  it("sans verdict de carte, l'allow-list ne fabrique rien (auto reste auto)", () => {
    const none = writeConfirmDecision({ ...base, mode: "standard" });
    expect(applyWriteAllowLists(none, true)).toBe("auto");
    expect(applyWriteAllowLists(none, false)).toBe("auto");
  });
});

describe("confirmationFacts — les compteurs par conversation", () => {
  beforeEach(() => _resetConfirmationFacts());

  it("compte les recherches et les cartes PAR conversation, sans fuite entre threads", () => {
    recordWebSearch("conv-a");
    recordWebSearch("conv-a");
    recordConfirmationShown("conv-a");
    expect(webSearchCount("conv-a")).toBe(2);
    expect(confirmationsShownCount("conv-a")).toBe(1);
    expect(webSearchCount("conv-b")).toBe(0);
    expect(confirmationsShownCount("conv-b")).toBe(0);
  });
});

describe("allow-list keys", () => {
  it("the per-conversation key scopes by conversation — same tool, other thread ⇒ other key", () => {
    const a = convWriteToolKey("conv-a", "webflow", "data_sites_tool");
    expect(convWriteToolKey("conv-b", "webflow", "data_sites_tool")).not.toBe(a);
    expect(convWriteToolKey("conv-a", "webflow", "other_tool")).not.toBe(a);
  });
  it("no (id, server, tool) triple can forge another's key (\\0 separators)", () => {
    // A crafted conversation id embedding a separator must not collide with a
    // legitimately-keyed pair, and the session key never equals a conversation key.
    expect(convWriteToolKey("c", "s", "t")).not.toBe(convWriteToolKey("c\0s", "", "t"));
    expect(convWriteToolKey("", "s", "t")).not.toBe(writeToolKey("s", "t"));
  });
});

describe("describeWriteArgs", () => {
  it("summarises the Webflow actions[].label shape (not raw JSON)", () => {
    const r = describeWriteArgs({
      actions: [{ label: "List all sites", list_sites: {} }],
      context: "Listing all available Webflow sites to identify the correct site ID.",
    });
    expect(r.lines).toEqual(["List all sites"]);
    expect(r.context).toContain("Listing all available Webflow sites");
    expect(r.json).toContain("list_sites");
  });

  it("names a label-less action after its operation key", () => {
    const r = describeWriteArgs({ actions: [{ create_page: { title: "x" } }] });
    expect(r.lines).toEqual(["create page"]);
  });

  it("falls back to top-level keys (excluding context) when there is no actions array", () => {
    const r = describeWriteArgs({ site_id: "abc123", publish: true, context: "a note" });
    expect(r.lines).toEqual(["site id: abc123", "publish: true"]);
    expect(r.context).toBe("a note"); // context is surfaced separately, not as a line
  });

  it("never throws and always yields json", () => {
    const r = describeWriteArgs({});
    expect(Array.isArray(r.lines)).toBe(true);
    expect(typeof r.json).toBe("string");
  });
});

describe("pendingGateToRelease", () => {
  it("releases the viewed conversation's own card once its turn has ended", () => {
    // Stop pressed with the card still up: the loop already abandoned its await, so the
    // card must not linger on a promise nobody will ever resolve.
    expect(
      pendingGateToRelease({
        pendingConvIds: ["a"],
        viewedConvId: "a",
        viewedIsStreaming: false,
      }),
    ).toBe("a");
  });

  it("does NOT release a card belonging to a conversation the user navigated away from", () => {
    // THE REGRESSION. Conversation "a" is still awaiting the user's answer; the user is
    // reading "b", which is idle — so the VIEWED conversation is not streaming. Releasing
    // on that alone refused a call "a" never asked about: the card vanished, the loop was
    // told "refusé par l'utilisateur", and the model answered from its memory of the FAKE,
    // which un-redacts into a confident, fabricated answer about the real person.
    expect(
      pendingGateToRelease({
        pendingConvIds: ["a"],
        viewedConvId: "b",
        viewedIsStreaming: false,
      }),
    ).toBeNull();
  });

  it("keeps the card waiting while the viewed conversation is still streaming", () => {
    expect(
      pendingGateToRelease({
        pendingConvIds: ["a"],
        viewedConvId: "a",
        viewedIsStreaming: true,
      }),
    ).toBeNull();
  });

  it("releases only the viewed card when several conversations are awaiting one", () => {
    // Concurrent per-tab turns: "b" is idle and on screen, "a" is still waiting elsewhere.
    expect(
      pendingGateToRelease({
        pendingConvIds: ["a", "b"],
        viewedConvId: "b",
        viewedIsStreaming: false,
      }),
    ).toBe("b");
  });

  it("releases nothing with no conversation open, or none pending", () => {
    expect(
      pendingGateToRelease({ pendingConvIds: ["a"], viewedIsStreaming: false }),
    ).toBeNull();
    expect(
      pendingGateToRelease({ pendingConvIds: [], viewedConvId: "a", viewedIsStreaming: false }),
    ).toBeNull();
  });
});
