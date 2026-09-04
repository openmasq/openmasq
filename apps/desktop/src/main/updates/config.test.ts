import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// `config.ts` touches Electron and electron-updater at load time: this test only needs
// to READ the feed address and to load a real `updates.json`, so both are reduced to the
// strict minimum, with a disposable userData.
const USERDATA = mkdtempSync(join(tmpdir(), "openmasq-updates-test-"));
vi.mock("electron", () => ({ app: { getPath: () => USERDATA, isPackaged: false } }));
vi.mock("electron-updater", () => ({ default: { autoUpdater: { setFeedURL: () => {} } } }));

import { DEFAULT_CHANNEL, UPDATES_CONFIGURED, UPDATES_URL, feedBase, loadConfig } from "./config";

describe("le flux de mises à jour", () => {
  it("n'a AUCUN défaut committé — sans adresse fournie au build, il n'y a pas de flux", () => {
    // Updating from someone else's feed means replacing this binary with
    // theirs: a public repo cannot carry this address as a fallback (`config.ts`).
    // The test reads the variable rather than a URL written here — it holds both ways.
    expect(UPDATES_URL).toBe((process.env.VITE_UPDATES_URL || "").replace(/\/+$/, ""));
    expect(UPDATES_CONFIGURED).toBe(!!UPDATES_URL);
  });
});

/* `updates.json` lives in `userData` — a plain, editable file. Its `channel` is
   interpolated into the update feed PATH (`feedBase`), so it decides which manifest this
   SIGNED app asks for its next binary. The IPC path (`channel.ts` `classifyChannelChange`)
   has gated on the allow-list all along; the persisted path took any string that wasn't
   "latest". Same value, another door — rule 7. */
describe("le canal PERSISTÉ passe la même liste blanche que l'IPC", () => {
  const configFile = join(USERDATA, "updates.json");
  const write = (channel: string): void =>
    writeFileSync(configFile, JSON.stringify({ channel, installId: "id-1" }));
  const persistedChannel = (): string =>
    (JSON.parse(readFileSync(configFile, "utf8")) as { channel: string }).channel;

  beforeEach(() => rmSync(configFile, { force: true }));
  afterEach(() => rmSync(configFile, { force: true }));

  it("garde un canal connu", () => {
    write("desktop-beta");
    expect(loadConfig().channel).toBe("desktop-beta");
  });

  it.each([
    ["desktop-evil", "un nom inventé"],
    ["../../evil", "un segment de chemin"],
    ["https://evil.example.com", "une adresse entière"],
    ["latest", "un canal hérité qui ne sert plus rien"],
  ])("retombe sur le canal du build pour %s (%s)", (channel) => {
    write(channel);
    const cfg = loadConfig();
    expect(cfg.channel).toBe(DEFAULT_CHANNEL);
    // …et la valeur refusée est RÉÉCRITE sur le disque, donc elle ne revient pas au prochain lancement.
    expect(persistedChannel()).toBe(DEFAULT_CHANNEL);
  });

  it("le flux ne pointe donc jamais ailleurs que sur un canal connu", () => {
    write("../../../evil");
    expect(feedBase(loadConfig().channel)).toBe(
      `${UPDATES_URL}/desktop/${encodeURIComponent(DEFAULT_CHANNEL)}`,
    );
  });
});
