import { afterEach, describe, expect, it } from "vitest";
import {
  _resetKeysPolicy,
  byoKeysBlockedError,
  isByoKeysBlocked,
  setOrgByoKeysAllowed,
} from "./keysPolicy";

afterEach(() => _resetKeysPolicy());

describe("setOrgByoKeysAllowed", () => {
  it("ne bloque RIEN tant que rien n'a été publié — un compte solo garde ses clés", () => {
    // The renderer publishes after its startup; refusing before that would deprive
    // everyone without an organization of their keys.
    expect(isByoKeysBlocked()).toBe(false);
  });

  it("bloque sur un `false` EXPLICITE, et seulement là", () => {
    setOrgByoKeysAllowed(false);
    expect(isByoKeysBlocked()).toBe(true);
    setOrgByoKeysAllowed(true);
    expect(isByoKeysBlocked()).toBe(false);
  });

  it("efface la politique sur une valeur qui n'est pas un booléen, au lieu de la deviner", () => {
    setOrgByoKeysAllowed(false);
    expect(setOrgByoKeysAllowed("false")).toBeNull(); // a STRING is not a policy
    expect(isByoKeysBlocked()).toBe(false);
    setOrgByoKeysAllowed(false);
    expect(setOrgByoKeysAllowed(undefined)).toBeNull();
    expect(isByoKeysBlocked()).toBe(false);
  });
});

describe("byoKeysBlockedError", () => {
  it("dit la cause et où elle se règle — jamais une panne apparente", () => {
    const msg = byoKeysBlockedError().message;
    expect(msg).toMatch(/organisation/i);
    expect(msg).toMatch(/administrateur/i);
    expect(msg).toMatch(/sans clé/i); // and what still works
  });
});
