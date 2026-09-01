import type { Conversation } from "../../types";
import { isPythonFrameworkArtifact } from "../../agent/toolRedactionPolicy";

/**
 * ONE-SHOT repair of conversation vaults polluted BEFORE the run_python framework-keep fix
 * landed: a `run_python` traceback's library names / runtime paths (`scipy`/`numpy`/…, the
 * bundled `site-packages` paths) were mis-detected as PII and written into the reversible
 * `redactionVault` (fake→real) + `redactionKinds` (real→category). Those stale entries then
 * corrupted every later `toWire` pass — the model got `<fake>` instead of `numpy` in its own
 * code, and unrelated tool-call args got redacted.
 *
 * This drops ONLY the entries whose real value {@link isPythonFrameworkArtifact} confirms is
 * a framework token (that predicate is intentionally strict — real name/email/company/path
 * values are never touched). Safe: removing a fake→real pair only affects FUTURE redaction
 * (we WANT to stop faking `numpy`); already-stored display text holds the real values, so no
 * reply is altered. Idempotent — a conversation with nothing to clean is returned by
 * reference, so it re-runs cheaply on every load and effectively fires once. Pure + tested.
 */
export function cleanVaultPollution(convs: Conversation[]): Conversation[] {
  return convs.map((c) => {
    if (!c.redactionVault) return c;
    const kinds = c.redactionKinds ?? {};
    const vault: Record<string, string> = {};
    let removed = 0;
    for (const [fake, real] of Object.entries(c.redactionVault)) {
      if (isPythonFrameworkArtifact(real, kinds[real])) {
        removed++;
        continue;
      }
      vault[fake] = real;
    }
    if (removed === 0) return c; // nothing polluted → same ref (idempotent, no re-render churn)
    const nextKinds: Record<string, string> = {};
    for (const [real, k] of Object.entries(kinds)) {
      if (!isPythonFrameworkArtifact(real, k)) nextKinds[real] = k;
    }
    return { ...c, redactionVault: vault, redactionKinds: nextKinds };
  });
}
