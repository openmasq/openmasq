import { describe, expect, it } from "vitest";
import { renderJoinCard } from "./joinCard";
import { createTty } from "./tty";

const running = {
  version: "0.1.0",
  model: false,
  level: "standard",
  disabled: ["name", "company", "address", "city", "username"],
  console: true,
};
const LINK = "http://127.0.0.1:8787/console?t=J4JYXzkIDj2v-p7mRF5p9g";

describe("the join card", () => {
  it("is the start-up card's lockup and frame, with the joiner's own rows", () => {
    const tty = createTty(true, () => 100, { theme: "dark", depth: 24 });
    const lines = renderJoinCard(tty, {
      url: "http://127.0.0.1:8787",
      running,
      session: "claude-a5cb",
      tool: "claude",
      link: LINK,
    });
    const plain = lines.map((l) => tty.strip(l)).join("\n");
    expect(plain).toContain("OpenMasq proxy"); // the lockup
    expect(plain).toContain("JOINED"); // the frame's title
    expect(plain).toMatch(/PROXY\s+http:\/\/127\.0\.0\.1:8787 · v0\.1\.0 · already running/);
    expect(plain).toMatch(/MASKING\s+standard/);
    expect(plain).toContain("left in clear:");
    expect(plain).toMatch(/SESSION\s+claude-a5cb/);
    expect(plain).toMatch(
      /LIVE VIEW\s+http:\/\/127\.0\.0\.1:8787\/console\?t=J4JYXzkIDj2v-p7mRF5p9g/,
    );
    // Nothing is wider than the terminal.
    for (const l of lines) expect(tty.width(l)).toBeLessThanOrEqual(100);
  });

  it("never cuts the live view: too wide for the row, it goes under the card, whole", () => {
    const tty = createTty(true, () => 62, { theme: "light", depth: 24 });
    const lines = renderJoinCard(tty, {
      url: "http://127.0.0.1:8787",
      running,
      session: "claude-a5cb",
      tool: "claude",
      link: LINK,
    });
    const plain = lines.map((l) => tty.strip(l));
    expect(plain.some((l) => l.trim() === LINK)).toBe(true);
    expect(plain.join("\n")).toMatch(/LIVE VIEW\s+below/);
  });

  it("names the command when no link was published, and says which flags a join ignores", () => {
    const tty = createTty(false, () => 100);
    const plain = renderJoinCard(tty, {
      url: "http://127.0.0.1:8787",
      running: { version: "0.0.9", model: true },
      session: "hermes-1a2b",
      tool: "hermes",
      ignored: ["--reveal"],
    }).join("\n");
    // An older build (no `pid`, no `console` on its /healthz) published no link: say so.
    expect(plain).toContain("none published — that proxy is an older build");
    expect(plain).toContain("--reveal ignored");
    // …and a current build says how to stop it, by pid.
    const current = renderJoinCard(tty, {
      url: "http://127.0.0.1:8787",
      running: { version: "0.1.0", model: false, console: false, pid: 4242 },
      session: "claude-1a2b",
      tool: "claude",
      ignored: ["--open"],
    }).join("\n");
    expect(current).toContain("none — that proxy runs without --console");
    expect(current).toContain("--open ignored");
    expect(current).toContain("kill 4242, then re-run");
    expect(plain).not.toContain("left in clear"); // an older proxy claims nothing it did not say
  });
});
