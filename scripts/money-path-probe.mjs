// Le PARCOURS D'ARGENT — la sonde de bout en bout que le 07/08 a rendue évidente :
// un change-tier 502 a vécu deux jours sur staging sans qu'aucun test ne conduise
// jamais login → abonnement → change-tier. Cette sonde le conduit chaque nuit,
// contre le VRAI staging, en LECTURE DE FAIT :
//
//   1. connexion au vrai Supabase (grant password du compte de sonde) ;
//   2. GET /subscriptions/me       — auth + résolution d'abonnement ;
//   3. GET /subscriptions/credits  — le chemin crédits (base + période) ;
//   4. POST /subscriptions/change-tier vers le palier COURANT — l'astuce qui rend
//      la sonde inoffensive : le handler traverse auth + base + LECTURE STRIPE
//      (résolution de l'abonnement et de son item facturable — précisément là où
//      le 502 du 07/08 est né) puis ressort `changed:false` sans rien modifier.
//
// Deux issues non-fatales, DITES plutôt qu'avalées : un compte de sonde sans
// abonnement (409 NO_SUBSCRIPTION) ou membre d'une org (409 ORG_BILLING_REQUIRED)
// laissent le chemin Stripe non exercé — la sonde le CRIE en warning, parce qu'une
// sonde qui saute son étape principale en silence est une sonde qui ment.
//
// Env : SUPABASE_URL, SUPABASE_ANON_KEY (variables Terraform), DOMAIN (le domaine
// staging), BYPASS (protection Vercel), EMAIL, PASSWORD (secrets d'opérateur).
// Aucune dépendance — node ≥ 18.

const need = (k) => {
  const v = process.env[k];
  if (!v) {
    console.error(`::error::money-path — variable ${k} absente (Terraform apply ou secret d'opérateur manquant).`);
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

// ── 1. connexion — le vrai GoTrue, le vrai JWKS derrière ─────────────────────────
const auth = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { "Content-Type": "application/json", apikey: ANON },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
const session = await json(auth);
if (!auth.ok || !session?.access_token) {
  console.error(
    `::error::money-path — connexion Supabase refusée (${auth.status}). Compte de sonde absent/désactivé, ou grant password désactivé.`,
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

// ── 3. les crédits ───────────────────────────────────────────────────────────────
const credits = await api("/subscriptions/credits", { token });
if (credits.status !== 200) {
  failures.push(`subscriptions/credits → ${credits.status} (attendu 200)`);
} else {
  console.log("✓ subscriptions/credits");
}

// ── 4. change-tier vers le palier COURANT — le chemin du 502, sans effet ─────────
const tier = me.body?.tier ?? me.body?.subscription?.tier;
if (me.status === 200 && tier && tier !== "free") {
  const ct = await api("/subscriptions/change-tier", { method: "POST", token, body: { tier } });
  if (ct.status === 200 && ct.body?.changed === false) {
    console.log(`✓ change-tier (même palier « ${tier} ») — auth + base + lecture Stripe traversés, changed:false`);
  } else if (ct.status === 200) {
    // changed:true vers le MÊME palier serait un bug serveur — et une sonde qui mute.
    failures.push(`change-tier même-palier a répondu changed:${ct.body?.changed} (attendu false)`);
  } else {
    failures.push(
      `change-tier → ${ct.status} ${ct.body?.code ?? ct.body?.error ?? ""} — le chemin exact du 502 du 07/08`,
    );
  }
} else if (me.status === 200) {
  warnings.push(
    `compte de sonde sans abonnement payant (tier=${tier ?? "?"}) — le chemin Stripe de change-tier n'est PAS exercé. Donner un abonnement (test) au compte de sonde.`,
  );
}

// ── verdict ──────────────────────────────────────────────────────────────────────
for (const w of warnings) console.log(`::warning::money-path — ${w}`);
if (failures.length) {
  for (const f of failures) console.error(`::error::money-path — ${f}`);
  process.exit(1);
}
console.log("Parcours d'argent : tout répond.");
