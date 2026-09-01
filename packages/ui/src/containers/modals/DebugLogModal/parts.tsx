import { useState } from "react";
import { wireSegments } from "@openmasq/redact";
import { CheckIcon, CopyIcon } from "../../../components/brand";
import type { DebugEntry, DebugPair } from "../../../state/debug";
import {
  entryToText,
  pairsOf,
  tagLabel,
  time,
  toolPairsOf,
  turnPairsOf,
  turnSummary,
  wireTokenSummary,
  type PhaseEntry,
  type ToolEntry,
  type TurnEntry,
  type WireEntry,
} from "./entryText";

import { useT } from "../../../i18n";
/** Render text with redacted tokens highlighted — shared by wire + tool entries.
 *  Each mark carries `data-real`/`data-fake`/`data-kind`/`data-tone` so the shared
 *  `RedactionInlineReveal` (mounted over the log body) hover-reveals the ORIGINAL
 *  value + its type, exactly like the chat bubbles. Here the mark shows the WIRE
 *  fake (what left the machine); the strip shows the real value it maps back to. */
function Highlighted({
  text,
  vault,
  kinds,
}: {
  text: string;
  vault?: Record<string, string>;
  kinds?: Record<string, string>;
}) {
  const v = vault ?? {};
  return (
    <>
      {wireSegments(text, v, kinds).map((s, i) =>
        s.kind === "text" ? (
          <span key={i}>{s.value}</span>
        ) : (
          <mark
            key={i}
            className={`redaction-mark hl-${s.tone}`}
            data-real={v[s.value] ?? ""}
            data-fake={s.value}
            data-kind={s.label ?? "sensitive"}
            data-tone={s.tone ?? "slate"}
          >
            {s.value}
          </mark>
        ),
      )}
    </>
  );
}

/** The redacted ↔ original mapping, 2-by-2, colour-coded by category. */
function PairsList({ pairs }: { pairs: DebugPair[] }) {
  if (!pairs.length) return null;
  return (
    <div className="dbg-pairs">
      {pairs.map((p, i) => (
        <div className="dbg-pair" key={i}>
          <mark className={`redaction-mark hl-${p.tone ?? "amber"}`}>{p.token}</mark>
          <span className="dbg-pair-arrow">→</span>
          <span className="dbg-pair-orig">{p.original}</span>
          {p.label && <span className="dbg-pair-kind">{p.label}</span>}
        </div>
      ))}
    </div>
  );
}

/** One wire message: the exact redacted text sent to the model, tokens highlighted. */
function Wire({ e }: { e: WireEntry }) {
  return (
    <pre className="dbg-pre">
      <Highlighted text={e.text} vault={e.vault} kinds={e.kinds} />
    </pre>
  );
}

/** Small per-entry copy button (stops the copy-all propagation). */
function CopyButton({ text }: { text: string }) {
  const t = useT();
  const [done, setDone] = useState(false);
  return (
    <button
      className="dbg-copy"
      title={t.modals.debug.copyEntry}
      onClick={async (ev) => {
        ev.stopPropagation();
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        } catch {
          /* clipboard blocked — ignore */
        }
      }}
    >
      {done ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
    </button>
  );
}

/** A tool call/result. `args` are what the MODEL generated (wire form: any redacted
 *  value is a FAKE); the RedactingMcpClient un-redacts them to REAL before the server.
 *  The `result` shown is already re-redacted (fakes) for the model. We highlight both
 *  and show the redacted→réel mapping, with a caption stating the direction — so it's
 *  never ambiguous whether a value is what the model saw or what the server received. */
function ToolBody({ e }: { e: ToolEntry }) {
  const pairs = toolPairsOf(e);
  return (
    <div className="dbg-body">
      {e.args && (
        <pre className="dbg-pre muted">
          args <Highlighted text={e.args} vault={e.vault} kinds={e.kinds} />
        </pre>
      )}
      {/* The direction caption is only meaningful for a REAL tool call (it carries a
          vault); internal timing entries (AI detection / tool result) have none. */}
      {e.args && e.vault && (
        <div className="dbg-note">
          {pairs.length
            ? "args du modèle (forme wire) — le surligné est un-redacted avant l'appel (mapping ci-dessous)"
            : "args du modèle — rien de redacted ici"}
        </div>
      )}
      {/* A FAILED entry may still carry a `result` (run_python folds its stderr + the
          model-facing error text there) — render BOTH, never hide diagnostics behind
          the ok flag (the empty « run_python FAIL » rows were exactly this). */}
      {!e.ok && e.error && <pre className="dbg-pre err">{e.error}</pre>}
      {e.result && (
        <pre className="dbg-pre">
          <Highlighted text={e.result} vault={e.vault} kinds={e.kinds} />
        </pre>
      )}
      <PairsList pairs={pairs} />
    </div>
  );
}

