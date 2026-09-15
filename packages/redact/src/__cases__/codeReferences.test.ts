import { describe, expect, it } from "vitest";
import { pseudonymize, type Vault } from "../index";

/*
 * A CONFIGURATION MODULE, read through the proxy by a coding agent.
 *
 * Every line here says the same thing: the secret is NOT in this file. `env("X_API_KEY")`,
 * `var.x_access_token`, `process.env.GITHUB_TOKEN` — each names a value kept elsewhere, and
 * masking the NAME buys nothing while costing everything: the model can no longer see which
 * variable feeds which field, in the very file it was asked to read. Measured on a real
 * session, this one module produced nineteen substitutions and not one of them covered a
 * secret.
 *
 * Both halves are pinned, because the gap between them is the whole point:
 *   — a reference, however it is written, is left alone;
 *   — a LITERAL sitting under the same key is still masked.
 */
/* ⚠️ The LEVELS live in `@openmasq/catalog`, which depends on this package — so they are
   named here by the CATEGORY they turn on, never imported. `url` off is every level but
   « Strict »; `url` on is « Strict ». Nothing else in this file depends on a level at all. */
const URL_OFF = ["url"];
const mask = async (text: string, kinds: string[] | undefined = URL_OFF) => {
  const vault: Vault = {};
  const { text: out } = await pseudonymize(text, { vault, disabledKinds: kinds });
  return { out, vault };
};

const ENV_MODULE = `// X : bearer app-only pour lire ; pour écrire, OAuth 1.0a (4 clés) OU OAuth 2.
export const X_BEARER_TOKEN = env("X_BEARER_TOKEN") || env("X_BEARER");
export const X_API_KEY = env("X_API_KEY") || env("X_KEY");
export const X_API_SECRET = env("X_API_SECRET") || env("X_SECRET_KEY") || env("X_KEY_SECRET");
export const X_ACCESS_TOKEN = env("X_ACCESS_TOKEN");
const looksOauth1 = /^\\d+-/.test(env("X_ACCESS_TOKEN"));
export const X_CLIENT_ID = env("X_CLIENT_ID") || env("X_ID_CLIENT") || (looksOauth1 ? "" : env("X_ACCESS_TOKEN"));
function resolveGithubToken(): string {
  return process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "";
}`;

const TERRAFORM_BLOCK = `    ANTHROPIC_API_KEY = var.anthropic_api_key
    BSKY_APP_PASSWORD = var.bsky_app_password
    X_ACCESS_TOKEN    = var.x_access_token
    MASTODON_ACCESS_TOKEN = var.mastodon_access_token`;

describe("a config module written as code", () => {
  it("leaves a whole TypeScript env module untouched", async () => {
    const { out, vault } = await mask(ENV_MODULE);
    expect(out).toBe(ENV_MODULE);
    expect(vault).toEqual({});
  });

  it("leaves a whole Terraform assignment block untouched", async () => {
    const { out, vault } = await mask(TERRAFORM_BLOCK);
    expect(out).toBe(TERRAFORM_BLOCK);
    expect(vault).toEqual({});
  });

  /** The three shapes that each had their own miss, kept apart so a regression names itself. */
  it.each([
    ["a statement's own punctuation", 'export const T = env("X_ACCESS_TOKEN");'],
    ["an expression of alternatives", 'const K = env("X_API_KEY") || env("X_KEY");'],
    [
      "a chained ternary, past the capture's 80-char cap",
      'const ID = env("X_CLIENT_ID") || env("X_ID_CLIENT") || (looksOauth1 ? "" : env("X_ACCESS_TOKEN"));',
    ],
  ])("spares %s", async (_what, line) => {
    const { out } = await mask(line);
    expect(out).toBe(line);
  });

  /** ⚠️ The half that must not move. The gate reads REFERENCES, not the key beside them. */
  it.each([
    ['const K = env("X_API_KEY") || "sk_live_51H8xKLMNopQRstUV";', "sk_live_51H8xKLMNopQRstUV"],
    ["X_API_KEY = 4f9a1c7e0b2d8a6f3e5c9b1d", "4f9a1c7e0b2d8a6f3e5c9b1d"],
    ["BSKY_APP_PASSWORD = hunter2longvalue", "hunter2longvalue"],
  ])("still masks the literal in %s", async (line, secret) => {
    const { out } = await mask(line);
    expect(out).not.toContain(secret);
  });

  /**
   * « bearer » followed by ORDINARY WORDS is prose. The comment above says which auth mode
   * the service takes; masked, it told the model the opposite of what the file says.
   */
  it("reads « bearer app-only » in a comment as prose, and a real bearer token as a token", async () => {
    const prose = "// X : bearer app-only pour lire ; pour écrire, OAuth 1.0a.";
    expect((await mask(prose)).out).toBe(prose);
    const { out } = await mask("Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0");
    expect(out).not.toContain("eyJhbGciOiJIUzI1NiJ9");
  });

  /**
   * The same module with the `url` category ON — what « Strict » does. A level raises what
   * is LOOKED FOR, and that is the only thing it may add here: the references are not a
   * category, they are not a value at all.
   */
  it("adds only the URL category's own work at Strict", async () => {
    const withUrl = `${ENV_MODULE}\nexport const CB = env("X_CALLBACK_URL", "https://openmasq.com");`;
    const { vault } = await mask(withUrl, []);
    expect(Object.values(vault)).toEqual(["https://openmasq.com"]);
    // …and with the category off, even that stays.
    expect((await mask(withUrl)).vault).toEqual({});
  });
});
