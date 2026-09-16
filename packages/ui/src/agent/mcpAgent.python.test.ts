import { BRAND } from "@openmasq/branding";
import { describe, expect, it, vi } from "vitest";
import { type Vault } from "@openmasq/redact";
import type { CompleteToolsResult, } from "@openmasq/llm";
import { runMcpAgentLoop, pythonErrorHint, } from "./mcpAgent";
import type { Host } from "../host";

describe("runMcpAgentLoop — code interpreter (run_python)", () => {
  function pyHost() {
    const turns: CompleteToolsResult[] = [
      { text: "", toolCalls: [{ id: "p1", name: "run_python", arguments: { code: "print('hi')" } }], stopReason: "tool_calls" },
      { text: "voici le graphique", toolCalls: [], stopReason: "stop" },
    ];
    const completeTools = vi.fn(async () => turns.shift() ?? { text: "", toolCalls: [], stopReason: "stop" });
    const host = { completeTools, mcp: { listTools: async () => [], callTool: vi.fn() } } as unknown as Host;
    return { host, completeTools };
  }
  const base = (host: Host) => ({
    host,
    provider: "openai" as const,
    modelId: "gpt-4o",
    history: [{ role: "user" as const, content: "trace un plot" }],
    vault: {} as Vault,
    secrets: [],
    disabledKinds: [],
    fromWire: (s: string) => s,
    onText: () => {},
    onToolCall: () => {},
  });

  it("offers + runs run_python with ZERO connectors, shows figures, then finalizes", async () => {
    const { host } = pyHost();
    const runPython = vi.fn(async () => ({
      ok: true,
      stdout: "hi",
      stderr: "",
      images: [{ name: "fig_1.png", base64: "AAA" }],
      files: [{ name: "rapport.pdf", base64: "JVBER", mime: "application/pdf" }],
    }));
    const onPythonImage = vi.fn();
    const onPythonFile = vi.fn();
    const handled = await runMcpAgentLoop({ ...base(host), runPython, onPythonImage, onPythonFile });
    expect(handled).toBe(true);
    expect(runPython).toHaveBeenCalledWith("print('hi')");
    expect(onPythonImage).toHaveBeenCalledTimes(1);
    expect(onPythonFile).toHaveBeenCalledTimes(1); // deliverable file handed to the user
    expect(onPythonImage).toHaveBeenCalledWith({ name: "fig_1.png", base64: "AAA" });
  });

  it("onPythonScript reçoit le code WIRE (pré-fromWire) sur un run RÉUSSI — jamais sur un échec", async () => {
    // The kept script must stay in WIRE form (fakes): it is what gets replayed in the
    // model history (`Message.pythonScript`) — the UN-redacted version only leaves the
    // sandbox path through the `analyse.py` seed (derived on the store side).
    const { host } = pyHost();
    const runPython = vi.fn(async () => ({ ok: true, stdout: "ok", stderr: "", images: [], files: [] }));
    const onPythonScript = vi.fn();
    await runMcpAgentLoop({
      ...base(host),
      fromWire: (s: string) => s.replace("print", "REAL_print"), // un-redactor VISIBLE
      runPython,
      onPythonScript,
      redactResult: async (t: string) => t,
    });
    expect(runPython).toHaveBeenCalledWith("REAL_print('hi')"); // le sandbox reçoit le RÉEL…
    expect(onPythonScript).toHaveBeenCalledWith("print('hi')"); // …le script reste en WIRE

    const failHost = pyHost();
    const onPythonScriptFail = vi.fn();
    await runMcpAgentLoop({
      ...base(failHost.host),
      runPython: vi.fn(async () => ({ ok: false, stdout: "", stderr: "boom", images: [], files: [] })),
      onPythonScript: onPythonScriptFail,
      redactResult: async (t: string) => t,
    });
    expect(onPythonScriptFail).not.toHaveBeenCalled(); // a failed script is no basis to work from
  });

  it("un `code` VIDE ne s'exécute pas : erreur explicite au modèle, sandbox jamais appelée", async () => {
    // Measured in eval (ling): `run_python({})` emitted in a loop — running nothing
    // returned a silent success that the model re-emitted (5 turns lost).
    const turns: CompleteToolsResult[] = [
      { text: "", toolCalls: [{ id: "p1", name: "run_python", arguments: {} }], stopReason: "tool_calls" },
      { text: "compris, voici le script complet", toolCalls: [], stopReason: "stop" },
    ];
    const completeTools = vi.fn(async () => turns.shift() ?? { text: "", toolCalls: [], stopReason: "stop" });
    const host = { completeTools, mcp: { listTools: async () => [], callTool: vi.fn() } } as unknown as Host;
    const runPython = vi.fn(async () => ({ ok: true, stdout: "", stderr: "", images: [], files: [] }));
    const handled = await runMcpAgentLoop({ ...base(host), runPython, redactResult: async (t: string) => t });
    expect(handled).toBe(true);
    expect(runPython).not.toHaveBeenCalled();
    // The tool result handed back to the model names the problem + the instruction (WHOLE script).
    const second = (completeTools.mock.calls as unknown[][])[1]?.[0] as { messages: { role: string; content?: string }[] } | undefined;
    const toolLeg = second?.messages.find((m) => m.role === "tool");
    expect(String(toolLeg?.content)).toMatch(/`code` est manquant ou vide/);
    expect(String(toolLeg?.content)).toMatch(/COMPLET/);
  });

  it("HARD-STOPS after 2 consecutive run_python timeouts (unreachable sandbox, no 3×60 s loop)", async () => {
    // The reported flow: yfinance timed out in the jail and a weak model re-ran the same
    // code again and again, each burning the full ~60 s budget. A sandbox whose network is
    // down never recovers, so the loop must give up after the 2nd consecutive timeout —
    // long before the generic MAX_CONSECUTIVE_DEAD (5) or the turn cap.
    let n = 0;
    const completeTools = vi.fn(async () => ({
      text: "",
      toolCalls: [{ id: `p${++n}`, name: "run_python", arguments: { code: "yf.download('CW8.PA')" } }],
      stopReason: "tool_calls" as const,
    }));
    const host = { completeTools, mcp: { listTools: async () => [], callTool: vi.fn() } } as unknown as Host;
    const runPython = vi.fn(async () => ({
      ok: false,
      stdout: "",
      stderr: `[${BRAND.name}] délai dépassé (60000 ms) — interrompu.`,
      images: [],
      files: [],
    }));
    const handled = await runMcpAgentLoop({ ...base(host), runPython, redactResult: async (t: string) => t });
    expect(handled).toBe(true); // stopped with an exhaustion diagnosis, not left hanging
    expect(runPython).toHaveBeenCalledTimes(2); // NOT 3+ — the 2nd timeout ends the turn
  });

  it("re-redacted run_python stdout through redactResult before the model sees it (audit #10)", async () => {
    const { host, completeTools } = pyHost();
    const runPython = vi.fn(async () => ({
      ok: true, stdout: "résultat: real@acme.com", stderr: "", images: [], files: [],
    }));
    const redactResult = vi.fn(async (t: string) => t.split("real@acme.com").join("[FAKE]"));
    await runMcpAgentLoop({ ...base(host), runPython, redactResult });
    expect(redactResult).toHaveBeenCalled();
    // The 2nd model turn's payload carries the tool result — the real value must be gone.
    expect(JSON.stringify((completeTools.mock.calls[1] as unknown[] | undefined)?.[0] ?? {})).not.toContain("real@acme.com");
  });

  it("MASKS run_python stdout when NO redactor is wired (fail-closed, audit #10)", async () => {
    const { host, completeTools } = pyHost();
    const runPython = vi.fn(async () => ({
      ok: true, stdout: "secret: real@acme.com", stderr: "", images: [], files: [],
    }));
    await runMcpAgentLoop({ ...base(host), runPython }); // no redactResult injected
    expect(JSON.stringify((completeTools.mock.calls[1] as unknown[] | undefined)?.[0] ?? {})).not.toContain("real@acme.com");
  });

  it("falls through (returns false) when run_python is absent and there are no tools", async () => {
    const { host, completeTools } = pyHost();
    const handled = await runMcpAgentLoop({ ...base(host) });
    expect(handled).toBe(false);
    expect(completeTools).not.toHaveBeenCalled();
  });

  it("narrates run_python LIVE from the instant it starts (no silent 60 s)", async () => {
    // The interpreter bypasses the dispatch path where every other call gets its
    // narration seed — the reported UX gap was a dead « en cours… » for the whole
    // sandbox run. The loop must emit a human FR status BEFORE the run resolves.
    const turns: CompleteToolsResult[] = [
      { text: "", toolCalls: [{ id: "p1", name: "run_python", arguments: { code: "print(1)" } }], stopReason: "tool_calls" },
      { text: "fait", toolCalls: [], stopReason: "stop" },
    ];
    const completeTools = vi.fn(async () => turns.shift() ?? { text: "", toolCalls: [], stopReason: "stop" });
    const host = { completeTools, mcp: { listTools: async () => [], callTool: vi.fn() } } as unknown as Host;
    const statuses: string[] = [];
    let statusWhenRunning = "";
    const runPython = vi.fn(async () => {
      statusWhenRunning = statuses[statuses.length - 1] ?? "";
      return { ok: true, stdout: "1", stderr: "", images: [], files: [] };
    });
    await runMcpAgentLoop({
      ...base(host),
      runPython,
      onToolProgress: (t: string) => statuses.push(t),
    });
    // The seed landed BEFORE the sandbox resolved — the row never sat on a spinner.
    expect(statusWhenRunning).toBe("Analyse et génération de fichiers");
  });

  it("runs the code DE-REDACTED (real files) but RE-REDACTED the stdout for the model", async () => {
    // The model wrote FAKE data in its code ("Oslen Group"); the local sandbox runs it
    // DE-REDACTED so the DELIVERABLE holds the user's REAL data ("Karl Studio"). The
    // stdout (now real) is RE-REDACTED before it re-enters the conversation — the model
    // still only ever sees fakes. Guards the privacy boundary of the code interpreter.
    const turns: CompleteToolsResult[] = [
      { text: "", toolCalls: [{ id: "p1", name: "run_python", arguments: { code: "pdf.cell(text='Oslen Group')" } }], stopReason: "tool_calls" },
      { text: "fait", toolCalls: [], stopReason: "stop" },
    ];
    const seen: { messages: any[] }[] = [];
    const completeTools = vi.fn(async (payload: any) => {
      seen.push({ messages: [...payload.messages] }); // snapshot — the loop mutates it
      return turns.shift() ?? { text: "", toolCalls: [], stopReason: "stop" };
    });
    const host = { completeTools, mcp: { listTools: async () => [], callTool: vi.fn() } } as unknown as Host;
    // The de-redacted code prints the REAL value + writes a real deliverable.
    const runPython = vi.fn(async () => ({
      ok: true, stdout: "Généré pour Karl Studio", stderr: "",
      images: [], files: [{ name: "rapport.pdf", base64: "JVBER", mime: "application/pdf" }],
    }));
    const onPythonFile = vi.fn();
    await runMcpAgentLoop({
      ...base(host),
      runPython,
      onPythonFile,
      fromWire: (s: string) => s.replaceAll("Oslen Group", "Karl Studio"), // fake → real
      redactResult: (text: string) => text.replaceAll("Karl Studio", "Oslen Group"), // real → fake
    });
    // 1) the sandbox ran the DE-REDACTED (real) code → the deliverable is real.
    expect(runPython).toHaveBeenCalledWith("pdf.cell(text='Karl Studio')");
    expect(onPythonFile).toHaveBeenCalledWith(expect.objectContaining({ name: "rapport.pdf" }));
    // 2) the model's NEXT turn got the RE-REDACTED stdout — the FAKE, never the real value.
    const toolMsg = seen[1].messages.find((m: any) => m.role === "tool" && m.toolCallId === "p1");
    expect(toolMsg.content).toContain("Oslen Group");
    expect(toolMsg.content).not.toContain("Karl Studio");
  });
});

