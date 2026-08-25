import { describe, it, expect } from "vitest";
import type { EgressEntry } from "../../../host";
import { filterEgress, groupEgress, sourceLabel, summarise } from "./egressJournal";

const at = (n: number) => 1_700_000_000_000 + n * 1000;

const rows: EgressEntry[] = [
  { at: at(5), origin: "https://api.stripe.com", source: "connector", verdict: "allowed" },
  { at: at(4), origin: "https://lemonde.fr", source: "browser", verdict: "allowed" },
  { at: at(3), origin: "https://lemonde.fr", source: "browser-favicon", verdict: "allowed" },
  { at: at(2), origin: "http://169.254.169.254", source: "browser", verdict: "refused", reason: "non-public host" },
  { at: at(1), origin: "https://lemonde.fr", source: "browser", verdict: "allowed" },
];

describe("groupEgress", () => {
  it("groups by origin, most recently contacted first", () => {
    expect(groupEgress(rows).map((g) => g.host)).toEqual([
      "api.stripe.com",
      "lemonde.fr",
      "169.254.169.254",
    ]);
  });

  it("counts every contact, not every distinct origin", () => {
    const lemonde = groupEgress(rows).find((g) => g.host === "lemonde.fr")!;
    expect(lemonde.total).toBe(3);
    expect(lemonde.refused).toBe(0);
  });

  it("de-duplicates sources by LABEL — the browser and its favicon fetcher are one origin", () => {
    const lemonde = groupEgress(rows).find((g) => g.host === "lemonde.fr")!;
    expect(lemonde.sources).toEqual(["Navigateur piloté"]);
  });

  it("carries the refusal count and OUR reason, and flags an unencrypted scheme", () => {
    const meta = groupEgress(rows).find((g) => g.host === "169.254.169.254")!;
    expect(meta.refused).toBe(1);
    expect(meta.lastRefusalReason).toBe("non-public host");
    expect(meta.insecure).toBe(true);
  });

  it("does not flag https as insecure", () => {
    expect(groupEgress(rows).find((g) => g.host === "api.stripe.com")!.insecure).toBe(false);
  });

  it("handles an empty journal", () => {
    expect(groupEgress([])).toEqual([]);
    expect(summarise([])).toEqual({ origins: 0, contacts: 0, refused: 0 });
  });
});

describe("summarise", () => {
  it("counts origins, contacts and refusals separately", () => {
    expect(summarise(groupEgress(rows))).toEqual({ origins: 3, contacts: 5, refused: 1 });
  });
});

describe("filterEgress", () => {
  const groups = groupEgress(rows);

  it("matches on host", () => {
    expect(filterEgress(groups, "stripe").map((g) => g.host)).toEqual(["api.stripe.com"]);
  });

  it("matches on the source label the user actually reads", () => {
    expect(filterEgress(groups, "navigateur").map((g) => g.host)).toEqual([
      "lemonde.fr",
      "169.254.169.254",
    ]);
  });

  it("an empty query keeps everything", () => {
    expect(filterEgress(groups, "  ")).toHaveLength(3);
  });
});

describe("sourceLabel", () => {
  it("names the known subsystems in French", () => {
    expect(sourceLabel("link-preview")).toBe("Aperçu de lien");
  });

  it("falls back to the raw source, not to a generic bucket — a new subsystem must still read as itself", () => {
    expect(sourceLabel("some-future-thing")).toBe("some-future-thing");
  });
});
