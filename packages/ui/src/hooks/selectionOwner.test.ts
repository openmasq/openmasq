// @vitest-environment jsdom
import { BRAND } from "@openmasq/branding";
import { describe, it, expect, beforeEach } from "vitest";
import { selectionBelongsTo, selectionIsUserText } from "./selectionOwner";

/** The real shape: the chat scrolls a message list AND hosts a non-portalled modal whose
 *  panel contains the document preview body. */
function mount() {
  document.body.innerHTML = `
    <div id="chat">
      <div id="messages"><p id="msg">Bonjour Léa</p></div>
      <div class="modal-panel" id="panel">
        <div id="fvbody"><p id="doc">Contrat entre Karl Studio</p></div>
      </div>
    </div>`;
  const $ = (id: string) => document.getElementById(id)!;
  return { chat: $("chat"), fvbody: $("fvbody"), msg: $("msg").firstChild!, doc: $("doc").firstChild! };
}

describe("selectionBelongsTo — one drag, one menu", () => {
  beforeEach(() => mount());

  it("the chat does NOT own a selection made inside a modal it contains", () => {
    const { chat, doc } = mount();
    expect(chat.contains(doc)).toBe(true); // containment alone said yes — the bug
    expect(selectionBelongsTo(chat, doc)).toBe(false);
  });

  it("the modal's own tracker DOES own it", () => {
    const { fvbody, doc } = mount();
    expect(selectionBelongsTo(fvbody, doc)).toBe(true);
  });

  it("the chat still owns a selection in a message", () => {
    const { chat, msg } = mount();
    expect(selectionBelongsTo(chat, msg)).toBe(true);
  });

  it("rejects a node outside the host, and a missing node", () => {
    const { fvbody, msg } = mount();
    expect(selectionBelongsTo(fvbody, msg)).toBe(false);
    expect(selectionBelongsTo(fvbody, null)).toBe(false);
  });
});

/** The real message list: content bubbles, and all the app's own text around them. */
function mountList() {
  document.body.innerHTML = `
    <div id="messages">
      <div class="msg user">
        <div class="msg-bubble" data-user-text><p id="mine">Mon IBAN est FR14</p></div>
        <div class="shield-caption"><span id="caption">${BRAND.name} a retenu : IBAN</span></div>
      </div>
      <div class="msg assistant">
        <div class="msg-meta"><span id="model">GPT-5</span></div>
        <div class="msg-answer" data-user-text><p id="reply">Bonjour Léa</p></div>
        <div class="msg-actions"><button id="btn">Copier</button></div>
      </div>
    </div>`;
  const $ = (id: string) => document.getElementById(id)!;
  return {
    list: $("messages"),
    mine: $("mine").firstChild!,
    reply: $("reply").firstChild!,
    caption: $("caption").firstChild!,
    model: $("model").firstChild!,
    btn: $("btn").firstChild!,
  };
}

const USER_TEXT = "[data-user-text]";

describe("selectionIsUserText — le menu ne s'ouvre que sur du contenu", () => {
  it("s'ouvre sur ce que l'utilisateur a écrit et sur la réponse du modèle", () => {
    const { mine, reply } = mountList();
    expect(selectionIsUserText(mine, USER_TEXT)).toBe(true);
    expect(selectionIsUserText(reply, USER_TEXT)).toBe(true);
  });

  it("ne s'ouvre PAS sur le texte que l'app dit d'elle-même", () => {
    // Redacting a caption the model never saw, or « retenir » a sentence
    // the app just wrote, means nothing.
    const { caption, model, btn } = mountList();
    expect(selectionIsUserText(caption, USER_TEXT)).toBe(false);
    expect(selectionIsUserText(model, USER_TEXT)).toBe(false);
    expect(selectionIsUserText(btn, USER_TEXT)).toBe(false);
  });

  it("ne s'ouvre pas sur une sélection À CHEVAL sur le contenu et le chrome", () => {
    // A drag from the reply to the next model's name: the common ancestor
    // is above both, hence above every marked node.
    const { list } = mountList();
    expect(selectionIsUserText(list, USER_TEXT)).toBe(false);
  });

  it("laisse passer TOUT quand l'appelant ne nomme pas de contenu", () => {
    // The document preview has no chrome to exclude: every character is
    // document. That's why `within` is optional on the hook side.
    const { caption } = mountList();
    expect(selectionIsUserText(caption, "*")).toBe(true);
  });
});
