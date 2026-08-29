// The MONEY PATH — the end-to-end probe one incident made obvious: a 502 on change-tier
// lived two days on staging without any test ever driving login → subscription →
// change-tier. This probe drives it every night, against REAL staging, READ-ONLY IN
// EFFECT:
//
//   1. sign in to the real Supabase (password grant of the probe account);
//   2. GET /subscriptions/me       — auth + subscription resolution;
//   3. GET /subscriptions/credits  — the credits path (database + period);
//   4. POST /subscriptions/change-tier to the CURRENT tier — the trick that makes the
//      probe harmless: the handler crosses auth + database + a STRIPE READ (resolving the
//      subscription and its billable item — precisely where that 502 was born) then comes
//      back `changed:false` without modifying anything.
//
// Two non-fatal outcomes, SAID rather than swallowed: a probe account with no subscription
// (409 NO_SUBSCRIPTION) or one that is an org member (409 ORG_BILLING_REQUIRED) leaves the
// Stripe path unexercised — the probe SHOUTS it as a warning, because a probe that skips
// its main step in silence is a probe that lies.
//
// Env: SUPABASE_URL, SUPABASE_ANON_KEY (Terraform variables), DOMAIN (the staging
// domain), BYPASS (Vercel protection), EMAIL, PASSWORD (operator secrets).
// No dependencies — node ≥ 18.

const need = (k) => {
  const v = process.env[k];
  if (!v) {
    console.error(`::error::money-path — variable ${k} missing (Terraform apply or operator secret absent).`);
    process.exit(1);
  }
  return v;
};

const SUPABASE_URL = need("SUPABASE_URL").replace(/\/$/, "");
const ANON = need("SUPABASE_ANON_KEY");
const DOMAIN = need("DOMAIN");
const EMAIL = need("EMAIL");
const PASSWORD = need("PASSWORD");
const BYPASS = process.env.BYPASS ?? "";

const failures = [];
const warnings = [];

async function json(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function api(path, { method = "GET", token, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (BYPASS) headers["x-vercel-protection-bypass"] = BYPASS;
  const res = await fetch(`https://${DOMAIN}/api-features${path}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await json(res) };
}

// ── 1. sign-in — the real GoTrue, the real JWKS behind it ────────────────────────
const auth = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { "Content-Type": "application/json", apikey: ANON },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
const session = await json(auth);
if (!auth.ok || !session?.access_token) {
  console.error(
    `::error::money-path — Supabase sign-in refused (${auth.status}). Probe account missing/disabled, or the password grant is off.`,
  );
  process.exit(1);
}
const token = session.access_token;
console.log("✓ connexion (grant password)");

// ── 2. l'abonnement ──────────────────────────────────────────────────────────────
const me = await api("/subscriptions/me", { token });
if (me.status !== 200) {
  failures.push(`subscriptions/me → ${me.status} (attendu 200)`);
} else {
  console.log(`✓ subscriptions/me — tier=${me.body?.tier ?? me.body?.subscription?.tier ?? "?"}`);
}

// ── 3. the credits ───────────────────────────────────────────────────────────────
const credits = await api("/subscriptions/credits", { token });
if (credits.status !== 200) {
  failures.push(`subscriptions/credits → ${credits.status} (attendu 200)`);
} else {
  console.log("✓ subscriptions/credits");
}

// ── 4. change-tier to the CURRENT tier — the 502's path, with no effect ──────────
const tier = me.body?.tier ?? me.body?.subscription?.tier;
if (me.status === 200 && tier && tier !== "free") {
  const ct = await api("/subscriptions/change-tier", { method: "POST", token, body: { tier } });
  if (ct.status === 200 && ct.body?.changed === false) {
    console.log(`✓ change-tier (same tier « ${tier} ») — auth + database + Stripe read crossed, changed:false`);
  } else if (ct.status === 200) {
    // changed:true to the SAME tier would be a server bug — and a probe that mutates.
    failures.push(`same-tier change-tier answered changed:${ct.body?.changed} (expected false)`);
  } else {
    failures.push(
      `change-tier → ${ct.status} ${ct.body?.code ?? ct.body?.error ?? ""} — the exact path of that 502`,
    );
  }
} else if (me.status === 200) {
  warnings.push(
    `probe account with no paying subscription (tier=${tier ?? "?"}) — change-tier's Stripe path is NOT exercised. Give the probe account a (test) subscription.`,
  );
}

// ── verdict ──────────────────────────────────────────────────────────────────────
for (const w of warnings) console.log(`::warning::money-path — ${w}`);
if (failures.length) {
  for (const f of failures) console.error(`::error::money-path — ${f}`);
  process.exit(1);
}
console.log("Money path: everything answers.");
