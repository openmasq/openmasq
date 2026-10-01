import { describe, expect, it } from "vitest";
import { QDRANT_DEFAULT_COLLECTION, parseQdrantConfig } from "./config";

const ok = (env: Record<string, string>) => {
  const r = parseQdrantConfig(env);
  if (!r.ok) throw new Error(r.error);
  return r.config;
};
const refused = (env: Record<string, string>) => {
  const r = parseQdrantConfig(env);
  expect(r.ok).toBe(false);
  return r.ok ? "" : r.error;
};

describe("the Qdrant address — the user's, checked in main", () => {
  it("accepts a local Qdrant over http, marked loopback", () => {
    for (const url of ["http://localhost:6333", "http://127.0.0.1:6333", "http://[::1]:6333"]) {
      const c = ok({ QDRANT_URL: url });
      expect(c.loopback).toBe(true);
      expect(c.collection).toBe(QDRANT_DEFAULT_COLLECTION);
    }
  });

  it("requires https for anything that is not this machine (the key rides every request)", () => {
    expect(refused({ QDRANT_URL: "http://qdrant.example.com:6333" })).toMatch(/https/);
    expect(refused({ QDRANT_URL: "http://192.168.1.20:6333" })).toMatch(/https/);
    const c = ok({ QDRANT_URL: "https://xyz.eu-west-1.aws.cloud.qdrant.io:6333/" });
    expect(c.loopback).toBe(false);
    expect(c.baseUrl).toBe("https://xyz.eu-west-1.aws.cloud.qdrant.io:6333");
  });

  it("refuses credentials, a query or a fragment inside the address", () => {
    expect(refused({ QDRANT_URL: "https://user:pass@q.example.com" })).toMatch(/identifiants/);
    expect(refused({ QDRANT_URL: "https://q.example.com/?api-key=x" })).toMatch(/paramètres/);
    expect(refused({ QDRANT_URL: "not a url" })).toMatch(/invalide/);
    expect(refused({ QDRANT_URL: "file:///etc/passwd" })).toMatch(/https/);
  });

  it("only takes a plain collection name — it becomes a URL path segment", () => {
    expect(ok({ QDRANT_URL: "http://localhost:6333", QDRANT_COLLECTION: "notes_2026-09" }).collection).toBe("notes_2026-09");
    for (const bad of ["../admin", "a/b", "x".repeat(65), "é"]) {
      expect(refused({ QDRANT_URL: "http://localhost:6333", QDRANT_COLLECTION: bad })).toMatch(/collection/);
    }
  });

  it("keeps an empty API key absent rather than sending an empty header", () => {
    expect(ok({ QDRANT_URL: "http://localhost:6333", QDRANT_API_KEY: "  " }).apiKey).toBeUndefined();
    expect(ok({ QDRANT_URL: "http://localhost:6333", QDRANT_API_KEY: "k" }).apiKey).toBe("k");
  });
});
