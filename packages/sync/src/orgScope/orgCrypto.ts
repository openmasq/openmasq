/**
 * ORG-SCOPE crypto — E2E encryption TO SEVERAL MEMBERS, without ever sharing a
 * passphrase. Everything is WebCrypto (`crypto.subtle`), same runtimes as
 * `../crypto.ts`.
 *
 * Two tiers, mirroring the personal channel's KEK/DEK split:
 *
 *  1. Each member holds an **ECDH P-256 keypair**. The private half only ever
 *     exists in clear on the member's devices: it is wrapped (AES-GCM) under
 *     the member's own passphrase KEK — the same KEK as their conv envelopes —
 *     and stored server-side so the keypair follows their devices. A
 *     passphrase change re-wraps the small envelope, never regenerates keys.
 *  2. Each SHARE has a random **DEK**, wrapped ONCE PER AUDIENCE MEMBER to
 *     their public key, ECIES-style: ephemeral ECDH keypair → shared secret →
 *     HKDF (salted, info = the slot's CONTEXT string) → AES-GCM over the raw
 *     DEK, with the same context as AAD. The context
 *     (`<slug>-org:<org>:<scope>:<share>:v<n>`) binds an envelope to its exact
 *     slot — the server cannot replay it into another org/scope/share/version
 *     without failing the tag.
 *
 * Membership changes: ADMIT = wrap the current DEK to the new member's public
 * key (any member holding the DEK can — the server never can, that is the
 * point). REMOVE = ROTATE (mint version n+1, wrap to the remaining members):
 * deleting the leaver's envelope alone would be theatre, they may have kept a
 * copy. Documented residual: what a member already READ while admitted is
 * theirs — no cryptography reclaims cleartext someone has seen.
 *
 * ⚠️ TRUST RESIDUAL (documented, not silently accepted): public keys are
 * distributed BY THE SERVER. A compromised backend could substitute its own
 * public key and be wrapped a DEK. Mitigation is out-of-band fingerprint
 * verification / admin-signed member keys — follow-up work; until then the
 * RBAC + device gates are the enforcement and this line is the honesty.
 */
import { brandKey } from "@openmasq/branding";
import { fromB64, kekFor, randomBytes, subtle, toB64 } from "../crypto";
import type { MemberKeyEnvelope, OrgKeyEnvelope, OrgScope } from "./orgTypes";

const enc = new TextEncoder();
const SALT_BYTES = 16;
const IV_BYTES = 12;
const EC = { name: "ECDH", namedCurve: "P-256" } as const;

/** The context string binding an envelope to its exact slot — org, scope,
 *  SHARE and version (HKDF info AND GCM AAD). One home — the client and the
 *  tests derive it from here only. */
export const orgKeyContext = (
  orgUuid: string,
  scope: OrgScope,
  shareUuid: string,
  keyVersion: number,
): string => `${brandKey("org")}:${orgUuid}:${scope}:${shareUuid}:v${keyVersion}`;

/** The conv-id under which a SHARE's records are AAD-bound (reuses
 *  `encryptRecord`'s (convId, recordId) binding — the server cannot swap blobs
 *  across orgs, scopes or shares). Version is NOT in here: records carry
 *  `keyVersion` separately. */
export const orgRecordConvId = (orgUuid: string, scope: OrgScope, shareUuid: string): string =>
  `org:${orgUuid}:${scope}:${shareUuid}`;

const importPub = (publicJwk: string): Promise<CryptoKey> =>
  subtle().importKey("jwk", JSON.parse(publicJwk) as JsonWebKey, EC, false, []);

/** Mint this account's member keypair and wrap the private half under the
 *  passphrase KEK. Returns the server-safe envelope + the live private key. */
export async function createMemberKey(
  passphrase: string,
): Promise<{ envelope: MemberKeyEnvelope; privateKey: CryptoKey }> {
  const pair = (await subtle().generateKey(EC, true, ["deriveBits"])) as CryptoKeyPair;
  const publicJwk = JSON.stringify(await subtle().exportKey("jwk", pair.publicKey));
  const pkcs8 = new Uint8Array(await subtle().exportKey("pkcs8", pair.privateKey));
  const kekSalt = toB64(randomBytes(SALT_BYTES));
  const privIv = randomBytes(IV_BYTES);
  const kek = await kekFor(passphrase, kekSalt);
  const wrappedPrivate = await subtle().encrypt(
    { name: "AES-GCM", iv: privIv as BufferSource },
    kek,
    pkcs8 as BufferSource,
  );
  pkcs8.fill(0);
  return {
    envelope: {
      publicJwk,
      kekSalt,
      privIv: toB64(privIv),
      wrappedPrivate: toB64(wrappedPrivate),
      v: 1,
    },
    privateKey: pair.privateKey,
  };
}

/** Unwrap my private key from its envelope. Throws on a wrong passphrase /
 *  tampered envelope (GCM auth) — callers treat a throw as "org sync degrades
 *  to unavailable", never as loss. */
