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
      // A finished turn THEN a new start: it's the last one that counts.
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

  // The trap everything else guards against: without the TRANSITION, every render would
  // re-announce every finished conversation — and opening the app would fire off a volley of banners.
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

  // Turns run in parallel per tab: being in the app doesn't mean
  // you're looking at THIS thread.
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
  // A conversation's title is derived from the first message: it is REAL data,
  // and a system banner displays over everything, sometimes on a locked screen.
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
