// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { mount } from "../../testKit";
import { LoginScreen } from "./LoginScreen";
import { forgetGoogleEnabled } from "../../state/auth/useGoogleEnabled";
import type { Host } from "../../host";

/**
 * What these cases pin down is the CONTRACT an invitation flow consumes: it mounts this
 * very screen rather than its own card, with its
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
  it("porte un titre NEUTRE sur un appareil vierge, « revoir » seulement après un premier compte, et celui qu'on lui donne", async () => {
    localStorage.clear();
    const a = await mount(<LoginScreen />, { host: codeFirstHost() });
    // Nobody has signed in here yet: « Content de vous revoir » would be a lie.
    expect(a.el.textContent).toContain("Connexion à");
    expect(a.el.textContent).not.toContain("Content de vous revoir.");
    await a.unmount();

    // An account-scoped settings blob is the trace a sign-in leaves on the device.
    localStorage.setItem("openmasq.settings:user-a", "{}");
    const seen = await mount(<LoginScreen />, { host: codeFirstHost() });
    expect(seen.el.textContent).toContain("Content de vous revoir.");
    await seen.unmount();
    localStorage.clear();

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

  /**
   * The Google button follows the HOST's capability, never a `disabled` flag: a host
   * whose SSO is off omits `signInWithGoogle`, and no greyed promise is drawn in its
   * place. Present, the button is LIVE — it calls the host.
   */
  it("le bouton Google n'existe que si l'hôte expose le SSO — et alors il est vivant", async () => {
    const without = await mount(<LoginScreen />, { host: codeFirstHost() });
    expect(without.maybe(".login-sso")).toBeNull();
    await without.unmount();

    const signInWithGoogle = vi.fn(async () => ({}));
    const withSso = await mount(<LoginScreen />, { host: codeFirstHost({ signInWithGoogle }) });
    const btn = withSso.find<HTMLButtonElement>(".login-sso");
    expect(btn.disabled).toBe(false);
    await withSso.click(btn);
    expect(signInWithGoogle).toHaveBeenCalledTimes(1);
    await withSso.unmount();
  });

  /**
   * The one greyed case: the platform HAS the flow, the auth server has not switched
   * the provider on (14/09/2026: every click ended in « provider is not enabled »).
   * The button is then disabled with a word underneath — and a server that could not
   * be asked (`null`) leaves it live: no verdict, no grey.
   */
  it("le bouton Google est grisé quand le serveur dit que le fournisseur est éteint", async () => {
    forgetGoogleEnabled();
    const signInWithGoogle = vi.fn(async () => ({}));
    const off = await mount(<LoginScreen />, {
      host: codeFirstHost({ signInWithGoogle, googleEnabled: async () => false }),
    });
    await new Promise((r) => setTimeout(r, 0));
    await off.rerender(<LoginScreen />);
    expect(off.find<HTMLButtonElement>(".login-sso").disabled).toBe(true);
    expect(off.el.textContent).toMatch(/Bientôt disponible|Coming soon/);
    await off.unmount();

    forgetGoogleEnabled();
    const unknown = await mount(<LoginScreen />, {
      host: codeFirstHost({ signInWithGoogle, googleEnabled: async () => null }),
    });
    await new Promise((r) => setTimeout(r, 0));
    await unknown.rerender(<LoginScreen />);
    expect(unknown.find<HTMLButtonElement>(".login-sso").disabled).toBe(false);
    await unknown.unmount();
    forgetGoogleEnabled();
  });

  // On the hosted service sign-ups are closed: the card says « accès sur invitation »
  // under the field BEFORE the refusal `loginErrors.ts` would otherwise be first to mention.
  it("annonce l'accès sur invitation sous le champ, avant tout refus", async () => {
    const m = await mount(<LoginScreen />, { host: codeFirstHost() });
    expect(m.find(".login-invite").textContent).toContain("invitation");
    await m.unmount();
  });
});
