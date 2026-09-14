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

/* The same file, written as DOCUMENTATION. A README or a `.env.example` is the shape above
   with the values replaced by what the reader must substitute — and masking THAT corrupts
   the instructions while protecting nothing. The bracket is not the guard on its own: a
   placeholder is spared only when removing it leaves nothing a secret could hide in, so a
   real key sitting beside one is still masked. `validators.ts` `isTemplatePlaceholder`. */
describe("a documentation placeholder is not a secret", () => {
  const CLEAN = [
    "export SUPABASE_URL=https://<your-ref>.supabase.co",
    "DATABASE_URL=postgres://<user>:<password>@<host>:5432/<db>",
    "API_KEY=<your-api-key-here>",
    "export TOKEN={{GITHUB_TOKEN}}",
    'password: "<votre mot de passe>"',
    "AWS_SECRET_ACCESS_KEY={{ vault.aws.secret }}",
  ];

  it("leaves the placeholder exactly as written", async () => {
    for (const line of CLEAN) {
      expect(redact(line).text, line).toBe(line);
      expect((await pseudonymize(line, { vault: {} })).text, line).toBe(line);
    }
  });

  it("still masks a real value, and one standing BESIDE a placeholder", async () => {
    const real = "export SUPABASE_URL=https://qitkqmtfoeriysbmqebn.supabase.co";
    expect(redact(real).text).not.toContain("qitkqmtfoeriysbmqebn");
    // The `<region>` is a placeholder; the key next to it is not.
    const mixed = "AWS_ENDPOINT=https://<region>.amazonaws.com/AKIAIOSFODNN7EXAMPLE";
    expect(redact(mixed).text).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });
});

/* A subresource-integrity hash is a PUBLIC checksum, and a `package-lock.json` is made of
   them. `+` and `/` are base64 but not token characters, so an SRI reads as several matches:
   the first carries the `sha512-` prefix and was spared, the rest were renamed — half a
   hash, which fails the browser's check and breaks the build. */
describe("an integrity hash survives whole", () => {
  const LOCK = `    "integrity": "sha512-c7jFQRklXua0mTzneGW9QVyxFjUgwcihC4bXEtujIo2ouWCe1Ajt/amn2PCxYnhYfd5k09JX3SB7OYWFKYqj8Q==",
    "integrity": "sha256-Ab3+xY/zQ1mNHl0w5N+XgL0n3I9PlFUP0THsR8U=",
    "token": "ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5"`;

  /** Where the base64 first uses a `+` or a `/` decides where the rule cuts, so the piece
   *  carrying the `sha512-` prefix can be any length — fifteen characters here. A floor on
   *  it renamed exactly that piece, which is half a hash. */
  it.each([
    "sha512-c7jFQRklXua0mTz+GW9QVyxFjUgwci/C4bXEtujIo2ouWCe1Ajt==",
    "sha512-Ab+cdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUV==",
    "sha384-x/yQ1mNHl0w5N+XgL0n3I9PlFUP0THsR8UabcdefghijklmnopqrstuvwxyzAB",
    "sha1-2jmj7l5rSw0yVb/vlWAYkK/YBwk=",
  ])("keeps %s whole, wherever the base64 breaks it", async (hash) => {
    const line = `  "integrity": "${hash}",`;
    expect(redact(line).text).toBe(line);
    expect((await pseudonymize(line, { vault: {} })).text).toBe(line);
  });

  it("keeps every hash verbatim while the real token beside them is masked", async () => {
    const { text } = await pseudonymize(LOCK, { vault: {} });
    expect(text).toContain(
      "sha512-c7jFQRklXua0mTzneGW9QVyxFjUgwcihC4bXEtujIo2ouWCe1Ajt/amn2PCxYnhYfd5k09JX3SB7OYWFKYqj8Q==",
    );
    expect(text).toContain("sha256-Ab3+xY/zQ1mNHl0w5N+XgL0n3I9PlFUP0THsR8U=");
    expect(text).not.toContain("ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5");
  });
});

/* Configuration written as CODE is full of REFERENCES to secrets, and a reference is the
   opposite of a leak: the whole point of `secret_key = var.scaleway_secret_key` is that the
   secret is NOT in the file. Masking it corrupts the code the model was asked to read — it
   can no longer see which variable feeds which field — and protects nothing.

   Measured on a real Terraform/Scaleway session through the proxy: `var.…`, `local.…`,
   `${…}`, `env("…")` and a bare `SCW_SECRET_KEY` were each replaced, and the tail of a
   sentence (`...)`) came back as a « key » of its own. */
