import { describe, it, expect } from "vitest";
import { redact, pseudonymize, unredact, type Vault } from "./index";

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
