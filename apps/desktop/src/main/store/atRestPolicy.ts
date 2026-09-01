/**
 * One policy for what happens when the OS keychain cannot protect a secret at rest.
 *
 * The default is availability: a machine with no keyring (a Linux desktop without
 * libsecret/kwallet) still opens its own chats rather than locking the user out, and
 * `atRestWarning.ts` says so on screen. That trade is deliberate and stays.
 *
 * What was NOT deliberate is that `OPENMASQ_REQUIRE_DB_ENCRYPTION=1` — the switch whose
 * whole purpose is to refuse plaintext persistence — was honoured by `dbCrypto` alone.
 * The provider API keys, the connector OAuth tokens, the sync passphrase and the device
 * secret went on falling back to base64 with a `console.warn`, so the switch protected the
 * conversation store while the credentials that reach every connected account, and the
 * passphrase that decrypts every other device, kept being written in the clear beside it.
 * A flag that means "encrypted at rest" has to mean it for everything at rest.
 *
 * So: same default, one implementation, and when the operator asks for strict mode every
 * store refuses rather than degrades. Refusing is the point — a caller that cannot write a
 * secret must fail where it happens, not persist a readable one and report success.
 */

/** True when the operator has asked that nothing be persisted unencrypted. */
export function strictAtRest(): boolean {
  return process.env.OPENMASQ_REQUIRE_DB_ENCRYPTION === "1";
}

/**
 * Called on the write path when the keychain is unavailable. Throws in strict mode;
 * returns in the default one, where the caller then writes its documented fallback.
 */
export function assertPlaintextAllowed(what: string): void {
  if (!strictAtRest()) return;
  throw new Error(
    `${what}: at-rest encryption is required (OPENMASQ_REQUIRE_DB_ENCRYPTION=1) but the OS ` +
      "keychain is unavailable — refusing to persist it in cleartext.",
  );
}
