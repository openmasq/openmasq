// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { blur, mount } from "../../../testKit";
import { McpBrowserSecurity } from "./McpBrowserSecurity";
import type { Settings } from "../../../types";

/**
 * Régression : le textarea des domaines autorisés était initialisé UNE FOIS via
 * `useState`, sans jamais se resynchroniser si `browserAllowedDomains` changeait SOUS lui
 * (bascule de compte, réhydratation asynchrone depuis la base). Un utilisateur resté sur
 * cet onglet pendant la bascule voyait la liste de l'ancien compte, et la quitter (blur)
 * réenregistrait cette valeur périmée par-dessus la vraie — une liste d'autorisation du
 * navigateur agent silencieusement remplacée par celle d'un autre compte.
 */

const settings = (domains: string[]) => ({ browserAllowedDomains: domains }) as Settings;

describe("McpBrowserSecurity — le textarea des domaines suit le réglage externe", () => {
  it("se resynchronise quand `browserAllowedDomains` change SOUS le composant", async () => {
    const m = await mount(<McpBrowserSecurity settings={settings(["ancien.example"])} setSettings={() => {}} />);
    expect(m.find<HTMLTextAreaElement>(".mcp-allowlist").value).toBe("ancien.example");

    // Le compte bascule : les réglages changent sans que l'utilisateur ait touché le champ.
    await m.rerender(<McpBrowserSecurity settings={settings(["nouveau.example"])} setSettings={() => {}} />);
    expect(m.find<HTMLTextAreaElement>(".mcp-allowlist").value).toBe("nouveau.example");

    await m.unmount();
  });

  it("un blur après la bascule enregistre la valeur FRAÎCHE, jamais l'ancienne", async () => {
    let saved: Settings | null = null;
    const capture = (base: Settings) => (updater: (s: Settings) => Settings) => {
      saved = updater(saved ?? base);
    };

    const a = settings(["ancien.example"]);
    const m = await mount(<McpBrowserSecurity settings={a} setSettings={capture(a)} />);

    const b = settings(["nouveau.example"]);
    await m.rerender(<McpBrowserSecurity settings={b} setSettings={capture(b)} />);
    await blur(m.find(".mcp-allowlist"));

    expect(saved).not.toBeNull();
    expect((saved as unknown as Settings).browserAllowedDomains).toEqual(["nouveau.example"]);

    await m.unmount();
  });
});
