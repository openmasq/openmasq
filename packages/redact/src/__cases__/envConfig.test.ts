import { describe, it, expect } from "vitest";
import { redact, pseudonymize, unredact, type Vault } from "../index";

/* A `.env` / config file read via a filesystem tool must have EVERY value
   redacted before it reaches the model — a bare project id / slug or a URL
   escapes the structured (jwt/api-key) rules, so the value of any UPPER_SNAKE
   assignment is redacted as a secret. Reversible, so the reply is restored. */

const ENV = `VITE_SUPABASE_PROJECT_ID="qitkqmtfoeriysbmqebn"
VITE_SUPABASE_PUBLISHABLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSJ9.9IRgOBPI-fvk55c8A4rJardXOnqKRQu6Y9R2dqrd40I"
VITE_SUPABASE_URL="https://qitkqmtfoeriysbmqebn.supabase.co"`;

describe("env / config assignment values", () => {
  it("redacts the project id, the JWT key and the URL (regex engine)", () => {
    const { text } = redact(ENV);
    expect(text).not.toContain("qitkqmtfoeriysbmqebn"); // slug (also inside the URL)
    expect(text).not.toContain("9IRgOBPI-fvk55c8A4rJardXOnqKRQu6Y9R2dqrd40I"); // JWT sig
    expect(text).not.toContain("supabase.co"); // URL value
    expect(text).toContain("VITE_SUPABASE_URL="); // key names are kept
  });

  it("swaps every value for a fake and restores them (model engine, reversible)", async () => {
    const vault: Vault = {};
    const { text } = await pseudonymize(ENV, { vault });
    expect(text).not.toContain("qitkqmtfoeriysbmqebn");
    expect(text).not.toContain("9IRgOBPI-fvk55c8A4rJardXOnqKRQu6Y9R2dqrd40I");
    expect(unredact(text, vault)).toBe(ENV);
  });

  it("only takes UPPER_SNAKE assignment values — leaves prose and short values", () => {
    expect(redact("parle-moi de NODE_ENV dans mon app").matches).toHaveLength(0);
    expect(redact("PORT=3000").matches).toHaveLength(0); // value too short (< 3)
  });

  it("passes through in clear when the secret category is disabled", () => {
    const { text } = redact(ENV, { disabledKinds: ["secret"] });
    expect(text).toContain("qitkqmtfoeriysbmqebn");
  });
});

describe("a config value that is a loopback URL or a template interpolation is not a secret", () => {
  // At the product's non-Strict levels the `url` category is OFF, so what caught these was
  // the `_URL=` SECRET rule — reproduce that here by disabling `url`, then assert the SECRET
  // rule spares a loopback URL and a `${…}` reference (the Strict `url` rule is a separate,
  // deliberate choice and still masks every URL).
  it("leaves a loopback base-URL and a ${…} reference in clear (code, not a credential)", () => {
    const t = [
      "OPENAI_BASE_URL=http://127.0.0.1:8787/v1",
      "ANTHROPIC_BASE_URL=http://127.0.0.1:8787",
      "GEMINI_BASE_URL=${url}/v1",
    ].join("\n");
    const { text } = redact(t, { disabledKinds: ["url"] });
    expect(text).toBe(t); // nothing masked
  });
  it("still masks a real remote base-URL value and a userinfo/query URL", () => {
    expect(
      redact("OPENAI_BASE_URL=https://api.openai.com/v1", { disabledKinds: ["url"] }).text,
    ).not.toContain("api.openai.com");
    expect(
      redact("HOOK_URL=http://127.0.0.1:8787/cb?token=sk-live-abcdef123456", {
        disabledKinds: ["url"],
      }).text,
    ).not.toContain("sk-live-abcdef123456");
  });
});
