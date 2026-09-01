// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { mount } from "../../testKit";
import { LoginScreen } from "./LoginScreen";
import type { Host } from "../../host";

/**
 * What these cases pin down is the CONTRACT that `apps/web`'s invitation page has
 * started consuming: it mounts this very screen rather than its own card, with its
 * own title — and above all, on a CODE-first platform, the code field must appear
 * right after sending. That's exactly what the local card didn't have: the
 * authentication email is code-first outside desktop (`supabase/functions/send-email`), so
 * the invitee received an eight-digit code with nowhere to enter it.
 */
const codeFirstHost = (over: Partial<NonNullable<Host["auth"]>> = {}): Partial<Host> => ({
  auth: {
    getSession: async () => null,
    onChange: () => () => {},
    sendMagicLink: async () => ({}),
    // Present ⇒ `codeSupported`; `linkFirst` absent ⇒ code-first (the web, the extension).
    verifyCode: async () => ({}),
    signOut: async () => {},
    ...over,
  },
});

describe("LoginScreen", () => {
  it("porte son titre par défaut, et celui qu'on lui donne", async () => {
    const a = await mount(<LoginScreen />, { host: codeFirstHost() });
    expect(a.el.textContent).toContain("Content de vous revoir.");
    await a.unmount();

    const b = await mount(
      <LoginScreen heading="Rejoindre l'organisation" subheading="Connectez-vous avec l'adresse invitée." />,
      { host: codeFirstHost() },
    );
    expect(b.el.textContent).toContain("Rejoindre l'organisation");
    expect(b.el.textContent).toContain("Connectez-vous avec l'adresse invitée.");
    // The custom title replaces ONLY the first step.
    expect(b.el.textContent).not.toContain("Content de vous revoir.");
    await b.unmount();
  });

  // A button that does NOTHING is the worst state for someone discovering the app: nothing
  // distinguishes "I made a mistake" from "it's crashed". Without `required`, an empty field
  // is valid HTML, the form submits, and `submitEmail` silently drops it.
  it("le champ e-mail est REQUIS — un envoi à vide ne peut pas partir en silence", async () => {
    const sendMagicLink = vi.fn(async () => ({}));
    const a = await mount(<LoginScreen />, { host: codeFirstHost({ sendMagicLink }) });

    const input = a.el.querySelector<HTMLInputElement>("input[type=email]");
    expect(input?.required).toBe(true);
    // submitEmail's guard remains the second barrier: even submitted, an empty one calls nothing.
    a.el.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(sendMagicLink).not.toHaveBeenCalled();
    await a.unmount();
  });

  it("code-first : après l'envoi, le champ CODE est offert d'emblée", async () => {
    const verifyCode = vi.fn(async () => ({}));
    const m = await mount(<LoginScreen heading="Rejoindre l'organisation" />, {
      host: codeFirstHost({ verifyCode }),
    });

    await m.type(".login-input", "invite@acme.com");
    await m.click("button[type=submit]");

    const code = m.find<HTMLInputElement>("input[autocomplete='one-time-code']");
    expect(code).toBeTruthy();
    await m.type(code, "01602620");
    await m.click("button[type=submit]");
    expect(verifyCode).toHaveBeenCalledWith({ email: "invite@acme.com", code: "01602620" });
    await m.unmount();
  });

  /**
   * The spam reminder is the answer to this flow's first "it's not working" (an
   * authentication email is the most-filtered message there is). BOTH halves
   * matter: before sending, the sentence would announce a problem to someone who hasn't asked for one.
   */
  it("le rappel des spams apparaît APRÈS l'envoi, jamais avant", async () => {
    const m = await mount(<LoginScreen />, { host: codeFirstHost() });
    expect(m.el.textContent).not.toContain("spams");

    await m.type(".login-input", "invite@acme.com");
    await m.click("button[type=submit]");

    expect(m.el.textContent).toContain("Rien reçu ? Regardez dans vos spams");
    expect(m.find(".login-hint-icon")).toBeTruthy();
    await m.unmount();
  });
});
