import { describe, it, expect } from "vitest";
import { pseudonymize, redact } from "./index";

// A canned model detector: returns the given findings JSON verbatim.
const model = (json: string) => async () => json;

describe("keep allow-list (connected-integration names)", () => {
  it("pseudonymize never redacts a keep value but still redacts other PII", async () => {
    const complete = model(
      '[{"value":"Stripe","category":"ORG"},{"value":"Jean Morvan","category":"NAME"}]',
    );
    const r = await pseudonymize("Jean Morvan gère Stripe", {
      complete,
      vault: {},
      keep: ["stripe"], // case-insensitive
    });
    expect(r.text).toContain("Stripe"); // allow-listed → kept verbatim
    expect(r.text).not.toContain("Jean Morvan"); // other PII still redacted
  });

  it("un-applies a vault entry whose original is now allow-listed", async () => {
    // "Stripe" was pseudonymised to "FauxCorp" before it was allow-listed.
    const vault = { FauxCorp: "Stripe" };
    const r = await pseudonymize("On utilise Stripe", {
      complete: model("[]"),
      vault,
      keep: ["STRIPE"],
    });
    expect(r.text).toContain("Stripe"); // restored to clear despite the vault entry
    expect(r.text).not.toContain("FauxCorp");
  });

  it("redact (regex): a keep value that a rule would match is left in clear", () => {
    const kept = redact("écris à contact@acme.io", { keep: ["contact@acme.io"] });
    expect(kept.text).toContain("contact@acme.io");
    // control: without keep the same email IS redacted
    const red = redact("écris à contact@acme.io");
    expect(red.text).not.toContain("contact@acme.io");
  });
});
