import type { Client } from "@libsql/client";

/** Map a redaction placeholder/label to a coarse kind (mirrors @openmasq/redact). */
function kindFromLabel(label: string): string {
  const k = label.toLowerCase();
  if (k.includes("email")) return "email";
  if (k.includes("phone")) return "phone";
  if (
    k === "name" ||
    k.includes("firstname") ||
    k.includes("lastname") ||
    k.includes("surname") ||
    k.includes("person") ||
    k.includes("fullname")
  )
    return "name";
  if (
    k.includes("org") ||
    k.includes("company") ||
    k.includes("employer") ||
    k.includes("customer")
  )
    return "company";
  if (k === "number") return "number";
  return "secret";
}

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const PHONE_RE = /^(?:\+|00)\d[\d\s.\-]{6,}\d$|^0\d(?:[\s.\-]?\d{2}){4}$/;

// The fake-data pools (mirror @openmasq/redact) — the swapped-in values come
// from these, so an old fake placeholder can be classified by membership.
const FAKE_FIRST = new Set([
  "Lucas", "Emma", "Hugo", "Léa", "Nathan", "Chloé", "Tom", "Jade",
  "Louis", "Manon", "Paul", "Sarah", "Jules", "Inès", "Adam", "Lina",
]);
const FAKE_LAST = new Set([
  "Martin", "Bernard", "Dubois", "Julien", "Robert", "Petit", "Durand",
  "Leroy", "Moreau", "Simon", "Laurent", "Lefebvre", "Garcia", "Roux",
]);
const FAKE_ORG = new Set([
  "Acme SARL", "Globex", "Initech", "Umbrella Co", "Soylent", "Vandelay",
  "Hooli", "Cyberdyne",
]);
const FAKE_CITY = new Set([
  "Lyon", "Lille", "Nantes", "Bordeaux", "Rennes", "Dijon", "Tours", "Reims",
]);

/** Best-effort kind for an existing redaction with no stored type. */
function classifyRedaction(placeholder: string, value: string): string | null {
  const m = placeholder.match(/^\[REDACTED_(.+)_\d+\]$/);
  if (m) return kindFromLabel(m[1]); // pattern engine — precise
  if (/^n\d+$/.test(placeholder)) return "number";

  // Fake-data engine: the placeholder IS a fake value drawn from known pools.
  const ph = placeholder.trim();
  if (ph.endsWith("@example.com")) return "email";
  if (FAKE_ORG.has(ph)) return "company";
  const parts = ph.split(/\s+/);
  if (parts.length === 2 && FAKE_FIRST.has(parts[0]) && FAKE_LAST.has(parts[1]))
    return "name";
  if (parts.length === 1 && (FAKE_FIRST.has(ph) || FAKE_LAST.has(ph)))
    return "name";
  if (FAKE_CITY.has(ph)) return "secret"; // location → generic bucket

  // Otherwise infer from the original value's shape.
  const v = (value ?? "").trim();
  if (EMAIL_RE.test(v) || EMAIL_RE.test(ph)) return "email";
  if (PHONE_RE.test(v) || PHONE_RE.test(ph)) return "phone";
  return null;
}

/**
 * One-time backfill: stamp a `kind` onto redactions saved before the type column
 * existed, so their highlight colours come back. Idempotent — only touches NULL
 * rows and records itself in schema_migrations so it runs at most once.
 */
export async function backfillRedactionKinds(c: Client): Promise<void> {
  const seen = await c.execute({
    sql: "SELECT 1 FROM schema_migrations WHERE name = ?",
    args: ["0004_backfill_kinds"],
  });
  if (seen.rows.length) return;

  const rows = await c.execute(
    "SELECT conversation_id, placeholder, value FROM redactions WHERE kind IS NULL",
  );
  const stmts: { sql: string; args: any[] }[] = [];
  for (const r of rows.rows as any[]) {
    const kind = classifyRedaction(r.placeholder, r.value ?? "");
    if (kind)
      stmts.push({
        sql: "UPDATE redactions SET kind = ? WHERE conversation_id = ? AND placeholder = ?",
        args: [kind, r.conversation_id, r.placeholder],
      });
  }
  if (stmts.length) await c.batch(stmts, "write");
  await c.execute({
    sql: "INSERT OR IGNORE INTO schema_migrations (name, applied_at) VALUES (?, ?)",
    args: ["0004_backfill_kinds", Date.now()],
  });
  console.log(`[db] backfilled kind on ${stmts.length} redaction(s)`);
}
