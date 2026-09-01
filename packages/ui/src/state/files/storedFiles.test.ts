import { describe, it, expect, vi } from "vitest";
import { findStoredFile } from "./storedFiles";

const meta = (id: string, name: string, mime = "application/pdf") => ({ id, name, mime });

describe("findStoredFile", () => {
  it("returns the NEWEST row for the name, with the storage id it was found under", async () => {
    const list = vi.fn(async () => [meta("old", "rapport.pdf"), meta("new", "rapport.pdf")]);
    expect(await findStoredFile("rapport.pdf", ["c1"], list)).toEqual({
      meta: meta("new", "rapport.pdf"),
      convId: "c1",
    });
  });

  it("walks BOTH storage ids in order and reports the one that matched", async () => {
    const list = vi.fn(async (cid: string) =>
      cid === "session" ? [meta("f1", "data.xlsx")] : [meta("f0", "autre.pdf")],
    );
    expect(await findStoredFile("data.xlsx", ["conv", "session"], list)).toEqual({
      meta: meta("f1", "data.xlsx"),
      convId: "session",
    });
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("skips blank ids rather than querying them", async () => {
    const list = vi.fn(async () => [meta("f1", "a.pdf")]);
    await findStoredFile("a.pdf", [undefined, null, "", "c1"], list);
    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledWith("c1");
  });

  it("a listing that THROWS is 'not here' — the walk continues to the next id", async () => {
    const list = vi.fn(async (cid: string) => {
      if (cid === "broken") throw new Error("db closed");
      return [meta("f1", "a.pdf")];
    });
    expect(await findStoredFile("a.pdf", ["broken", "c1"], list)).toEqual({
      meta: meta("f1", "a.pdf"),
      convId: "c1",
    });
  });

  it("no DB (browser preview) and no match both resolve to null, never a throw", async () => {
    expect(await findStoredFile("a.pdf", ["c1"], undefined)).toBeNull();
    expect(await findStoredFile("absent.pdf", ["c1"], async () => [meta("f1", "a.pdf")])).toBeNull();
  });
});
