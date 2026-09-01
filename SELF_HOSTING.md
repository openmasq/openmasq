# Running OpenMasq without the brand's services

The desktop app is designed to run **entirely on your machine**. Every remote address it
knows is supplied at *build* time through an environment variable, and **an unset variable
means the capability does not exist** — never a silent fallback to something local, and
never a broken screen. A tab that has no service behind it is not shown empty; it is
absent.

This document is the runbook for three situations: building with none of those services,
pointing them at your own, and understanding what each absence costs.

---

## 1. The default: what a build from these sources reaches

A build fills six variables (five services) it was not given, from
`apps/desktop/scripts/publicServices.ts`:

| Variable | Service | Why it is public |
|---|---|---|
| `OPENMASQ_SUPABASE_URL` | Sign-in (magic link / Google) | URL + *publishable* key are client credentials, designed to ship in every client |
| `OPENMASQ_SUPABASE_PUBLISHABLE_KEY` | idem | idem |
| `OPENMASQ_AUTH_URL` | Slack token relay | Slack forbids the code→token exchange on-device |
| `VITE_ANALYTICS_RELAY_URL` | Anonymous counters, release notes, `hide-*` flags | Behind an explicit consent |
| `OPENMASQ_SENTRY_DSN` | Crash reports | A DSN only lets a client *send* to one project |
| `VITE_UPDATES_URL` | The feed a packaged build checks for new versions | Public URL; the artifacts it serves are signed |

**`pnpm dev` applies them too** — a developer's instance runs against the same public
services as an installed app, stamped `env:"development"`. A local stack is an explicit
choice, made in a gitignored `.env.development.local` (`apps/desktop/.env.development`
says how).

> If you fork this project, you probably do **not** want your users' crash reports and
> analytics arriving in someone else's account. Set your own values, or opt out (§3).

---

## 2. Building with no remote service at all

Every variable is optional. Leave them unset and the app is a local-only client:

```bash
pnpm install
pnpm --filter @openmasq/desktop bake     # on-device models — see below
OPENMASQ_AUTH_URL= \
VITE_ANALYTICS_RELAY_URL= \
OPENMASQ_SENTRY_DSN= \
OPENMASQ_SUPABASE_URL= \
OPENMASQ_SUPABASE_PUBLISHABLE_KEY= \
VITE_UPDATES_URL= \
pnpm --filter @openmasq/desktop build
```

An **empty** value is how you opt out: only `undefined` receives a default. Setting a
variable to `""` is a decision the build honours.

What you get: the chat, on-device redaction, documents, MCP connectors on your own OAuth
credentials, the Python sandbox, the agent browser, skills and memory — with your own
provider API keys, a local model (Ollama, LM Studio, vLLM, any OpenAI-compatible
endpoint), or a Claude Code / Codex CLI subscription.

What you lose, each stated where it is decided:

| Unset | Consequence |
|---|---|
| Supabase pair | No accounts, and **no sign-in gate** — the app opens straight into the workspace |
| `OPENMASQ_AUTH_URL` | The Slack connector reads "not configured". GitHub (device flow) and Google (loopback + PKCE) are unaffected: they run on-device |
| `VITE_ANALYTICS_RELAY_URL` | No telemetry; Settings → Versions shows no release notes |
| `OPENMASQ_SENTRY_DSN` | No crash reports |
| `VITE_UPDATES_URL` | No auto-update, and no probing — the app says so rather than asking a stranger's feed. The default is the brand's feed (`https://updates.<domain>`, `publicServices.ts`): a fork sets its own or empties it, so it never updates itself with someone else's signed binary |

### The billing-gated addresses

`OPENMASQ_BACKEND_URL`, `OPENMASQ_GATEWAY_URL` and their `_STAGING` twins — four
variables (`BILLING_GATED_SERVICES`) — are behind a second gate,
`OPENMASQ_BILLING=1` (`apps/desktop/scripts/buildDefines.ts`). **Without it they are baked
empty whatever the build received**, and with them go accounts sync, organizations,
feedback, included models, server-side redaction — and therefore anything sold. That is the
configuration this repository ships.

---

## 3. Pointing the app at your own services

Set the variables at build time. They are *addresses*, never chosen at runtime: a URL
living in a file the user can edit — or that a compromised renderer could write — would be
arbitrary egress from a signed, notarized binary that holds the keychain. The environment
is selected by an enum name, never by a URL (`apps/desktop/src/environments/index.ts`).

```bash
OPENMASQ_SUPABASE_URL=https://<your-project>.supabase.co \
OPENMASQ_SUPABASE_PUBLISHABLE_KEY=<your publishable key> \
OPENMASQ_AUTH_URL=https://auth.example.com \
VITE_ANALYTICS_RELAY_URL=https://analytics.example.com/e \
OPENMASQ_SENTRY_DSN=<your dsn> \
pnpm --filter @openmasq/desktop build
```

Sign-in additionally needs your Supabase project to allow-list the app's deep link,
`<scheme>://auth/callback` (the scheme comes from `packages/branding/branding.json`).

**Connector OAuth** clients are separate and equally optional —
`OPENMASQ_GITHUB_CLIENT_ID`, `OPENMASQ_GOOGLE_CLIENT_ID` / `_SECRET`,
`OPENMASQ_MICROSOFT_CLIENT_ID`, `OPENMASQ_SLACK_CLIENT_ID`. Unset, the matching connector
offers the "bring your own credentials" path instead of the one-click one. Note that
Google's `gmail.readonly` and `drive.readonly` are *restricted* scopes: a one-click flow of
your own needs Google verification and a CASA assessment. Your own client, in testing mode,
needs neither.

---

## 4. On-device models (`pnpm bake`)

`bake` is **not** part of `dev` or `build`. Without it the app runs, but local NER and OCR
are unavailable and **redaction falls back to the deterministic pattern rules** — with no
warning. Anyone working on detection should run it first.

```bash
pnpm --filter @openmasq/desktop bake
```

Every asset is pinned by sha256 (or an immutable commit) and verified at bake time *and*
again before the runtime parses it. A **hash mismatch always fails** — that is the
integrity claim. A **missing source** skips with a warning, except the NER weights, which
fail the bake rather than let a build ship an empty model and silently degrade.

Two assets are first-party exports rather than vendor downloads (docTR, the e5 embedder);
`NOTICE` says which, and `OPENMASQ_DOCTR_SRC` / `OPENMASQ_E5_SRC` point the bake at your
own copy. Without them, OCR falls back to Tesseract and the memory's semantic clustering
falls back to the category graph.

---

## 5. Verifying you got what you expect

```bash
pnpm verify     # the gate suite CI runs
pnpm test       # unit tests, free
```

In the app, **Settings → Versions** reports which services the build actually reached.
Absent ones are named as absent — that is the intended, legible outcome, not an error.
