import { describe, expect, it } from "vitest";
import { timeGreeting } from "./greeting";

describe("timeGreeting", () => {
  it("adapts to the hour", () => {
    expect(timeGreeting(8)).toBe("Bonjour");
    expect(timeGreeting(14)).toBe("Bon après-midi");
    expect(timeGreeting(21)).toBe("Bonsoir");
  });
});
