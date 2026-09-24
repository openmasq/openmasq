import { describe, expect, it } from "vitest";
import { pathSegmentAliases } from "./pathSegments";

describe("a path segment reverses, but never aliases forward", () => {
  it("finds the segments vaulted beside their path", () => {
    const vault = {
      "/Users/wByRgl/cXQF/p2XgF.txt": "/Users/thomas/echo/notes.txt",
      wByRgl: "thomas",
      cXQF: "echo",
      "p2XgF.txt": "notes.txt",
    };
    expect([...pathSegmentAliases(vault)].sort()).toEqual(["cXQF", "p2XgF.txt", "wByRgl"]);
  });

  it("leaves alone a word that merely OCCURS in a path but was vaulted on its own merits", () => {
    // `Delorme` is a company the detector found in prose; its fake was not minted as part of
    // the path's fake, so the two do not line up and the forward alias stands.
    const vault = {
      "/Users/wByRgl/cXQF/p2XgF.txt": "/Users/thomas/Delorme/notes.txt",
      Vantrix: "Delorme",
    };
    expect(pathSegmentAliases(vault).has("Vantrix")).toBe(false);
  });

  it("says nothing about a labelled token, whose shape vouches for no segment", () => {
    const vault = {
      "[REDACTED_PATH_1]": "/Users/thomas/echo/notes.txt",
      cXQF: "echo",
    };
    expect(pathSegmentAliases(vault).size).toBe(0);
  });

  it("ignores an entry that is itself a path — only bare values are segments", () => {
    const vault = {
      "/a/b": "/x/y",
      "/a": "/x",
    };
    expect(pathSegmentAliases(vault).has("/a")).toBe(false);
  });

  it("is empty on a vault with no path at all", () => {
    expect(pathSegmentAliases({ Vantrix: "Delorme", "marc@x.fr": "jean@y.fr" }).size).toBe(0);
  });

  it("handles Windows separators, and a trailing one", () => {
    const vault = {
      "C:\\Users\\wByRgl\\cXQF\\": "C:\\Users\\thomas\\echo\\",
      wByRgl: "thomas",
      cXQF: "echo",
    };
    expect([...pathSegmentAliases(vault)].sort()).toEqual(["cXQF", "wByRgl"]);
  });
});

describe("what it means for the conversation", () => {
  it("a folder named like a command stops rewriting that command", async () => {
    const { pseudonymize, unredactArgs } = await import("../../index");
    const vault = {};
    // Turn 1: the path is masked and its segments vaulted.
    await pseudonymize("Regarde /Users/thomas/echo/notes.txt", { vault });
    expect(Object.values(vault)).toContain("echo");

    // Turn 2, same vault: the bare word is prose, not a path segment, and must survive.
    const second = await pseudonymize("Puis lance: echo hi ; grep -n TODO", { vault });
    expect(second.text).toContain("echo hi");

    // …and the reverse leg is untouched: a path the model RECOMPOSES still restores,
    // which is the whole reason the segment is vaulted.
    const fake = Object.entries(vault).find(([, v]) => v === "echo")?.[0] as string;
    expect(unredactArgs(`cd /Users/x/${fake} && ls`, vault)).toContain("/echo ");
  });
});