describe("pythonErrorHint (stop the pip-install loop)", () => {
  it("hints on an externally-managed-environment / pip install failure", () => {
    const h = pythonErrorHint("error: externally-managed-environment\nnote: See PEP 668");
    expect(h).toBeTruthy();
    expect(h).toMatch(/ne peux PAS installer/i);
    expect(h).toMatch(/fpdf2|openpyxl|python-docx/);
    expect(h).toMatch(/ne réessaie PAS/i);
  });

  it("names the missing module on a ModuleNotFoundError", () => {
    const h = pythonErrorHint("ModuleNotFoundError: No module named 'reportlab'");
    expect(h).toContain("reportlab");
    expect(h).toMatch(/pas disponible/i);
  });

  it("steers a network error (requests to the web) to the BROWSER, not pip", () => {
    const h = pythonErrorHint(
      "Error: HTTPSConnectionPool(host='www.google.com', port=443): Max retries exceeded",
    );
    expect(h).toBeTruthy();
    expect(h).toMatch(/browser_navigate|navigation|recherche/i);
    expect(h).toMatch(/pas d'acc[èe]s Internet/i);
    expect(h).not.toMatch(/installer de paquets/i); // NOT the pip hint
  });

  it("returns undefined for an ordinary runtime error (no install/module/network cause)", () => {
    expect(pythonErrorHint("ZeroDivisionError: division by zero")).toBeUndefined();
  });

  it("steers a 'no data / delisted' ticker failure to ISIN resolution, not more guessing", () => {
    for (const stderr of [
      "YFPricesMissingError('$FR0011871128.PA: possibly delisted; no price data found (period=1y)')",
      "Yahoo Finance n'a renvoyé aucune donnée pour : STOXX50E.PA, EUNL.PA",
    ]) {
      const h = pythonErrorHint(stderr);
      expect(h, stderr).toBeTruthy();
      expect(h).toMatch(/ISIN/);
      expect(h).toContain(`${BRAND.slug}_prices`);
      expect(h).toMatch(/en boucle/i);
      expect(h).not.toMatch(/pip|installer de paquets/i); // not the install hint
    }
  });

  it("a yfinance/socket TIMEOUT is a network error too (the sandbox has no internet)", () => {
    // The reported flow: yfinance timed out in the jail and the model concluded on its
    // own after wasted turns — the hint must fire on the timeout shapes as well.
    for (const stderr of [
      "urllib.error.URLError: <urlopen error timed out>",
      "requests.exceptions.ReadTimeout: HTTPSConnectionPool(host='query2.finance.yahoo.com', port=443): Read timed out.",
      "socket.timeout: timed out",
    ]) {
      const h = pythonErrorHint(stderr);
      expect(h, stderr).toBeTruthy();
      expect(h).toMatch(/pas d'acc[èe]s Internet/i);
      expect(h).toMatch(/browser_navigate|navigation/i);
    }
  });

  it("a BARE jail-timeout kill returns a timeout hint that steers OFF a blind retry", () => {
    // The jail's own kill ("délai dépassé", no curl/socket/urlopen signal) used to fall
    // through to `undefined` — so the model got no course-correction and re-ran the same
    // slow code (the reported 3×60 s loop). It must now hint, steering to the prices helper /
    // a lighter compute / answering with what it has — WITHOUT claiming a network cause.
    for (const stderr of [
      `[${BRAND.name}] délai dépassé (60000 ms) — interrompu.`,
      "Délai dépassé : exécution interrompue après 60 s",
    ]) {
      const h = pythonErrorHint(stderr);
      expect(h, stderr).toBeTruthy();
      expect(h).toMatch(/délai/i);
      expect(h).toMatch(new RegExp(`ne relance pas|${BRAND.slug}_prices|déjà obtenues`, "i"));
      expect(h).not.toMatch(/pas d'acc[èe]s Internet/i); // not the network hint
    }
  });
});