describe("a reference to a secret is not a secret", () => {
  const CLEAN = [
    // Terraform / HCL
    "secret_key = var.scaleway_secret_key",
    "token = local.scw_secret_key",
    "secret_key = data.scaleway_secret.main.value",
    "value = module.vault.secret_key",
    'alltrue([for k, v in local.required_secrets : k if length(v) != ""])',
    // Shell / compose / CI
    "secret_key: ${SCW_SECRET_KEY}",
    "token: ${{ secrets.SCW_SECRET_KEY }}",
    "api_key = $SCW_SECRET_KEY",
    // A call whose ARGUMENT is a name, never a value
    'const k = env("SCW_SECRET_KEY") || env("SCW_TOKEN");',
    'key = os.environ["SCW_SECRET_KEY"]',
    "const k = process.env.SCW_SECRET_KEY;",
    // The NAME of a secret is a label, not the secret
    "SCW_SECRET_KEY",
    "SCW_SECRET_KEY doit être défini côté serveur (voir SCW_ACCESS_KEY=...)",
  ];

  it.each(CLEAN)("leaves %s exactly as written", async (line) => {
    expect(redact(line).text).toBe(line);
    expect((await pseudonymize(line, { vault: {} })).text).toBe(line);
  });

  /** ⚠️ The direction that must not move. A reference is spared because it holds nothing;
   *  a LITERAL beside the same key is still the thing this engine exists for. */
  it.each([
    'password: "Sm7p!Tanc2026#x"',
    "pass: hunter2sekret",
    "mot de passe : Tr0ub4dor&3xx",
    "SCW_SECRET_KEY=8f3c1b2a4d5e6f708192a3b4c5d6e7f8",
    "token = ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5",
    "api_key: sk_live_51H8xKLMNopQRstUV",
    // A reference GLUED to a literal is not a reference: something else is in there.
    'key = "${PREFIX}sk_live_51H8xKLMNopQRstUV"',
  ])("still masks %s", (line) => {
    expect(redact(line).text).not.toBe(line);
  });
});

/* A project names its own helpers, so the reference forms cannot be a list of known ones. */
describe("a function CALL is code, whatever it is called", () => {
  it.each([
    "api_key: resolveGithubToken()",
    'token: env("ANTHROPIC_API_KEY")',
    "secret: loadKey(cfg, 2)",
    "password: os.getenv('X')",
  ])("leaves %s alone", (line) => expect(redact(line).text).toBe(line));

  /** ⚠️ The rules that feed this stop at a comma or a quote, so a call with arguments
   *  arrives BEHEADED — `env(` is four characters from a real session. Only its opening
   *  paren survives, and the callee's shape is what tells it from a password with a paren
   *  in it. */
  it.each(["token: env(", "password: os.getenv(", "api_key: os.getenv('X", "secret: loadKey(cfg"])(
    "leaves the cut call %s alone",
    (line) => expect(redact(line).text).toBe(line),
  );

  it.each([
    "password: hunter2(sekret",
    "password: Tr0ub4dor&3(x",
    "api_key: sk_live_51H8xKLMNopQRstUV",
  ])("still masks %s", (line) => expect(redact(line).text).not.toBe(line));
});

/* A UUID written after a number offers a thirteen-digit run that passes Luhn about one time
   in ten. The match OVERLAPPED the uuid without being contained by it, so de-nesting could
   not arbitrate — and a database row id went out labelled « bank card ». */
describe("a bank card is not found inside an identifier", () => {
  const WITH_UUID = "- 37 47325589-2958-435c-b9bb-7b661e9537e6";

  it("claims no card in a line whose digits belong to a uuid", () => {
    const { matches } = redact(WITH_UUID);
    expect(matches.filter((m) => m.type === "card")).toEqual([]);
  });

  /** …while the uuid itself is still claimed, by the rule that exists for it. */
  it("leaves the identifier rule untouched", () => {
    expect(redact(WITH_UUID).matches.some((m) => m.type === "api_key")).toBe(true);
  });

  it.each(["4111 1111 1111 1111", "4111-1111-1111-1111", "Ma carte : 5555555555554444"])(
    "still finds a real card in %s",
    (line) => {
      expect(redact(line).matches.some((m) => m.type === "card")).toBe(true);
    },
  );
});

/* The last two shapes from that session, both about what a value IS rather than what key
   sat beside it. */
describe("a name is a label, and padding is not a key", () => {
  /** `X_ACCESS_TOKEN` is the NAME of a secret. The engine already refuses to mask `iban` or
   *  `siren` for that reason; a credential is drawn from a random alphabet, so it carries
   *  lowercase, and an all-caps run joined by underscores is how every ecosystem spells a
   *  variable and how none of them spells a key. */
  it.each(["token: X_ACCESS_TOKEN", "api_key = SCW_SECRET_KEY", "password: DB_PASSWORD"])(
    "leaves the variable NAME %s alone",
    (line) => expect(redact(line).text).toBe(line),
  );

  it("still masks an all-caps HEX key, which carries no underscore", () => {
    expect(redact("api_key: ABCDEF0123456789ABCDEF").text).not.toBe(
      "api_key: ABCDEF0123456789ABCDEF",
    );
  });

  /** The generic rule exists for what is « long and high-entropy in a way ordinary text
   *  never is ». Nine zeroes and a letter is the opposite: padding, a placeholder, a column
   *  of a fixture. */
  it.each(["000000000s", 'const pad = "000000000s";', "key: 000000000s"])(
    "leaves the low-entropy run %s alone",
    (line) => expect(redact(line).text).toBe(line),
  );

  it.each(["sk_live_51H8xKLMNopQRstUV", "ghp_A1b2C3d4E5f6G7h8I9j0"])(
    "still masks %s, which draws from a real alphabet",
    (line) => expect(redact(line).text).not.toBe(line),
  );
});
