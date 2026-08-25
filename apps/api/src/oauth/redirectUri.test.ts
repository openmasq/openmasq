import { describe, expect, it } from "vitest";
import { isAllowedRedirect, redirectUriMatches } from "./redirectUri.js";

describe("redirect_uri validation", () => {
  it("matches loopback ignoring the port (RFC 8252)", () => {
    expect(redirectUriMatches("http://127.0.0.1:51817/callback", "http://127.0.0.1:0/callback")).toBe(true);
    expect(redirectUriMatches("http://localhost:9999/cb", "http://localhost:1/cb")).toBe(true);
  });

  it("still requires same host + path for loopback", () => {
    expect(redirectUriMatches("http://127.0.0.1:5/evil", "http://127.0.0.1:5/callback")).toBe(false);
    expect(redirectUriMatches("http://127.0.0.1:5/callback", "http://localhost:5/callback")).toBe(false);
  });

  it("rejects an injected query/hash on the loopback redirect", () => {
    expect(redirectUriMatches("http://127.0.0.1:5/callback?x=1", "http://127.0.0.1:0/callback")).toBe(false);
  });

  it("requires exact match for non-loopback URIs", () => {
    expect(redirectUriMatches("https://app.example.com/cb", "https://app.example.com/cb")).toBe(true);
    expect(redirectUriMatches("https://app.example.com/cb?x", "https://app.example.com/cb")).toBe(false);
    expect(redirectUriMatches("https://evil.example.com/cb", "https://app.example.com/cb")).toBe(false);
  });

  it("checks against the full registered list", () => {
    const reg = ["http://127.0.0.1:0/callback", "https://app.example.com/cb"];
    expect(isAllowedRedirect("http://127.0.0.1:42000/callback", reg)).toBe(true);
    expect(isAllowedRedirect("https://app.example.com/cb", reg)).toBe(true);
    expect(isAllowedRedirect("https://evil.example.com/cb", reg)).toBe(false);
  });
});
