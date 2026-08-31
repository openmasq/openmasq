import { setKeysUser, configuredKeys, setKey, clearKey, importKeys } from "../store/keys";
import { isByoKeysBlocked, byoKeysBlockedError } from "../store/keysPolicy";
import { beginOpenRouterConnect } from "../store/openrouterPkce";
import { handle, str, obj, nullable } from "./handle";

/**
 * Register the WRITE-ONLY provider-API-key IPC. The keys are encrypted at rest in the
 * main process (safeStorage, per-account scope) and NEVER read back by the renderer — it
 * only learns WHICH ids are configured (`keys:configured`), sets/clears/imports values,
 * and re-scopes the store per account (`keys:set-user`, mirrors db/mcp set-user). The key
 * INJECTION into a provider call (`withKey`) + the outgoing-message scrub stay in index.ts;
 * this module is only the setter surface.
 *
 * Arguments are shape-checked at the boundary (`./handle`): the annotations alone are
 * erased at runtime, and this is the surface a renderer XSS would reach for first.
 */
export function registerKeysIpc(): void {
  // Re-scope the encrypted key store to the signed-in account (privacy isolation, mirrors
  // db:set-user / mcp:set-user) — so account B can never use account A's provider keys.
  // `null` is meaningful here (signed out), so nullable rather than optional.
  handle("keys:set-user", [nullable(str)], (_e, uid) => setKeysUser(uid));
  handle("keys:configured", [], () => configuredKeys());
  // ⛔ Managed account: no personal key gets written. The UI already hides the
  // grid, but a renderer XSS would reach this IPC first — rule 7 wants the
  // refusal HERE too. Clearing stays allowed: removing a key can only shrink the surface.
  handle("keys:set", [str, str], (_e, id, value) => {
    if (isByoKeysBlocked()) throw byoKeysBlockedError();
    return setKey(id, value);
  });
  handle("keys:clear", [str], (_e, id) => clearKey(id));
  handle("keys:import", [obj], (_e, map) => {
    if (isByoKeysBlocked()) throw byoKeysBlockedError();
    return importKeys(map as Record<string, string>);
  });
  // « Connecter mon compte OpenRouter » (OAuth PKCE). It belongs on the WRITE-ONLY key
  // surface and not next to the other OAuth flows because it mints a PROVIDER key: the
  // renderer starts it and learns only whether it succeeded — the key is generated,
  // exchanged and stored entirely in main, so unlike the paste path it never crosses
  // this boundary at all (`../store/openrouterPkce.ts`).
  handle("keys:connect-openrouter", [], () => {
    if (isByoKeysBlocked()) throw byoKeysBlockedError();
    return beginOpenRouterConnect();
  });
}
