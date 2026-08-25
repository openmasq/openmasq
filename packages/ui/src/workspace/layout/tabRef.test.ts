import { describe, it, expect } from "vitest";
import { chatRef, browserRef, artifactRef, tabKind, tabRefId, isChatRef, migrateTabId } from "./tabRef";

describe("tab refs (unified tabs)", () => {
  it("builds + round-trips kind and id", () => {
    expect(chatRef("c1")).toBe("chat:c1");
    expect(browserRef("b1")).toBe("browser:b1");
    expect(artifactRef("a1")).toBe("artifact:a1");
    expect(tabKind("chat:c1")).toBe("chat");
    expect(tabKind("browser:b1")).toBe("browser");
    expect(tabKind("artifact:a1")).toBe("artifact");
    expect(tabRefId("chat:c1")).toBe("c1");
    expect(tabRefId("browser:b1")).toBe("b1");
    expect(isChatRef("chat:c1")).toBe(true);
    expect(isChatRef("browser:b1")).toBe(false);
    expect(isChatRef("artifact:a1")).toBe(false);
  });

  it("treats a BARE id (no prefix) as a legacy chat conv id", () => {
    expect(tabKind("c1")).toBe("chat");
    expect(tabRefId("c1")).toBe("c1");
    expect(isChatRef("c1")).toBe(true);
  });

  it("migrates only bare ids, idempotently", () => {
    expect(migrateTabId("c1")).toBe("chat:c1");
    expect(migrateTabId("chat:c1")).toBe("chat:c1");
    expect(migrateTabId("browser:b1")).toBe("browser:b1");
    expect(migrateTabId("artifact:a1")).toBe("artifact:a1");
  });

  it("preserves a uuid-shaped conv id through a round-trip", () => {
    const uuid = "9f3a1c2b-4d5e";
    expect(tabRefId(chatRef(uuid))).toBe(uuid);
  });
});
