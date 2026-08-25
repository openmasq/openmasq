import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  _resetConfirmationMode,
  getConfirmationMode,
  initConfirmationMode,
  setConfirmationMode,
  setOrgConfirmationFloor,
  getUserConfirmationMode,
} from "./confirmationMode";
import type { WriteConfirmRequest } from "./writeConfirmWindow";

const allow = async () => true as const;

let tmp: string | null = null;
const freshDir = (): string => {
  tmp = mkdtempSync(join(tmpdir(), "openmasq-confirm-mode-"));
  initConfirmationMode(tmp);
  return tmp;
};

afterEach(() => {
  _resetConfirmationMode();
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  tmp = null;
});

describe("confirmationMode (main-owned, persisted)", () => {
  it("defaults to standard — no file, no init", () => {
    expect(getConfirmationMode()).toBe("standard");
    freshDir();
    expect(getConfirmationMode()).toBe("standard");
  });

  it("upgrading to renforce never prompts and persists", async () => {
    const dir = freshDir();
    let asked = 0;
    const spy = async () => {
      asked++;
      return true as const;
    };
    expect(await setConfirmationMode("renforce", spy)).toBe("renforce");
    expect(asked).toBe(0);
    expect(JSON.parse(readFileSync(join(dir, "confirmation-mode.json"), "utf-8")).mode).toBe("renforce");
    // A fresh process (re-init on the same dir) reads the persisted mode back.
    initConfirmationMode(dir);
    expect(getConfirmationMode()).toBe("renforce");
  });

  it("downgrading to standard REQUIRES the un-spoofable window — refuse keeps renforce", async () => {
    freshDir();
    await setConfirmationMode("renforce", allow);
    let req: WriteConfirmRequest | null = null;
    const refusing = async (r: WriteConfirmRequest) => {
      req = r;
      return false as const;
    };
    expect(await setConfirmationMode("standard", refusing)).toBe("renforce");
    expect(req!.mode).toBe("leave-renforce");
    expect(getConfirmationMode()).toBe("renforce");
  });

  it("downgrade approved on the window lands and persists", async () => {
    const dir = freshDir();
    await setConfirmationMode("renforce", allow);
    expect(await setConfirmationMode("standard", allow)).toBe("standard");
    initConfirmationMode(dir);
    expect(getConfirmationMode()).toBe("standard");
  });

  it("a throwing window fails CLOSED (stays renforce)", async () => {
    freshDir();
    await setConfirmationMode("renforce", allow);
    const boom = async () => {
      throw new Error("window gone");
    };
    expect(await setConfirmationMode("standard", boom)).toBe("renforce");
  });

  it("a corrupt persisted file reads as the default", async () => {
    const dir = freshDir();
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(dir, "confirmation-mode.json"), "{not json", "utf-8");
    initConfirmationMode(dir);
    expect(getConfirmationMode()).toBe("standard");
  });

  it("only 'renforce' is accepted from the file — anything else is the default", async () => {
    const dir = freshDir();
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(dir, "confirmation-mode.json"), JSON.stringify({ mode: "off" }), "utf-8");
    initConfirmationMode(dir);
    expect(getConfirmationMode()).toBe("standard");
  });

  it("no-op set (same mode) never prompts", async () => {
    freshDir();
    let asked = 0;
    const spy = async () => {
      asked++;
      return true as const;
    };
    expect(await setConfirmationMode("standard", spy)).toBe("standard");
    expect(asked).toBe(0);
  });
});

describe("org floor — a policy the member cannot defeat", () => {
  it("raises the EFFECTIVE mode without touching the member's own choice", () => {
    freshDir();
    expect(getConfirmationMode()).toBe("standard");
    setOrgConfirmationFloor("renforce");
    expect(getConfirmationMode()).toBe("renforce");
    // Their preference is untouched, so removing the floor restores exactly what they had.
    expect(getUserConfirmationMode()).toBe("standard");
    setOrgConfirmationFloor(null);
    expect(getConfirmationMode()).toBe("standard");
  });

  it("REFUSES a downgrade below the floor — and without opening the window", async () => {
    freshDir();
    setOrgConfirmationFloor("renforce");
    let prompted = false;
    const confirm = async (_r: WriteConfirmRequest) => {
      prompted = true;
      return true as const;
    };
    expect(await setConfirmationMode("standard", confirm)).toBe("renforce");
    // Prompting for something the policy overrides anyway teaches the user to dismiss it.
    expect(prompted).toBe(false);
    expect(getConfirmationMode()).toBe("renforce");
  });

  it("a floor of standard never loosens a member on renforce", async () => {
    freshDir();
    await setConfirmationMode("renforce", allow);
    setOrgConfirmationFloor("standard");
    expect(getConfirmationMode()).toBe("renforce");
  });

  it("an unparseable floor CLEARS it rather than guessing", () => {
    freshDir();
    setOrgConfirmationFloor("renforce");
    setOrgConfirmationFloor("dangerous");
    expect(getConfirmationMode()).toBe("standard");
  });
});
