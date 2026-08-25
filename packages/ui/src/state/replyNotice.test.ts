import { BRAND } from "@openmasq/branding";
import { describe, expect, it } from "vitest";
import { noticeText, pendingReplyIds, repliesToAnnounce, type NoticeConv } from "./replyNotice";

const conv = (id: string, ...msgs: NoticeConv["messages"]): NoticeConv => ({ id, messages: msgs });
const user = { role: "user" };
const streaming = { role: "assistant", pending: true };
const done = { role: "assistant" };
const failed = { role: "assistant", error: true };

describe("pendingReplyIds", () => {
  it("ne retient que les conversations dont la DERNIÈRE réponse coule encore", () => {
    const ids = pendingReplyIds([
      conv("a", user, streaming),
      conv("b", user, done),
      // Un tour terminé PUIS un nouveau départ : c'est le dernier qui compte.
      conv("c", user, done, user, streaming),
      conv("d"),
    ]);
    expect([...ids].sort()).toEqual(["a", "c"]);
  });
});

describe("repliesToAnnounce", () => {
  const base = { activeId: "other", focused: false };

  it("annonce une conversation qui vient de se poser", () => {
    expect(
      repliesToAnnounce({ ...base, prev: new Set(["a"]), convs: [conv("a", user, done)] }),
    ).toEqual([{ id: "a", failed: false }]);
  });

  // Le piège que tout le reste protège : sans la TRANSITION, chaque rendu ré-annoncerait
  // toutes les conversations terminées — et ouvrir l'app tirerait une salve de bannières.
  it("n'annonce rien pour une conversation déjà terminée au tick précédent", () => {
    expect(
      repliesToAnnounce({ ...base, prev: new Set(), convs: [conv("a", user, done)] }),
    ).toEqual([]);
  });

  it("n'annonce rien tant que la réponse coule", () => {
    expect(
      repliesToAnnounce({ ...base, prev: new Set(["a"]), convs: [conv("a", user, streaming)] }),
    ).toEqual([]);
  });

  it("se tait quand le fil est SOUS LES YEUX (fenêtre focalisée + onglet actif)", () => {
    expect(
      repliesToAnnounce({
        prev: new Set(["a"]),
        convs: [conv("a", user, done)],
        activeId: "a",
        focused: true,
      }),
    ).toEqual([]);
  });

  // Les tours tournent en parallèle par onglet : être dans l'app ne veut pas dire
  // regarder CE fil-là.
  it("annonce un AUTRE onglet même fenêtre au premier plan", () => {
    expect(
      repliesToAnnounce({
        prev: new Set(["b"]),
        convs: [conv("a", user, done), conv("b", user, done)],
        activeId: "a",
        focused: true,
      }),
    ).toEqual([{ id: "b", failed: false }]);
  });

  it("annonce l'onglet actif quand la fenêtre a perdu le focus", () => {
    expect(
      repliesToAnnounce({
        prev: new Set(["a"]),
        convs: [conv("a", user, done)],
        activeId: "a",
        focused: false,
      }),
    ).toEqual([{ id: "a", failed: false }]);
  });

  it("annonce aussi un ÉCHEC — revenir devant un envoi mort sans l'avoir su, jamais", () => {
    expect(
      repliesToAnnounce({ ...base, prev: new Set(["a"]), convs: [conv("a", user, failed)] }),
    ).toEqual([{ id: "a", failed: true }]);
  });

  it("oublie une conversation supprimée pendant son tour (il n'y a plus rien à ouvrir)", () => {
    expect(repliesToAnnounce({ ...base, prev: new Set(["a"]), convs: [] })).toEqual([]);
  });
});

describe("noticeText", () => {
  // Le titre d'une conversation est dérivé du premier message : c'est de la donnée RÉELLE,
  // et une bannière système s'affiche par-dessus tout, parfois sur un écran verrouillé.
  it("ne porte ni contenu ni titre de conversation", () => {
    const t = noticeText({ id: "c-secret", failed: false }, "GPT-5.5");
    expect(t.title).toBe(BRAND.name);
    expect(t.body).toBe("Réponse prête · GPT-5.5");
    expect(`${t.title} ${t.body}`).not.toContain("c-secret");
  });

  it("dit l'échec, et ce qu'il reste à faire", () => {
    expect(noticeText({ id: "a", failed: true }).body).toContain("échoué");
  });
});
