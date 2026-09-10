import { describe, expect, it } from "vitest";
import { blockWidth } from "./banner";
import { footerLines } from "./footer";
import { KEY_HINTS } from "./keys";
import { THEME_HEX } from "./palette";
import { createTty } from "./tty";

const dials = { level: "standard", mode: "fake", model: "rules" } as const;
const quiet = { recent: [], flash: false };

describe("the sticky footer", () => {
  it("fills exactly the card's width and carries the dials, the counts and the keys", () => {
    const tty = createTty(true, () => 92, { depth: 24, theme: "dark" });
    const [bar, keys] = footerLines(
      tty,
      { requests: 4, totals: { NAME: 4, EMAIL: 2 }, startedAt: 0 },
      { ...dials },
      KEY_HINTS,
      132_000,
      { recent: ["#5fe3c0", "#fa7a6b"], flash: false },
    );
    expect(tty.width(bar as string)).toBe(blockWidth(tty) + 2); // the card's left margin
    const text = tty.strip(bar as string);
    expect(text).toContain("standard");
    expect(text).toContain("fakes");
    expect(text).toContain("4 req");
    expect(text).toContain("6 masked");
    expect(text).toContain("2 min");
    for (const h of KEY_HINTS) expect(tty.strip(keys as string)).toContain(h.label);
  });

  /** Nothing has happened yet: the bar says so instead of showing a row of zeroes. */
  it("waits out loud before the first request", () => {
    const tty = createTty(false, () => 92);
    const [bar] = footerLines(
      tty,
      { requests: 0, totals: {}, startedAt: 0 },
      { ...dials },
      [],
      0,
      quiet,
    );
    expect(bar).toContain("waiting for the first request");
    expect(bar).not.toContain("0 req");
  });

  /** The masked total is accented for one repaint when it moves — in the brand, which is the
   *  one colour measured against this bar's own ground. Finite: the caller stops asking. */
  it("accents the masked total only while it is fresh", () => {
    const tty = createTty(true, () => 92, { depth: 24, theme: "dark" });
    const brand = THEME_HEX.dark.brand.replace("#", "");
    const rgb = [0, 2, 4].map((i) => Number.parseInt(brand.slice(i, i + 2), 16)).join(";");
    const of = (flash: boolean) =>
      (footerLines(tty, { requests: 1, totals: { NAME: 1 }, startedAt: 0 }, { ...dials }, [], 0, {
        recent: [],
        flash,
      })[0] ?? "") as string;
    expect(of(true)).toContain(`38;2;${rgb}m`);
    expect(of(false)).not.toContain(`38;2;${rgb}m`);
  });
});
