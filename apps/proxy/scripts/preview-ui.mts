// The terminal UI, rendered off a TTY so it can be looked at without starting a proxy:
// `pnpm preview:ui` (dark) or `pnpm preview:ui light`. It draws the same functions the
// running CLI does — the card, four request lines, the reveal lines and the footer — with a
// fixed 92-column width and made-up data, so a change to the look is judged in a second.
import type { RedactionMatch } from "@openmasq/redact";
import { DEFAULTS } from "../src/config/config.js";
import { renderBanner } from "../src/lib/ui/banner.js";
import { footerLines } from "../src/lib/ui/footer.js";
import { KEY_HINTS } from "../src/lib/ui/keys.js";
import { outcomeHex, requestLines, revealLines } from "../src/lib/ui/rows.js";
import { disabledKindsFor } from "../src/lib/masker.js";
import { splashFrame } from "../src/lib/ui/splash.js";
import { createTty } from "../src/lib/ui/tty.js";

const theme = process.argv.includes("light") ? "light" : "dark";
const tty = createTty(true, () => 92, { theme, depth: 24 });

// `pnpm preview:ui splash` prints the opening sequence as still frames — the timing is the
// player's, the composition is what a still shows.
if (process.argv.includes("splash")) {
  // The level decides what the marker covers, so the preview shows the run's own view.
  const level = ["renforce", "strict"].find((l) => process.argv.includes(l)) ?? "standard";
  const view = { level, disabled: disabledKindsFor(level as never, []) };
  for (const t of [0.15, 0.4, 0.7, 1]) {
    process.stdout.write(`${splashFrame(tty, t, 18, view).join("\n")}\n${"─".repeat(92)}\n`);
  }
  process.exit(0);
}
const m = (category: string, value: string, placeholder: string): RedactionMatch =>
  ({ type: category, value, placeholder, category }) as RedactionMatch;

const out: string[] = [""];
out.push(
  ...renderBanner(tty, { ...DEFAULTS, port: 8787 }, { model: "rules", version: "0.1.0" }),
  "",
);
const events = [
  {
    method: "POST",
    path: "/v1/messages",
    family: "anthropic",
    status: 200,
    ms: 812,
    stream: true,
    matches: [
      m("EMAIL", "camille@exemple.fr", "armelle@melvio.com"),
      m("NAME", "Camille Roussel", "Armelle Aubertin"),
      m("NAME", "Léa Fontaine", "Sidonie Berger"),
      m("IBAN", "FR76 3000 4000 0512 3456 7890 143", "FR76 1111 2222 3333 4444 5555 666"),
    ],
  },
  {
    method: "GET",
    path: "/v1/models",
    family: "openai",
    status: 200,
    ms: 41,
    stream: false,
    matches: [],
  },
  {
    method: "TOOL",
    path: "crm__search_contacts",
    family: "mcp",
    status: 200,
    ms: 233,
    stream: false,
    matches: [
      m("NAME", "Camille Roussel", "Armelle Aubertin"),
      m("PHONE", "06 12 34 56 78", "07 98 76 54 32"),
    ],
  },
  {
    method: "POST",
    path: "/v1/chat/completions",
    family: "openai",
    status: 502,
    ms: 5100,
    stream: false,
    matches: [],
  },
];
const hosts: Record<string, string> = {
  anthropic: "api.anthropic.com",
  openai: "api.openai.com",
};
const totals: Record<string, number> = {};
const recent: string[] = [];
for (const e of events) {
  const counts: Record<string, number> = {};
  for (const x of e.matches) {
    const k = x.category as string;
    counts[k] = (counts[k] ?? 0) + 1;
  }
  for (const [k, n] of Object.entries(counts)) totals[k] = (totals[k] ?? 0) + n;
  recent.push(outcomeHex(e as never));
  out.push(
    ...requestLines(tty, e as never, { clock: "12:04:31", counts, upstream: hosts[e.family] }),
  );
}
out.push(...revealLines(tty, events[0].matches as RedactionMatch[]));
out.push("");
out.push(
  ...footerLines(
    tty,
    { requests: events.length, totals, startedAt: 0 },
    { level: "standard", mode: "fake", model: "rules" },
    KEY_HINTS,
    132_000,
    { recent, flash: true },
  ),
);
out.push("");
process.stdout.write(`${out.join("\n")}\n`);
