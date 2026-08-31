import { describe, it, expect, beforeEach, vi } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "./schema";

// The CRUD reads its handle from `./connection` (opened per account by `setDbUser`, which
// needs Electron's `app`). Swap it for a real in-memory libSQL so the round-trip exercises
// the ACTUAL SQL — a shape assertion would not catch a field typed, saved, and with no
// column. `./paths` + `../store/dbCrypto` also reach Electron/keychain, so stub them: blobs
// land in a tmp dir and encryption is a passthrough (we assert on the DB column, not crypto).
let client: Client;
const tmpDir = mkdtempSync(join(tmpdir(), "openmasq-files-test-"));
vi.mock("./connection", () => ({ getClient: () => client }));
vi.mock("./paths", () => ({ filesDir: () => tmpDir }));
vi.mock("../store/dbCrypto", () => ({
  encryptBytes: (b: Uint8Array) => b,
  decryptBytes: (b: Uint8Array) => b,
}));

const { dbSaveFile, dbLoadFile, dbDeleteFile } = await import("./files");

beforeEach(async () => {
  client = createClient({ url: ":memory:" });
  await migrate(client);
});

const base = {
  id: "f1",
  conversationId: "c1",
  name: "cr.pdf",
  mime: "application/pdf",
  redacted: true,
  original: new Uint8Array([1, 2, 3]),
  scrubbed: null,
};

describe("dbSaveFile → dbLoadFile extraction round-trip", () => {
  it("persists the extraction (text + OCR layers) so a re-attach can reuse it", async () => {
    const extraction = { text: "Jean Rebour", ocrText: "Jean Rebour (ocr)", words: [{ text: "Jean" }] };
    await dbSaveFile({ ...base, extraction });
    const loaded = await dbLoadFile("f1");
    expect(loaded!.extraction).toEqual(extraction);
    // the bytes still round-trip (passthrough crypto) alongside the extraction
    expect(Array.from(loaded!.original)).toEqual([1, 2, 3]);
  });

  it("stores NULL for an empty-text extraction — nothing worth reusing", async () => {
    await dbSaveFile({ ...base, id: "f2", extraction: { text: "" } });
    expect((await dbLoadFile("f2"))!.extraction).toBeNull();
  });

  it("la carte de redaction du DÉPÔT survit au round-trip — c'est elle que la Bibliothèque repeint", async () => {
    const redactions = [{ real: "Jean Rebour", fake: "Luc Morvan", tone: "blue", kind: "person" }];
    await dbSaveFile({ ...base, id: "f4", extraction: { text: "Jean Rebour", redactions } });
    expect((await dbLoadFile("f4"))!.extraction).toMatchObject({ redactions });
  });

  it("un scan SANS texte mais AVEC carte est stocké quand même — l'image se repeint aussi", async () => {
    // A redacted image may have no primary text at all; discarding its extraction
    // would discard the Library's only source for painting it.
    const redactions = [{ real: "123 rue X", fake: "9 rue Y", kind: "location" }];
    await dbSaveFile({ ...base, id: "f5", extraction: { text: "", redactions } });
    expect((await dbLoadFile("f5"))!.extraction).toMatchObject({ redactions });
  });

  it("an OLD row with no extraction loads as null → the reattach re-extracts", async () => {
    await dbSaveFile({ ...base, id: "f3" });
    expect((await dbLoadFile("f3"))!.extraction).toBeNull();
  });
});

// A renderer XSS can call the file-store IPC directly with a crafted `id`/stored path.
// These pin the fail-closed floor (safePath.ts): no blob write, read or delete may
// escape the files dir. `filesDir()` is mocked to `tmpDir`; the "outside" files are
// siblings under the OS tmpdir, so they are NOT inside `tmpDir`.
describe("path-traversal defences (renderer-controlled id + stored paths)", () => {
  const outsidePath = (tag: string) =>
    join(tmpdir(), `openmasq-outside-${tag}-${Math.random().toString(36).slice(2)}.txt`);

  it("dbSaveFile rejects a traversal id and writes nothing", async () => {
    await expect(dbSaveFile({ ...base, id: "../../../../etc/pwn" })).rejects.toThrow();
    // the row was never inserted → a later load by that id finds nothing
    expect(await dbLoadFile("../../../../etc/pwn")).toBeNull();
  });

  it("a legit base36 uid round-trips (the id gate doesn't reject real ids)", async () => {
    const id = "k9x2ab3cd1e";
    await dbSaveFile({ ...base, id });
    expect(Array.from((await dbLoadFile(id))!.original)).toEqual([1, 2, 3]);
  });

  it("dbLoadFile refuses a blob path outside the files dir (poisoned/legacy row)", async () => {
    const outside = outsidePath("read");
    writeFileSync(outside, "TOP SECRET");
    await dbSaveFile({ ...base, id: "poison-read" });
    // simulate a row written by an older, pre-validation build: its stored path escapes
    await client.execute({
      sql: "UPDATE files SET original_path = ? WHERE id = ?",
      args: [outside, "poison-read"],
    });
    const loaded = await dbLoadFile("poison-read");
    expect(Array.from(loaded!.original)).toEqual([]); // read refused → empty, NOT the secret
  });

  it("dbDeleteFile never unlinks a path outside the files dir", async () => {
    const outside = outsidePath("delete");
    writeFileSync(outside, "keep me");
    await dbSaveFile({ ...base, id: "poison-del" });
    await client.execute({
      sql: "UPDATE files SET original_path = ? WHERE id = ?",
      args: [outside, "poison-del"],
    });
    await dbDeleteFile("poison-del");
    expect(existsSync(outside)).toBe(true); // arbitrary delete blocked
  });
});
