import { describe, expect, it } from "vitest";
import { redact } from "../redact";

// Judged on the EMAIL rule's own verdict, not on the text: `ai4privacy.ner-strict@…` also
// carries `ai4privacy`, which the generic key heuristic claims on its own — another rule's
// business, measured in its own file.
const asEmail = (s: string) =>
  (redact(`Le rapport cite ${s} dans la marge.`).matches as { type: string; value: string }[])
    .some((m) => m.type === "email");
const masked = asEmail;

describe("the e-mail rule", () => {
  /**
   * A file named `<corpus>.<engine>@<model>.json` is not an address: what follows the last
   * dot is an EXTENSION, and the engine matched five of them per run as e-mails on a coding
   * agent reading this repository's bench results — each vaulted, each rewritten into the
   * text the agent then reasoned on. The list of extensions is closed and fails toward
   * masking: an unknown one is still an address.
   */
  it.each([
    "ai4privacy.ner-strict@mbert-12l.json",
    "internal.ner-strict@mbert-12l.json",
    "results/tab.human@v2.yaml",
    "build.step@ci.log",
    "index.spec@main.ts",
  ])("leaves the bench-style file name %s in clear", (name) => {
    expect(masked(name)).toBe(false);
  });

  it.each([
    "camille.roussel@exemple.fr",
    "ops@melvio.io",
    "rené.rebour@société.museum",
    "vermilot.om@gmail.com",
  ])("still masks the address %s", (addr) => {
    expect(masked(addr)).toBe(true);
  });

  /** The filter must stay a filter: an address whose real TLD happens to spell an
   *  extension-looking word we do not list is still masked. */
  it("fails toward masking on a TLD it does not know", () => {
    expect(masked("someone@company.dev")).toBe(true);
    expect(masked("someone@company.app")).toBe(true);
  });
});
