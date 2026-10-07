import { beforeEach, describe, expect, it } from "vitest";
import { __resetSessionForTests, IDLE_MS, sessionIdFor, uuidv7 } from "./session";

describe("analytics session — `$session_id`", () => {
  beforeEach(() => __resetSessionForTests());

  it("one id while the user keeps acting, a new one after the idle gap", () => {
    const a = sessionIdFor("app_open", 0);
    expect(sessionIdFor("send_message", IDLE_MS)).toBe(a); // activity refreshes the window
    expect(sessionIdFor("new_chat", 2 * IDLE_MS)).toBe(a);
    expect(sessionIdFor("send_message", 3 * IDLE_MS + 1)).not.toBe(a);
  });

  it("the update funnel carries no session and keeps none alive", () => {
    const a = sessionIdFor("app_open", 0);
    expect(sessionIdFor("update_check", IDLE_MS / 2)).toBeUndefined();
    expect(sessionIdFor("update_check", IDLE_MS)).toBeUndefined();
    expect(sessionIdFor("send_message", IDLE_MS + 1)).not.toBe(a); // the checks did not refresh it
  });

  it("is a time-ordered UUIDv7 carrying its creation ms", () => {
    const now = Date.UTC(2026, 9, 7, 8, 0, 0);
    const id = uuidv7(now);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(parseInt(id.replace(/-/g, "").slice(0, 12), 16)).toBe(now);
  });
});
