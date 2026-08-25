import { wireSegments } from "@openmasq/redact";
import { pushDebug } from "./debug";

/**
 * Debug-mode console tracing of the EXACT text sent to the model (the redacted
 * "wire" form), with every redacted token highlighted in its category colour via
 * the devtools `%c` styling. Gated behind Settings → debug mode; renderer console
 * only. This is the honest view of what actually leaves the machine.
 *
 * Séparé de `debug.ts` (l'anneau du journal) : ceci est le RENDU console d'une entrée
 * wire, pas la mécanique du tampon — et c'est ce qui garde chacun sous le cap de 300.
 */

/**
 * Hue → console background hex. A LITERAL copy of the palette on purpose: the devtools
 * console has no stylesheet, so `%c` styling cannot reference `--hl-*`. It is the one thing
 * rule 9 allows a second copy for — and the copy is pinned, not trusted:
 * `styles/palette.parity.test.ts` reads these against `styles.css` and fails on a drift.
 */
const TONE_HEX: Record<string, string> = {
  violet: "#b79cff",
  sky: "#6fc2ff",
  mint: "#5fe3c0",
  teal: "#7ad9e0",
  amber: "#ffb85c",
  gold: "#ffdc7a",
  pink: "#ff8fa3",
  slate: "#b3c2da",
  red: "#fa7a6b",
};

const BADGE = "background:#18280c;color:#c7f08a;border-radius:4px;padding:1px 6px;font-weight:700";

export interface WireLog {
  /** Model id the message is being sent to. */
  model: string;
  /** The redacted wire text (placeholders / fake values). */
  text: string;
  /** placeholder/fake → original. */
  vault?: Record<string, string>;
  /** original value → kind, for per-type colours. */
  kinds?: Record<string, string>;
  /** Conversation this send belongs to — scopes the entry in the per-conversation log. */
  convId?: string;
}

/** Push a `wire` entry to the in-app log — TOUJOURS (la collecte est permanente) — and
 *  trace the wire message to the console ONLY under `toConsole` (le réglage « Journal
 *  technique détaillé ») : un console.log du texte redacted chez tout le monde serait
 *  du bruit, la capture ne doit pas l'entraîner. Returns the entry id so the caller can
 *  patch its token cost once the model replies (via `updateDebug`); "" when capture is off. */
export function logWireMessage(opts: WireLog, { toConsole = false } = {}): string {
  if (!toConsole) {
    return pushDebug(
      { type: "wire", model: opts.model, text: opts.text, vault: opts.vault, kinds: opts.kinds },
      opts.convId,
    );
  }
  const segs = wireSegments(opts.text, opts.vault ?? {}, opts.kinds);
  // `%` in the text would be read as a console directive — escape to `%%`.
  let fmt = `%c redact → ${opts.model.replace(/%/g, "%%")} %c\n`;
  const styles: string[] = [BADGE, ""];
  for (const s of segs) {
    const safe = s.value.replace(/%/g, "%%");
    if (s.kind === "redaction") {
      fmt += `%c${safe}%c`;
      styles.push(
        `background:${TONE_HEX[s.tone ?? ""] ?? "#ffb85c"};color:#18230d;border-radius:3px;padding:0 3px;font-weight:600`,
        "",
      );
    } else {
      fmt += safe;
    }
  }
  // Intentional: this IS the debug feature, behind the debugLog flag.
  // eslint-disable-next-line no-console
  console.log(fmt, ...styles);
  return pushDebug(
    {
      type: "wire",
      model: opts.model,
      text: opts.text,
      vault: opts.vault,
      kinds: opts.kinds,
    },
    opts.convId,
  );
}
