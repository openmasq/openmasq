import { getMessages } from "@openmasq/i18n";
import { describe, expect, it } from "vitest";
import { timeGreeting } from "./greeting";

const fr = getMessages("fr");

describe("timeGreeting", () => {
  it("adapts to the hour", () => {
    expect(timeGreeting(8, fr)).toBe("Bonjour");
    expect(timeGreeting(14, fr)).toBe("Bon après-midi");
    expect(timeGreeting(21, fr)).toBe("Bonsoir");
  });
});