export async function openMemberKey(
  envelope: MemberKeyEnvelope,
  passphrase: string,
): Promise<CryptoKey> {
  const kek = await kekFor(passphrase, envelope.kekSalt);
  const pkcs8 = await subtle().decrypt(
    { name: "AES-GCM", iv: fromB64(envelope.privIv) as BufferSource },
    kek,
    fromB64(envelope.wrappedPrivate) as BufferSource,
  );
  return subtle().importKey("pkcs8", pkcs8, EC, false, ["deriveBits"]);
}

/** Passphrase change: re-wrap the SAME private key under the new passphrase.
 *  The keypair (and every org envelope wrapped to it) is untouched. */
export async function rewrapMemberKey(
  envelope: MemberKeyEnvelope,
  oldPassphrase: string,
  newPassphrase: string,
): Promise<MemberKeyEnvelope> {
  const oldKek = await kekFor(oldPassphrase, envelope.kekSalt);
  const pkcs8 = new Uint8Array(
    await subtle().decrypt(
      { name: "AES-GCM", iv: fromB64(envelope.privIv) as BufferSource },
      oldKek,
      fromB64(envelope.wrappedPrivate) as BufferSource,
    ),
  );
  const kekSalt = toB64(randomBytes(SALT_BYTES));
  const privIv = randomBytes(IV_BYTES);
  const newKek = await kekFor(newPassphrase, kekSalt);
  const wrappedPrivate = await subtle().encrypt(
    { name: "AES-GCM", iv: privIv as BufferSource },
    newKek,
    pkcs8 as BufferSource,
  );
  pkcs8.fill(0);
  return {
    publicJwk: envelope.publicJwk,
    kekSalt,
    privIv: toB64(privIv),
    wrappedPrivate: toB64(wrappedPrivate),
    v: 1,
  };
}

/** Mint a fresh raw DEK for a share's key version. The RAW bytes are returned
 *  because wrapping to members needs them; callers zero them when the wrapping
 *  round is done. */
export const mintOrgDek = (): Uint8Array => randomBytes(32);

export const importOrgDek = (raw: Uint8Array): Promise<CryptoKey> =>
  subtle().importKey("raw", raw as BufferSource, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);

/** ECIES key-agreement half shared by wrap and unwrap: ECDH(shared) → HKDF
 *  (salt + context info) → one-use AES-GCM key. */
async function deriveWrapKey(
  privateKey: CryptoKey,
  publicKey: CryptoKey,
  salt: Uint8Array,
  context: string,
): Promise<CryptoKey> {
  const shared = await subtle().deriveBits({ name: "ECDH", public: publicKey }, privateKey, 256);
  const hkdfKey = await subtle().importKey("raw", shared, "HKDF", false, ["deriveKey"]);
  return subtle().deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: salt as BufferSource,
      info: enc.encode(context) as BufferSource,
    },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Wrap a raw DEK to ONE member's public key, bound to its slot context. */
export async function wrapOrgDek(
  dekRaw: Uint8Array,
  memberPublicJwk: string,
  orgUuid: string,
  scope: OrgScope,
  shareUuid: string,
  keyVersion: number,
): Promise<OrgKeyEnvelope> {
  const context = orgKeyContext(orgUuid, scope, shareUuid, keyVersion);
  const eph = (await subtle().generateKey(EC, true, ["deriveBits"])) as CryptoKeyPair;
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = await deriveWrapKey(eph.privateKey, await importPub(memberPublicJwk), salt, context);
  const wrappedDek = await subtle().encrypt(
    { name: "AES-GCM", iv: iv as BufferSource, additionalData: enc.encode(context) as BufferSource },
    key,
    dekRaw as BufferSource,
  );
  const ephPub = new Uint8Array(await subtle().exportKey("raw", eph.publicKey));
  return {
    ephPub: toB64(ephPub),
    salt: toB64(salt),
    iv: toB64(iv),
    wrappedDek: toB64(wrappedDek),
    keyVersion,
    v: 1,
  };
}

/** Unwrap an org DEK with my private key. Throws on tamper / wrong slot (the
 *  context is in the HKDF info AND the GCM AAD) / a key that was never wrapped
 *  to me — callers seal the scope, never merge unverified data. */
export async function openOrgDek(
  envelope: OrgKeyEnvelope,
  privateKey: CryptoKey,
  orgUuid: string,
  scope: OrgScope,
  shareUuid: string,
): Promise<{ raw: Uint8Array; dek: CryptoKey }> {
  const context = orgKeyContext(orgUuid, scope, shareUuid, envelope.keyVersion);
  const ephPub = await subtle().importKey("raw", fromB64(envelope.ephPub) as BufferSource, EC, false, []);
  const key = await deriveWrapKey(privateKey, ephPub, fromB64(envelope.salt), context);
  const raw = new Uint8Array(
    await subtle().decrypt(
      {
        name: "AES-GCM",
        iv: fromB64(envelope.iv) as BufferSource,
        additionalData: enc.encode(context) as BufferSource,
      },
      key,
      fromB64(envelope.wrappedDek) as BufferSource,
    ),
  );
  return { raw, dek: await importOrgDek(raw) };
}
