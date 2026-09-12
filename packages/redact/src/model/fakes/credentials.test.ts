import { describe, expect, it } from "vitest";
import { fakeCredential } from "./credentials";
import { keepBase64Header, wordPrefix } from "./credentialShape";
import { fakeFor } from "./dispatch";

const classes = (s: string) => s.replace(/[a-z]/g, "a").replace(/[A-Z]/g, "A").replace(/[0-9]/g, "9");

describe("a fake credential keeps the format, none of the secret", () => {
  /** One vector per vendor family the rules know: the prefix is what a coding agent acts on. */
  it.each([
    ["Stripe live", "sk_live_4eC39HqLyjWDarjtT1zdp7dc", "sk_live_"],
    ["Stripe webhook", "whsec_5WuPBVtLMYzkN0TX3ORbaqRJXhXzhTAn", "whsec_"],
    ["GitHub PAT", "ghp_16C7e42F292c6912E7710c838347Ae178B4a", "ghp_"],
    ["GitHub fine-grained", "github_pat_11ABCDEFG0Hij4kLMno5pQ_rSTuvWxyZ", "github_pat_"],
    ["GitLab PAT", "glpat-" + "Ab3dEf7Gh9IjKlMnOpQr", "glpat-"],
    ["Slack bot", "xox" + "b-1234567890-0987654321-AbCdEfGhIjKlMnOpQrStUvWx", "xoxb-"],
    ["Google API", "AIzaSyD4eXaMpLe0KeY1234567890abcdefghij", "AIza"],
    ["AWS access key", "AKIAIOSFODNN7EXAMPLE", "AKIA"],
    ["SendGrid", "SG." + "ngeVfQFYQlKU0ufo8x5d1A.TwL2iGABf9DHoTf-09kqeF8tAmbihYzrnopKc-1s5cr", "SG."],
    ["Hugging Face", "hf_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789", "hf_"],
    ["OpenAI", "sk-proj-AbCdEfGh1234567890IjKlMnOpQrStUv", "sk-proj-"],
    ["Bearer", "Bearer sk_live_4eC39HqLyjWDarjtT1zdp7dc", "Bearer sk_live_"],
  ])("%s: keeps %s, redraws the rest in its own classes", (_name, real, prefix) => {
    const fake = fakeCredential(real, 42);
    expect(fake.startsWith(prefix)).toBe(true);
    expect(fake.length).toBe(real.length);
    expect(classes(fake)).toBe(classes(real));
    expect(fake.slice(prefix.length)).not.toBe(real.slice(prefix.length));
  });

  /** The guard that makes prefix-keeping safe: a UUID- or hex-shaped key has no word at its
   *  head, so nothing of it is kept — eight hex characters are eight characters of secret. */
  it("keeps nothing of a key that opens on its secret", () => {
    for (const real of ["a3f9c7d2-1b8e-4056-9f7a-91cd38be0475", "3f7a91cd38be04751a6f2c9d4e8b0a2f", "AAAAB3NzaC1yc2E"]) {
      expect(wordPrefix(real)).toBeLessThanOrEqual(real.startsWith("AAAA") ? 4 : 0);
      const fake = fakeCredential(real, 7);
      expect(fake.length).toBe(real.length);
      expect(fake.slice(4)).not.toBe(real.slice(4));
    }
  });

  it("keeps a JWT's header and redraws its payload and signature", () => {
    const real = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    const [h, p, sig] = real.split(".");
    expect(keepBase64Header(real)).toBe((h as string).length + 1);
    const fake = fakeCredential(real, 3);
    const [fh, fp, fs] = fake.split(".");
    expect(fh).toBe(h);
    expect(fp).not.toBe(p);
    expect(fs).not.toBe(sig);
    expect(fake).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(fake.length).toBe(real.length);
  });

  /** The scheme word is format, and so is what it introduces: a JWT behind `Bearer ` keeps
   *  its header exactly as a bare one does. */
  it("keeps a JWT's header behind a Bearer scheme too", () => {
    const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    const fake = fakeCredential(`Bearer ${jwt}`, 9);
    expect(fake.startsWith(`Bearer ${jwt.split(".")[0]}.`)).toBe(true);
    expect(fake).not.toContain(jwt.split(".")[1] as string);
    expect(fake.length).toBe(`Bearer ${jwt}`.length);
  });

  it("keeps a cookie's names and attributes, redraws only its values", () => {
    const real = "sessionid=k8Jd92LmQ; csrftoken=Zt7pQ2xL; Path=/; SameSite=Lax; HttpOnly";
    const fake = fakeCredential(real, 11, "COOKIE");
    expect(fake).toMatch(/^sessionid=[A-Za-z0-9]{9}; csrftoken=[A-Za-z0-9]{8}; Path=\/; SameSite=Lax; HttpOnly$/);
    expect(fake).not.toContain("k8Jd92LmQ");
    expect(fake).not.toContain("Zt7pQ2xL");
  });

  it("is deterministic for a seed and different across seeds", () => {
    const real = "sk_live_4eC39HqLyjWDarjtT1zdp7dc";
    expect(fakeCredential(real, 5)).toBe(fakeCredential(real, 5));
    expect(fakeCredential(real, 5)).not.toBe(fakeCredential(real, 6));
  });

  /** The dispatcher routes the credential kinds here — and NOT the private key, the BIC or
   *  the MAC, whose scramble is still the right fake. */
  it("is what fakeFor hands out for the key categories", () => {
    const stripe = fakeFor("API_KEY", "sk_live_4eC39HqLyjWDarjtT1zdp7dc", 0);
    expect(stripe.startsWith("sk_live_")).toBe(true);
    const gh = fakeFor("GITHUB_TOKEN", "ghp_16C7e42F292c6912E7710c838347Ae178B4a", 0);
    expect(gh.startsWith("ghp_")).toBe(true);
  });
});

