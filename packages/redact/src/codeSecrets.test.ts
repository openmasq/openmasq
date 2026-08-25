import { describe, expect, it } from "vitest";
import { redact, unredact, type Vault } from "./index";

function roundtrip(input: string) {
  const vault: Vault = {};
  const { text } = redact(input, { vault });
  return { text, vault, restored: unredact(text, vault) };
}

describe("code-oriented secret rules", () => {
  it("redacts a Postgres connection string whole (creds included)", () => {
    const uri = "postgres://app:s3cr3tPw@db.internal:5432/prod";
    const { text, restored } = roundtrip(`DB=${uri}`);
    expect(text).not.toContain("s3cr3tPw");
    expect(text).toContain("[REDACTED_CONNECTION_STRING_1]");
    expect(restored).toContain(uri); // reversible
  });

  it("redacts the value of a .env secret assignment, not the key name", () => {
    const { text, restored } = roundtrip("DATABASE_PASSWORD=hunter2longvalue");
    expect(text).toContain("DATABASE_PASSWORD=");
    expect(text).not.toContain("hunter2longvalue");
    expect(restored).toBe("DATABASE_PASSWORD=hunter2longvalue");
  });

  it("redacts a JSON secret value", () => {
    const { text } = roundtrip('{"api_key": "abcdef123456ghijkl"}');
    expect(text).not.toContain("abcdef123456ghijkl");
    expect(text).toContain('"api_key": "[REDACTED_');
  });

  it("does not redact a non-secret assignment", () => {
    const { text } = roundtrip("LOG_LEVEL=debug");
    expect(text).toBe("LOG_LEVEL=debug");
  });
});
