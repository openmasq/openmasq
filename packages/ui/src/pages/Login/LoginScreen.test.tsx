// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { mount } from "../../testKit";
import { LoginScreen } from "./LoginScreen";
import type { Host } from "../../host";

/**
 * Ce que ces cas tiennent, c'est le CONTRAT que la page d'invitation d'`apps/web` a
 * commencé à consommer : elle monte cet écran-ci plutôt que sa propre carte, avec son
 * propre titre — et surtout, sur une plateforme CODE-first, le champ code doit apparaître
 * dès l'envoi. C'est exactement ce que la carte locale n'avait pas : le mail
 * d'authentification est code-first hors bureau (`supabase/functions/send-email`), donc
 * l'invité recevait un code à huit chiffres sans nulle part où le saisir.
 */
const codeFirstHost = (over: Partial<NonNullable<Host["auth"]>> = {}): Partial<Host> => ({
  auth: {
    getSession: async () => null,
    onChange: () => () => {},
    sendMagicLink: async () => ({}),
    // Présent ⇒ `codeSupported` ; `linkFirst` absent ⇒ code-first (le web, l'extension).
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
    // Le titre personnalisé ne remplace QUE la première étape.
    expect(b.el.textContent).not.toContain("Content de vous revoir.");
    await b.unmount();
  });

  // Un bouton qui ne fait RIEN est le pire état pour qui découvre l'app : rien ne
  // distingue « je me suis trompé » de « c'est planté ». Sans `required`, un champ vide
  // est valide en HTML, le formulaire part, et `submitEmail` le jette en silence.
  it("le champ e-mail est REQUIS — un envoi à vide ne peut pas partir en silence", async () => {
    const sendMagicLink = vi.fn(async () => ({}));
    const a = await mount(<LoginScreen />, { host: codeFirstHost({ sendMagicLink }) });

    const input = a.el.querySelector<HTMLInputElement>("input[type=email]");
    expect(input?.required).toBe(true);
    // Le garde de submitEmail reste la seconde barrière : même soumis, un vide n'appelle rien.
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
   * Le rappel des spams est la réponse au premier « ça ne marche pas » de ce parcours (un
   * e-mail d'authentification est le message le plus filtré qui existe). Les DEUX moitiés
   * comptent : avant l'envoi, la phrase annoncerait un problème à qui n'a rien demandé.
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