/* A CONNECTION STRING is a credential and belongs to this faker. Routed to the DEFAULT arm
   it met the DIGIT swapper, which redraws `5432` and leaves every letter untouched: the
   user, the host and the alphabetic half of the password travelled verbatim inside their
   own "fake" — and a digitless URI came back through the allocator's pool as an unrelated
   person's name. What is kept is the URI SCHEME, for the same reason a vendor prefix is:
   it names the KIND of endpoint an agent routes on, and it is public. */
describe("a connection string keeps its scheme and nothing else", () => {
  it("redraws the user, the host and the password — not just the digits", () => {
    const real = "postgres://alicewonder:swordfish42@db.corporate.example:5432/proddb";
    const fake = fakeFor("CONNECTION_STRING", real, 0);
    expect(fake.startsWith("postgres://")).toBe(true);
    for (const secret of ["alicewonder", "swordfish", "corporate", "proddb", "5432"])
      expect(fake, `kept ${secret}`).not.toContain(secret);
    // The shape a tool parses survives: user:pass@host:port/db, same lengths.
    expect(fake).toMatch(/^postgres:\/\/\w{11}:\w{11}@\w{2}\.\w{9}\.\w{7}:\d{4}\/\w{6}$/);
    expect(fake).toHaveLength(real.length);
  });

  it("gives a digitless URI a URI — never a name from the fallback pool", () => {
    const fake = fakeFor("CONNECTION_STRING", "https://user:pass@exemple.fr/secret", 0);
    expect(fake).toMatch(/^https:\/\/\w+:\w+@\w+\.\w+\/\w+$/);
  });

  it("keeps a compound scheme whole", () => {
    expect(fakeFor("CONNECTION_STRING", "mongodb+srv://u:p@cluster0.abcd.mongodb.net/db", 0))
      .toMatch(/^mongodb\+srv:\/\//);
  });
});
