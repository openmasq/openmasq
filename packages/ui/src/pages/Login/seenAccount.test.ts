import { describe, expect, it } from "vitest";
import { CONV_KEY, SETTINGS_KEY } from "../../state/storePersistence";
import { hasSeenAccountOnDevice } from "./seenAccount";

/** A tiny `Storage` over an array of keys — only `length` + `key(i)` are read. */
const storage = (keys: string[]) => ({ length: keys.length, key: (i: number) => keys[i] ?? null });

describe("hasSeenAccountOnDevice — « revoir » only once an account was really here", () => {
  it("a fresh device (no storage, or an empty one) has seen nobody", () => {
    expect(hasSeenAccountOnDevice(null)).toBe(false);
    expect(hasSeenAccountOnDevice(storage([]))).toBe(false);
  });

  it("the UNSCOPED pre-auth settings blob proves nothing — it exists before any sign-in", () => {
    expect(hasSeenAccountOnDevice(storage([SETTINGS_KEY, "openmasq.theme"]))).toBe(false);
  });

  it("an account-SCOPED key (conversations or settings of a uid) is the trace of a sign-in", () => {
    expect(hasSeenAccountOnDevice(storage([`${CONV_KEY}:user-a`]))).toBe(true);
    expect(hasSeenAccountOnDevice(storage([SETTINGS_KEY, `${SETTINGS_KEY}:user-a`]))).toBe(true);
  });
});
