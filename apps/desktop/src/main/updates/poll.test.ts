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

  // Plus aucune PRÉFÉRENCE dans la porte : la mise à jour est toujours automatique, donc
  // seule une opération en cours ou un build déjà posé peut retenir un tick.
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

  // Le pendant du réglage supprimé : plus RIEN ne peut éteindre la boucle. Sans ce test,
  // une porte rebranchée « juste pour le staging » repasserait sans que rien ne rougisse.
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

  // Le pendant du « terminal » : une pose qui ÉCHOUE ne l'est plus. Sans ça, l'appareil
  // restait sur l'ancienne version jusqu'au prochain lancement — le symptôme rapporté :
  // « mise à jour bloquée sur certains appareils » (ditto/lstat sur 0.4.1-staging).
  it("ré-ouvre la boucle quand le build posé échoue à s'appliquer", () => {
    vi.useFakeTimers();
    start();
    fire("update-downloaded");
    vi.advanceTimersByTime(5000);
    expect(checks()).toBe(1); // terminal : rien ne bouge

    fire("error"); // ShipIt/ditto n'a pas pu appliquer
    vi.advanceTimersByTime(1000);
    expect(checks()).toBe(2); // la boucle est repartie, le build sera re-téléchargé
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

// Une mise à jour qui échoue arrivait DEUX fois dans PostHog : le code + le contexte par
// l'évènement `error`, puis un `uncaught/main-rejection` anonyme, parce qu'electron-updater
// re-jette après avoir émis l'évènement et que personne ne tient cette promesse.
describe("ownDownloadPromise", () => {
  it("tient la promesse de téléchargement — aucune rejection ne s'échappe", async () => {
    const rejected = Promise.reject(new Error("ditto: Could not lstat"));
    ownDownloadPromise({ downloadPromise: rejected });
    // Si elle n'était pas tenue, Node la signalerait en `unhandledRejection` au tick suivant.
    await expect(rejected.catch(() => "owned")).resolves.toBe("owned");
  });

  it("supporte un résultat vide (rien à télécharger)", () => {
    expect(() => ownDownloadPromise(undefined)).not.toThrow();
    expect(() => ownDownloadPromise(null)).not.toThrow();
    expect(() => ownDownloadPromise({})).not.toThrow();
  });
});
