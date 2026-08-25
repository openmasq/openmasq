// The recording of ONE agent turn, and the views an eval asserts on.
//
// PURE on purpose (rule: logic in .ts, and this folder's only free-to-run part). The
// harness that drives a REAL model is impure and stochastic; this file is neither, so
// the assertions themselves can be unit-tested (`transcript.test.ts`) and cannot drift
// with the weather. An eval that fails should fail because the MODEL changed, never
// because a view mis-read the log.
//
// The two events that matter carry the whole trust boundary (root rule 11), because the
// loop's `RedactingMcpClient` sits BETWEEN them:
//   • `model:in`  — what the model SAW      → must be fakes only
//   • `tool:out`  — what actually LEFT      → must be the real values

export type ToolArgs = Record<string, unknown>;

/** True when a `completeTools` payload IS `toolRouter.ts`'s own probe call — its exact,
 *  stable signature (`select_tools`, required). Shared by every harness `completeTools`
 *  wrapper so the router-vs-turn detection lives ONE place (rule 9), not re-guessed per
 *  caller. */
export function isRouterProbe(payload: { tools?: { name: string }[]; toolChoice?: string }): boolean {
  return payload.tools?.length === 1 && payload.tools[0].name === "select_tools" && payload.toolChoice === "required";
}

export type EvalEvent =
  /** A model call was issued: the full message list the model received this turn. */
  | { t: "model:in"; messages: { role: string; content: string }[] }
  /** What the model answered: prose and/or the tool calls it asked for (FAKE args).
   *  `ms` = wall time of the `completeTools` call that produced this turn (undefined
   *  for a caller that doesn't measure it — additive, never asserted on by a safety
   *  check, only read by the latency columns in the eval report). `kind: "router"`
   *  marks `toolRouter.ts`'s own cheap `select_tools` probe call — it goes through
   *  the SAME `completeTools` seam as a real turn, so `firstCallMs()` must skip it or
   *  a strategy that routes MORE OFTEN (a lower `routeMaxTools`) reports the router's
   *  own latency instead of the turn it precedes, backwards from what's being measured. */
  | { t: "model:out"; text: string; calls: { name: string; args: ToolArgs }[]; ms?: number; kind?: "router" | "turn" }
  /** A gate opened before dispatch, and how the scripted user answered. */
  | { t: "confirm"; tool: string; reason: string; approved: boolean }
  /** A tool was DISPATCHED — args as they leave the client, i.e. UN-redacted (real). */
  | { t: "tool:out"; name: string; args: ToolArgs }
  /** A tool result came back, as the model will see it (re-redacted). */
  | { t: "tool:in"; name: string; text: string }
  /** The turn's final assistant text (de-redacted for display). */
  | { t: "answer"; text: string };

export class Transcript {
  readonly events: EvalEvent[] = [];
  /** Cumul de la consommation modèle du run (rapports d'eval) : tokens montants /
   *  descendants quand le provider les rapporte, + nombre de tours modèle. */
  readonly usage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0, modelTurns: 0 };

  push(e: EvalEvent): void {
    this.events.push(e);
  }

  /** Wall time of the FIRST REAL turn's `completeTools` call — the one carrying the
   *  largest system prompt/tool catalog, so the most sensitive to a prompt-size
   *  strategy. Skips `toolRouter.ts`'s own `select_tools` probe call (`kind: "router"`)
   *  — a router call is not the thing a strategy comparison is trying to measure.
   *  `undefined` when the caller never recorded a timed call. */
  firstCallMs(): number | undefined {
    const e = this.events.find((e) => e.t === "model:out" && e.kind !== "router");
    return e?.t === "model:out" ? e.ms : undefined;
  }

  /** Tool names the model ASKED for, in order (including calls a gate then refused). */
  asked(): string[] {
    return this.events.flatMap((e) => (e.t === "model:out" ? e.calls.map((c) => c.name) : []));
  }

  /** Tool names actually DISPATCHED, in order. The difference with {@link asked} is
   *  exactly what the gates stopped — assert on both, never on one. */
  dispatched(): string[] {
    return this.events.flatMap((e) => (e.t === "tool:out" ? [e.name] : []));
  }

  /** The WIRE args of the first dispatch of `name` — what the outside really received. */
  wireArgsOf(name: string): ToolArgs | undefined {
    const e = this.events.find((e) => e.t === "tool:out" && e.name === name);
    return e?.t === "tool:out" ? e.args : undefined;
  }

  confirms(): { tool: string; reason: string; approved: boolean }[] {
    return this.events.flatMap((e) => (e.t === "confirm" ? [{ tool: e.tool, reason: e.reason, approved: e.approved }] : []));
  }

  /** Every character the model was EVER shown this turn (all model calls, all roles). */
  modelInbox(): string {
    return this.events
      .flatMap((e) => (e.t === "model:in" ? e.messages.map((m) => m.content) : []))
      .join("\n");
  }

  answer(): string {
    const e = [...this.events].reverse().find((e) => e.t === "answer");
    return e?.t === "answer" ? e.text : "";
  }

  /**
   * The `secrets` that REACHED the model — the product's core promise, so it must be
   * `[]`. Pass the vault's VALUES (a Vault is fake→real, so `Object.values` are the
   * reals). Case-insensitive: the engine expands a value to every casing, and a leak
   * spelled differently is still a leak.
   *
   * ⚠️ A REVEALED category legitimately reaches the model (`disabledKinds` / the reveal
   * gate), so pass only what the scenario expects to stay redacted — a blanket
   * `Object.values(vault)` on a revealing scenario asserts a promise we never made.
   */
  leaked(secrets: string[]): string[] {
    const inbox = this.modelInbox().toLowerCase();
    return secrets.filter((s) => s && inbox.includes(s.toLowerCase()));
  }

  /** A compact, greppable dump for a failing eval — a bare `expect` diff on a 40-turn
   *  transcript is unreadable, and a stochastic failure is only diagnosable from the
   *  ORDER of what happened. */
  format(): string {
    return this.events
      .map((e) => {
        switch (e.t) {
          case "model:in":
            return `  model:in   ${e.messages.length} msg`;
          case "model:out":
            return `→ model:out  ${e.calls.map((c) => `${c.name}(${JSON.stringify(c.args)})`).join(", ") || JSON.stringify(e.text.slice(0, 60))}`;
          case "confirm":
            return `? confirm    ${e.tool} [${e.reason}] → ${e.approved ? "approuvé" : "refusé"}`;
          case "tool:out":
            return `↗ tool:out   ${e.name}(${JSON.stringify(e.args)})`;
          case "tool:in":
            return `↘ tool:in    ${e.name} → ${JSON.stringify(e.text.slice(0, 60))}`;
          case "answer":
            return `= answer     ${JSON.stringify(e.text.slice(0, 80))}`;
        }
      })
      .join("\n");
  }
}
