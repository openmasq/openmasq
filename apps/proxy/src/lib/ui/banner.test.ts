import { describe, expect, it } from "vitest";
import { DEFAULTS } from "../../config/config";
import { envLines } from "../baseUrls";
import { renderBanner } from "./banner";
import { createTty } from "./tty";

const URL = "http://127.0.0.1:8787/console?t=qhvApVk1QcXbL0aLKxkRIA";
const card = (columns: number, reveal = false) =>
  renderBanner(createTty(false, () => columns), DEFAULTS, {
    model: "rules",
    version: "1",
    console: { url: URL, reveal },
    inClear: ["name", "company", "date"],
  }).join("\n");

describe("the start-up card", () => {
  /**
   * ⚠️ The invariant: a string that is USED — an URL to open, an `export` line to paste — is
   * never cut. It takes the label's room, then the frame's, then the space UNDER the card;
   * what it never does is end in an ellipsis, because a cut URL simply does not open. The
   * terminals people run a proxy in are 62 columns as often as 120.
   */
  it("never cuts the console URL or an export line, at any width", () => {
    for (const columns of [120, 92, 80, 62, 50, 44]) {
      const out = card(columns);
      expect(out, `${columns} columns`).toContain(URL);
      for (const line of envLines("http://127.0.0.1:8787"))
        expect(out, `${columns} columns`).toContain(line);
    }
  });

  /** Prose, on the other hand, says less rather than being cut: every row has a form that
   *  fits, down to the two marks alone for the round trip. */
  it("shortens what it can rather than trimming it", () => {
    expect(card(120)).toContain("the model only sees substitutes — the reply comes back real");
    expect(card(62)).toContain("the model only sees substitutes");
    expect(card(62)).not.toContain("comes back real");
    const narrow = card(50);
    expect(narrow).toContain("[masked]");
    expect(narrow).toContain("[restored]");
    // Inside the frame nothing overflows; what has to stay whole sits OUTSIDE it and is left
    // to the terminal to wrap.
    for (const line of narrow.split("\n"))
      if (/^ {2}[│╭╰]/.test(line)) expect(line.length).toBeLessThanOrEqual(50);
  });

  it("opens on the round trip and says what the level leaves in clear", () => {
    const out = card(92);
    expect(out.indexOf("ROUND TRIP")).toBeLessThan(out.indexOf("UPSTREAMS"));
    expect(out).toContain("left in clear: names, companies, dates");
    expect(card(92, true)).toContain("[real values]");
  });
});
