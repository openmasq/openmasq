import { afterEach, describe, expect, it, vi } from "vitest";

// A launch-only check made the RESTART the unit of update latency — an install that runs
// for days never re-asked the feed, so a server-side rollback couldn't reach it. These pin
// the two halves: the timer re-asks, and the gate refuses a tick that would race an
// in-flight check or churn a build already staged for ShipIt.

const { handlers, updater } = vi.hoisted(() => ({
  handlers: new Map<string, () => void>(),
  updater: {
    autoDownload: true,
    on: (ev: string, fn: () => void) => handlers.set(ev, fn),
    checkForUpdates: vi.fn(async () => undefined as unknown),
  },
}));
vi.mock("electron-updater", () => ({ default: { autoUpdater: updater } }));
vi.mock("./log", () => ({ logUpdate: () => {} }));

import {
  CHECK_INTERVAL_MS,
  ownDownloadPromise,
  shouldCheck,
  startUpdateChecks,
  stopUpdateChecks,
} from "./poll";

const fire = (ev: string): void => handlers.get(ev)?.();
const checks = (): number => updater.checkForUpdates.mock.calls.length;

function start(): void {
  updater.checkForUpdates.mockClear();
  updater.autoDownload = true;
  startUpdateChecks(1000);
}

afterEach(() => {
  stopUpdateChecks();
  vi.useRealTimers();
});

describe("shouldCheck — the gate", () => {
  const gate = { busy: false, downloaded: false };

  // No more PREFERENCE in the gate: the update is always automatic, so
  // only an operation in flight or a build already staged can hold back a tick.
  it("checks when nothing is in flight", () => {
    expect(shouldCheck(gate)).toBe(true);
  });

  it("refuses while a check/download is in flight, and once a build is staged", () => {
    expect(shouldCheck({ ...gate, busy: true })).toBe(false);
    expect(shouldCheck({ ...gate, downloaded: true })).toBe(false);
  });
});

describe("startUpdateChecks", () => {
  it("checks on launch, then again on every interval", () => {
    vi.useFakeTimers();
    start();
    expect(checks()).toBe(1);
    vi.advanceTimersByTime(1000);
    vi.advanceTimersByTime(1000);
    expect(checks()).toBe(3);
  });

  // The counterpart of the removed setting: NOTHING can turn off the loop anymore. Without this test,
  // a gate rewired "just for staging" would slip back in without anything turning red.
  it("continue de vérifier — aucun réglage ne peut plus arrêter la boucle", () => {
    vi.useFakeTimers();
    start();
    updater.checkForUpdates.mockClear();
    vi.advanceTimersByTime(3000);
    expect(checks()).toBe(3);
  });

  it("does not fire a second check while one is in flight", () => {
    vi.useFakeTimers();
    start();
    fire("checking-for-update");
    vi.advanceTimersByTime(2000);
    expect(checks()).toBe(1);
    fire("update-not-available");
    vi.advanceTimersByTime(1000);
    expect(checks()).toBe(2);
  });

  it("frees the gate when a check ERRORS — a failed check must not stop the timer forever", () => {
    vi.useFakeTimers();
    start();
    fire("checking-for-update");
    fire("error");
    vi.advanceTimersByTime(1000);
    expect(checks()).toBe(2);
  });

  it("keeps the gate closed from `available` to `downloaded` while auto-download runs", () => {
    vi.useFakeTimers();
    start();
    fire("checking-for-update");
    fire("update-available");
    vi.advanceTimersByTime(2000);
    expect(checks()).toBe(1);
  });

  it("re-opens after `available` when autoDownload is off — no download will follow", () => {
    vi.useFakeTimers();
    start();
    updater.autoDownload = false;
    fire("checking-for-update");
    fire("update-available");
    vi.advanceTimersByTime(1000);
    expect(checks()).toBe(2);
  });

  // The counterpart of "terminal": a staging that FAILS is no longer terminal. Without this, the device
  // stayed on the old version until the next launch — the reported symptom:
  // "update stuck on some devices" (ditto/lstat on 0.4.1-staging).
  it("ré-ouvre la boucle quand le build posé échoue à s'appliquer", () => {
    vi.useFakeTimers();
    start();
    fire("update-downloaded");
    vi.advanceTimersByTime(5000);
    expect(checks()).toBe(1); // terminal: nothing moves

    fire("error"); // ShipIt/ditto could not apply
    vi.advanceTimersByTime(1000);
    expect(checks()).toBe(2); // the loop is going again, the build will be re-downloaded
  });

  it("stops for good once a build is downloaded — ShipIt has it, re-checking only churns", () => {
    vi.useFakeTimers();
    start();
    fire("update-downloaded");
    vi.advanceTimersByTime(10 * 1000);
    expect(checks()).toBe(1);
  });
});

it("re-checks every 15 min — the delay a rollback takes to reach a running install", () => {
  expect(CHECK_INTERVAL_MS).toBe(15 * 60 * 1000);
});

// A failed update was arriving TWICE in PostHog: the code + context via
// the `error` event, then an anonymous `uncaught/main-rejection`, because electron-updater
// re-throws after emitting the event and nobody holds onto this promise.
describe("ownDownloadPromise", () => {
  it("tient la promesse de téléchargement — aucune rejection ne s'échappe", async () => {
    const rejected = Promise.reject(new Error("ditto: Could not lstat"));
    ownDownloadPromise({ downloadPromise: rejected });
    // If it weren't held, Node would report it as `unhandledRejection` on the next tick.
    await expect(rejected.catch(() => "owned")).resolves.toBe("owned");
  });

  it("supporte un résultat vide (rien à télécharger)", () => {
    expect(() => ownDownloadPromise(undefined)).not.toThrow();
    expect(() => ownDownloadPromise(null)).not.toThrow();
    expect(() => ownDownloadPromise({})).not.toThrow();
  });
});
