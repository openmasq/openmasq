// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { blur, mount } from "../../../testKit";
import { McpBrowserSecurity } from "./McpBrowserSecurity";
import type { Settings } from "../../../types";

/**
 * Regression: the allowed-domains textarea was initialized ONCE via
 * `useState`, and never resynced if `browserAllowedDomains` changed UNDER it
 * (account switch, async rehydration from the database). A user who stayed on
 * this tab during the switch saw the previous account's list, and leaving it (blur)
 * re-saved that stale value over the real one — an agent-browser allow-list
 * silently replaced by another account's.
 */

const settings = (domains: string[]) => ({ browserAllowedDomains: domains }) as Settings;

describe("McpBrowserSecurity — le textarea des domaines suit le réglage externe", () => {
  it("se resynchronise quand `browserAllowedDomains` change SOUS le composant", async () => {
    const m = await mount(<McpBrowserSecurity settings={settings(["ancien.example"])} setSettings={() => {}} />);
    expect(m.find<HTMLTextAreaElement>(".mcp-allowlist").value).toBe("ancien.example");

    // The account switches: the settings change without the user having touched the field.
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