/** One model EXCHANGE of the agentic loop (tour N): meta line, the request messages
 *  this tour appended (or the complete dump on failure) behind a native <details>,
 *  then the raw response — prose, tool calls, error. Wire form + hover-reveal. */
function TurnBody({ e }: { e: TurnEntry }) {
  return (
    <div className="dbg-body">
      <div className="dbg-note dbg-tokens">{turnSummary(e)}</div>
      <details className="dbg-turn-req" open={!e.ok}>
        <summary className="dbg-note">
          Requête {e.requestFull ? "COMPLÈTE (dump d'échec)" : `— ajouts de ce tour (${e.request.length})`}
          {" · "}
          {e.toolsOffered} outil{e.toolsOffered > 1 ? "s" : ""} offert{e.toolsOffered > 1 ? "s" : ""}
        </summary>
        {e.request.map((m, i) => (
          <pre className="dbg-pre muted" key={i}>
            [{m.role}]{m.truncatedFrom ? ` (tronqué — ${m.truncatedFrom} car. à l'origine)` : ""}{" "}
            <Highlighted text={m.content} vault={e.vault} kinds={e.kinds} />
          </pre>
        ))}
        {e.toolNames?.length ? <div className="dbg-note">Outils : {e.toolNames.join(", ")}</div> : null}
      </details>
      {!e.ok && e.error && <pre className="dbg-pre err">{e.error}</pre>}
      {e.text?.trim() ? (
        <pre className="dbg-pre">
          <Highlighted text={e.text} vault={e.vault} kinds={e.kinds} />
        </pre>
      ) : null}
      {(e.toolCalls ?? []).map((c, i) => (
        <pre className="dbg-pre" key={i}>
          → {c.name} <Highlighted text={c.args} vault={e.vault} kinds={e.kinds} />
        </pre>
      ))}
      <PairsList pairs={turnPairsOf(e)} />
    </div>
  );
}

/** A live lifecycle step of the agentic loop — running clock while in flight, then
 *  a final duration. No redacted content (labels only), so it renders as plain text. */
function PhaseBody({ e }: { e: PhaseEntry }) {
  if (!e.detail && e.ms === undefined) return null;
  return (
    <div className="dbg-note">
      {e.detail}
      {e.ms !== undefined && (e.detail ? ` · ${e.ms} ms` : `${e.ms} ms`)}
    </div>
  );
}

export function Row({ e }: { e: DebugEntry }) {
  const bad = (e.type === "tool" || e.type === "phase" || e.type === "turn") && e.ok === false;
  const tokens = e.type === "wire" ? wireTokenSummary(e) : null;
  return (
    <div className="dbg-row">
      <div className="dbg-row-head">
        <span className={`dbg-tag dbg-${e.type}${bad ? " bad" : ""}`}>{tagLabel(e)}</span>
        <span className="dbg-meta">
          {e.type === "wire" || e.type === "turn"
            ? e.model
            : e.type === "tool"
              ? e.name
              : e.type === "phase"
                ? e.label
                : e.scope}
        </span>
        <span className="dbg-time">{time(e.at)}</span>
        <CopyButton text={entryToText(e)} />
      </div>
      {e.type === "wire" && (
        <>
          {tokens && <div className="dbg-note dbg-tokens">{tokens}</div>}
          <Wire e={e} />
          <PairsList pairs={pairsOf(e)} />
        </>
      )}
      {e.type === "tool" && <ToolBody e={e} />}
      {e.type === "turn" && <TurnBody e={e} />}
      {e.type === "phase" && <PhaseBody e={e} />}
      {e.type === "error" && <pre className="dbg-pre err">{e.message}</pre>}
    </div>
  );
}
