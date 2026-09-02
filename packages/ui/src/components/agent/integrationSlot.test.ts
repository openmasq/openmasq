import { describe, expect, it } from "vitest";
import { integrationHostId } from "./integrationSlot";

const m = (id: string, ids?: string[], pending = false) => ({ id, pending, suggestedIntegrations: ids });

describe("integrationHostId — une proposition par conversation, jamais avec une carte « une fois »", () => {
  it("le premier tour qui a proposé garde ses cartes, les suivants se taisent", () => {
    const msgs = [m("u1"), m("a1", ["gmail"]), m("u2"), m("a2", ["notion"])];
    expect(integrationHostId(msgs, false)).toBe("a1");
  });

  it("rien à proposer ⇒ null ; un tour encore en cours ne compte pas", () => {
    expect(integrationHostId([m("u1"), m("a1")], false)).toBeNull();
    expect(integrationHostId([m("u1"), m("a1", ["gmail"], true)], false)).toBeNull();
  });

  it("une carte « une fois » à l'écran prend le tour : la proposition du DERNIER message attend", () => {
    const msgs = [m("u1"), m("a1", ["gmail"])];
    expect(integrationHostId(msgs, true)).toBeNull();
    // …and surfaces once the thread moved on (the card is no longer on this turn).
    expect(integrationHostId([...msgs, m("u2"), m("a2")], true)).toBe("a1");
    // An earlier proposal is unaffected — it already had its turn.
    expect(integrationHostId([...msgs, m("u2"), m("a2", ["notion"])], true)).toBe("a1");
  });
});
