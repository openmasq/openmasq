import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ app: {} }));

import { getMessages } from "@openmasq/i18n";
import { buildHtml, ALLOW_TOOL_URL, ALLOW_URL, DENY_URL } from "./writeConfirmHtml";

const req = { toolName: "gmail__send_email", args: { to: "a@b.c" } };

describe("the write-confirmation window speaks the user's language", () => {
  it("French: lang attribute, title and buttons from the catalogue", () => {
    const html = buildHtml(req, { locale: "fr", t: getMessages("fr").desktopMain.writeConfirm });
    expect(html).toContain('<html lang="fr">');
    expect(html).toContain("Autoriser cette action");
    expect(html).toContain(">Refuser</a>");
    expect(html).toContain("Toujours pour cet outil</a>");
  });

  it("English: same structure, English words", () => {
    const html = buildHtml(req, { locale: "en", t: getMessages("en").desktopMain.writeConfirm });
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("Allow this action?");
    expect(html).toContain(">Deny</a>");
    expect(html).not.toMatch(/Autoriser|Refuser/);
  });

  it("the words change, the exits do not: the same three sentinel links in both languages", () => {
    for (const locale of ["fr", "en"] as const) {
      const html = buildHtml(req, { locale, t: getMessages(locale).desktopMain.writeConfirm });
      expect(html).toContain(`href="${DENY_URL}"`);
      expect(html).toContain(`href="${ALLOW_URL}"`);
      expect(html).toContain(`href="${ALLOW_TOOL_URL}"`);
    }
  });

  it("the catalogue's words are escaped like any other value", () => {
    const t = { ...getMessages("en").desktopMain.writeConfirm, deny: "<script>x</script>" };
    expect(buildHtml(req, { locale: "en", t })).not.toContain("<script>x");
  });
});
