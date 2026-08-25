import { describe, expect, it } from "vitest";
import { needsAccessNotice, type AccessNoticeInput } from "./accessNotice";

const base: AccessNoticeInput = {
  keyConfigured: new Set(),
  personalSub: { tier: "free", status: "free" },
  personalCredits: null,
  orgProfile: null,
  hasBilling: true,
};

describe("needsAccessNotice", () => {
  it("prévient quand il n'y a NI abonnement NI clé", () => {
    expect(needsAccessNotice(base)).toBe(true);
  });

  it("se tait dès qu'UNE clé, n'importe laquelle, est enregistrée", () => {
    expect(needsAccessNotice({ ...base, keyConfigured: new Set(["openrouter"]) })).toBe(false);
  });

  it("se tait dès qu'un abonnement payant existe", () => {
    expect(
      needsAccessNotice({ ...base, personalSub: { tier: "solo", status: "active" } }),
    ).toBe(false);
  });

  // Le piège du démarrage : la facturation arrive APRÈS le premier rendu. Traiter
  // « pas encore chargé » comme « aucun abonnement » ferait clignoter la bannière chez
  // quelqu'un qui paie — la pire personne à qui annoncer qu'il lui manque un abonnement.
  it("ne dit rien tant que l'abonnement n'est pas chargé", () => {
    expect(needsAccessNotice({ ...base, personalSub: null })).toBe(false);
  });

  it("se tait pour un membre d'organisation — ses accès ne sont pas à lui d'acheter", () => {
    expect(
      needsAccessNotice({
        ...base,
        orgProfile: { status: "active", blockedModelIds: [] } as never,
      }),
    ).toBe(false);
  });

  it("se tait quand la plateforme n'a rien à vendre (aperçu web)", () => {
    expect(needsAccessNotice({ ...base, hasBilling: false })).toBe(false);
  });

  // Un crédit restant EST un accès. Quand il s'épuise, c'est le blocage d'envoi qui le
  // dit, avec ses boutons — pas une bannière permanente au-dessus du composeur.
  it("se tait tant qu'il reste des crédits, prévient quand ils sont bloqués", () => {
    const credits = { allotmentCents: 800, consumedCents: 100, balanceCents: 700 };
    expect(needsAccessNotice({ ...base, personalCredits: { ...credits, blocked: false } })).toBe(false);
    expect(needsAccessNotice({ ...base, personalCredits: { ...credits, blocked: true } })).toBe(true);
  });
});
