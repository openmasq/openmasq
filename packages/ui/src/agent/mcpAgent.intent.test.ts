
import { describe, expect, it, vi } from "vitest";
import { type Vault } from "@openmasq/redact";
import type { CompleteToolsResult, } from "@openmasq/llm";
import { runMcpAgentLoop, type WriteConfirmInfo } from "./mcpAgent";
import type { Host } from "../host";

describe("runMcpAgentLoop — « Rédige un email » n'ENVOIE jamais (comportement, journal 2026-07-26)", () => {
  // The real scenario: the user asks « Rédige un email de remerciement à
  // nathan@hotmail.fr. », the (weak) model calls gmail__send_email instead of
  // presenting a draft — and in the `standard` confirmation mode (no card as long as
  // the conversation has not touched the web), the email LEFT on the spot.
  // The loop must refuse the send DETERMINISTICALLY, whatever the mode.
  function gmailHost() {
    const callTool = vi.fn(async () => ({ content: [{ type: "text" as const, text: "Email envoyé" }] }));
    const turns: CompleteToolsResult[] = [
      {
        text: "",
        toolCalls: [
          {
            id: "g1",
            name: "gmail__send_email",
            arguments: { to: "nathan@hotmail.fr", subject: "Merci pour votre collaboration", body: "Bonjour Nathan…" },
          },
        ],
        stopReason: "tool_calls",
      },
      { text: "Voici un brouillon :", toolCalls: [], stopReason: "stop" },
    ];
    const completeTools = vi.fn(async () => turns.shift() ?? { text: "", toolCalls: [], stopReason: "stop" });
    const host = {
      completeTools,
      mcp: {
        list: async () => [],
        listTools: async () => [
          { name: "gmail__send_email", description: "Send an email via Gmail", inputSchema: {}, serverId: "ipc" },
        ],
        callTool,
      },
    } as unknown as Host;
    return { host, callTool, completeTools };
  }
  const params = (host: Host, userMsg: string) => ({
    host,
    provider: "openai" as const,
    modelId: "gpt-4o",
    history: [{ role: "user" as const, content: userMsg }],
    vault: {} as Vault,
    secrets: [],
    disabledKinds: [],
    fromWire: (s: string) => s,
    onText: () => {},
    onToolCall: () => {},
  });

  it("send_email est REFUSÉ (jamais dispatché) et le modèle est orienté vers un brouillon en conversation", async () => {
    const { host, callTool, completeTools } = gmailHost();
    const handled = await runMcpAgentLoop(params(host, "Rédige un email de remerciement à nathan@hotmail.fr."));
    expect(handled).toBe(true);
    expect(callTool).not.toHaveBeenCalled(); // the email NEVER went out
    // The model's next turn receives the steer in place of the send result.
    const secondPayload = (completeTools.mock.calls.at(-1) as unknown[])[0] as { messages: { role: string; toolCallId?: string; content: string }[] };
    const toolMsg = secondPayload.messages.find((m) => m.role === "tool" && m.toolCallId === "g1");
    expect(toolMsg?.content).toContain("RÉDIGER");
    expect(toolMsg?.content).toContain("ENVOYER");
    expect(toolMsg?.content).not.toContain("Email envoyé");
  });

  it("un verbe d'envoi explicite (« Envoie un email… ») dispatche normalement — la garde ne sur-bloque pas", async () => {
    const { host, callTool } = gmailHost();
    await runMcpAgentLoop(params(host, "Envoie un email de remerciement à nathan@hotmail.fr."));
    expect(callTool).toHaveBeenCalledTimes(1);
  });
});

describe("runMcpAgentLoop — « Prépare ma journée » ne CRÉE jamais (comportement, journal 2026-07-27)", () => {
  // The real scenario: the user launches the « Préparer ma journée » workflow (a READ
  // request: « Mes rendez-vous dans l'ordre, avec les participants et le lieu »), and
  // the model — without having read the calendar once — calls `create_event` and puts
  // an event invented from end to end into the REAL calendar.
  // In `standard` mode (the default) no card opens for an ordinary write as long as the
  // conversation has not touched the web: the creation went out in silence.
  const READ_ONLY_ASK =
    "Prépare ma journée du 27 juillet.\n\n" +
    "1. Mes rendez-vous dans l'ordre, avec les participants et le lieu.\n" +
    "2. Pour chacun : le sujet, et ce que je dois avoir préparé.\n" +
    "3. Ce qui se chevauche ou ne me laisse pas le temps de me déplacer.\n\n" +
    "(Utilise le connecteur : Google Agenda.)";

  function calendarHost(toolName: string) {
    const callTool = vi.fn(async () => ({ content: [{ type: "text" as const, text: "Événement créé : https://cal/x" }] }));
    const turns: CompleteToolsResult[] = [
      {
        text: "",
        toolCalls: [
          {
            id: "c1",
            name: toolName,
            arguments: {
              summary: "[test e2e] Revue produit",
              start: "2026-07-27T12:00:00+02:00",
              end: "2026-07-27T13:00:00+02:00",
              location: "Salle de réunion 3",
            },
          },
        ],
        stopReason: "tool_calls",
      },
      { text: "Voici votre journée :", toolCalls: [], stopReason: "stop" },
    ];
    const completeTools = vi.fn(async () => turns.shift() ?? { text: "", toolCalls: [], stopReason: "stop" });
    const host = {
      completeTools,
      mcp: {
        list: async () => [],
        listTools: async () => [
          { name: "google-calendar__create_event", description: "Create an event.", inputSchema: {}, serverId: "ipc" },
          { name: "google-calendar__list_events", description: "List upcoming events.", inputSchema: {}, serverId: "ipc" },
        ],
        callTool,
      },
    } as unknown as Host;
    return { host, callTool, completeTools };
  }
  const params = (host: Host, userMsg: string) => ({
    host,
    provider: "openai" as const,
    modelId: "gpt-4o",
    history: [{ role: "user" as const, content: userMsg }],
    vault: {} as Vault,
    secrets: [],
    disabledKinds: [],
    fromWire: (s: string) => s,
    onText: () => {},
    onToolCall: () => {},
  });

  it("create_event est REFUSÉ (jamais dispatché) sur une demande de consultation", async () => {
    const { host, callTool, completeTools } = calendarHost("google-calendar__create_event");
    const handled = await runMcpAgentLoop(params(host, READ_ONLY_ASK));
    expect(handled).toBe(true);
    expect(callTool).not.toHaveBeenCalled(); // l'événement n'a JAMAIS été créé
    const secondPayload = (completeTools.mock.calls.at(-1) as unknown[])[0] as { messages: { role: string; toolCallId?: string; content: string }[] };
    const toolMsg = secondPayload.messages.find((m) => m.role === "tool" && m.toolCallId === "c1");
    expect(toolMsg?.content).toContain("CONSULTER");
    expect(toolMsg?.content).toContain("MODIFIER");
    expect(toolMsg?.content).not.toContain("Événement créé");
  });

  it("aucune confirmation n'est même demandée — le refus est déterministe, pas un « non » de l'utilisateur", async () => {
    const { host, callTool } = calendarHost("google-calendar__create_event");
    const confirmWrite = vi.fn(async () => true); // l'utilisateur dirait OUI
    await runMcpAgentLoop({ ...params(host, READ_ONLY_ASK), confirmWrite });
    expect(confirmWrite).not.toHaveBeenCalled();
    expect(callTool).not.toHaveBeenCalled();
  });

  it("un verbe d'action explicite (« Crée dans mon agenda… ») dispatche normalement — la garde ne sur-bloque pas", async () => {
    const { host, callTool } = calendarHost("google-calendar__create_event");
    await runMcpAgentLoop(
      params(host, "Crée dans mon agenda un événement « Revue produit » jeudi de 14h à 14h30."),
    );
    expect(callTool).toHaveBeenCalledTimes(1);
  });

  it("une LECTURE reste libre sur la même demande — la garde ne vise que les écritures", async () => {
    const { host, callTool } = calendarHost("google-calendar__list_events");
    await runMcpAgentLoop(params(host, READ_ONLY_ASK));
    expect(callTool).toHaveBeenCalledTimes(1);
  });

  /* Log of 15/08: « regarde sur posthog l'activité récente ». `execute-sql` carries
     « execute » (WRITE_VERB) and this test PRECEDES the annotation in the classifier — it
     was therefore refused outright, and the only tool able to answer became unreachable
     for ANY read request. Nine turns, ~170,000 tokens, nothing. */
  function sqlHost() {
    const callTool = vi.fn(async () => ({ content: [{ type: "text" as const, text: "1200 app_open" }] }));
    const turns: CompleteToolsResult[] = [
      {
        text: "",
        toolCalls: [{ id: "s1", name: "posthog__execute-sql", arguments: { query: "SELECT count() FROM events" } }],
        stopReason: "tool_calls",
      },
      { text: "Voici l'activité :", toolCalls: [], stopReason: "stop" },
    ];
    const completeTools = vi.fn(async () => turns.shift() ?? { text: "", toolCalls: [], stopReason: "stop" });
    const host = {
      completeTools,
      mcp: {
        list: async () => [],
        listTools: async () => [
          {
            name: "posthog__execute-sql",
            description: "Executes HogQL — read-only analytics queries.",
            inputSchema: {},
            serverId: "ipc",
            annotations: { readOnlyHint: true, destructiveHint: false },
          },
        ],
        callTool,
      },
    } as unknown as Host;
    return { host, callTool };
  }
  const REGARDE = "regarde sur posthog l'activité récente de Zorvia";

  it("execute-sql déclaré lecture seule n'est plus refusé d'office — il DEMANDE", async () => {
    const { host, callTool } = sqlHost();
    const confirmWrite = vi.fn(async () => true);
    await runMcpAgentLoop({ ...params(host, REGARDE), confirmWrite });
    expect(confirmWrite).toHaveBeenCalledTimes(1); // la carte s'ouvre…
    expect(callTool).toHaveBeenCalledTimes(1); // …et l'accord la dispatche
  });

  it("et un REFUS de l'utilisateur le bloque toujours — la confirmation reste la garde", async () => {
    const { host, callTool } = sqlHost();
    const confirmWrite = vi.fn(async () => false);
    await runMcpAgentLoop({ ...params(host, REGARDE), confirmWrite });
    expect(confirmWrite).toHaveBeenCalledTimes(1);
    expect(callTool).not.toHaveBeenCalled();
  });
});

describe("le rappel FORCÉ ne peut pas fabriquer un effet de bord", () => {
  // Log of 27/07/2026: the user asks « de ton compte agenda, à quel compte ? ». The
  // model answers in prose (« je n'ai pas accès… »), the loop reads a refusal and
  // re-queries it with tool_choice=required — forced to call something, it calls
  // `create_event`, and an event is created in the REAL calendar.
  function host(tools: { name: string; description: string }[]) {
    const callTool = vi.fn(async () => ({ content: [{ type: "text" as const, text: "ok" }] }));
    const seen: (string[] | undefined)[] = [];
    const completeTools = vi.fn(async (o: { tools?: { name: string }[]; toolChoice?: string }) => {
      if (o.toolChoice === "required") seen.push(o.tools?.map((t) => t.name));
      // Always a refusal in prose: the loop will attempt its forced retry.
      return { text: "Je n'ai pas accès à cela, je ne peux pas le faire.", toolCalls: [], stopReason: "stop" as const };
    });
    const h = {
      completeTools,
      mcp: {
        list: async () => [],
        listTools: async () => tools.map((t) => ({ ...t, inputSchema: {}, serverId: "ipc" })),
        callTool,
      },
    } as unknown as Host;
    return { host: h, callTool, forcedOffers: seen };
  }
  const params = (h: Host) => ({
    host: h,
    provider: "openai" as const,
    modelId: "gpt-4o",
    history: [{ role: "user" as const, content: "de ton compte agenda, à quel compte ?" }],
    vault: {} as Vault,
    secrets: [],
    disabledKinds: [],
    fromWire: (s: string) => s,
    onText: () => {},
    onToolCall: () => {},
  });

  it("n'offre AUCUN outil d'écriture au tour forcé", async () => {
    const { host: h, forcedOffers } = host([
      { name: "google-calendar__list_events", description: "Lister les événements" },
      { name: "google-calendar__create_event", description: "Créer un événement" },
    ]);
    await runMcpAgentLoop(params(h));
    expect(forcedOffers.length, "un rappel forcé a bien eu lieu").toBeGreaterThan(0);
    for (const offered of forcedOffers) {
      expect(offered).not.toContain("google-calendar__create_event");
      expect(offered).toContain("google-calendar__list_events");
    }
  });

  it("ne force PAS du tout quand il ne reste que des écritures", async () => {
    // Forcing when the only possible choice writes is manufacturing the side effect.
    const { host: h, forcedOffers, callTool } = host([
      { name: "google-calendar__create_event", description: "Créer un événement" },
    ]);
    await runMcpAgentLoop(params(h));
    expect(forcedOffers).toHaveLength(0);
    expect(callTool).not.toHaveBeenCalled();
  });
});

describe("runMcpAgentLoop — une LECTURE ne demande jamais confirmation", () => {
  /* Product decision of 03/08: only a WRITE may interrupt the user. The H-4 barrier
     confirmed when a read's args ENCLOSED a vault value — that is, on the normal case
     (« recherche Entreprise Zorvia » encloses « Zorvia »), and a card that opens on
     ordinary work teaches people to click without reading, which is then paid for on the
     write card. The scan still runs: it TRACES, it no longer blocks. What still confirms:
     a write, an attachment, and a NAVIGATION whose URL carries real data (there, the
     destination is chosen by the model). */
  const SUSPICIOUS_REF = "ref zzqx-fake-42 suite"; // carries the vault key « zzqx-fake-42 »
  const TOOLS = [
    // `read_ref`, not `open_ref`: since the fail-closed default (unknown ⇒ write, audit
    // 2026-08-10), « open » is no longer proof of a read (`open_ticket` creates).
    // These tests pin « a READ never asks for confirmation » — the fixture must therefore
    // be a read PROVEN by its leading verb.
    { name: "fs__list_refs", description: "", inputSchema: {}, serverId: "ipc" },
    { name: "fs__read_ref", description: "", inputSchema: {}, serverId: "ipc" },
    { name: "fs__delete_ref", description: "", inputSchema: {}, serverId: "ipc" },
  ];
  const provHost = (turns: CompleteToolsResult[], results: Record<string, string>) => {
    const completeTools = vi.fn(async () => turns.shift() ?? { text: "fini", toolCalls: [], stopReason: "stop" as const });
    const callTool = vi.fn(async (call: { name: string }) => ({
      content: [{ type: "text" as const, text: results[call.name] ?? "ok" }],
    }));
    const host = {
      completeTools,
      mcp: {
        list: async () => [],
        add: async () => {},
        remove: async () => {},
        connect: async () => ({ id: "x", name: "x", url: "", connected: true, authorized: true }),
        disconnect: async () => {},
        listTools: async () => TOOLS,
        callTool,
      },
    } as unknown as Host;
    return { host, callTool };
  };
  const params = (
    host: Host,
    confirmWrite: (i: WriteConfirmInfo) => Promise<boolean>,
    ask = "lis la référence",
  ) => ({
    host,
    provider: "openai" as const,
    modelId: "gpt-4o",
    history: [{ role: "user" as const, content: ask }],
    vault: { "zzqx-fake-42": "Real Corp" } as Vault,
    secrets: [],
    disabledKinds: [],
    fromWire: (s: string) => s,
    onText: () => {},
    onToolCall: () => {},
    confirmWrite,
  });

  it("l'arg qui embarque une valeur du coffre part SANS carte — c'est une lecture", async () => {
    const turns: CompleteToolsResult[] = [
      { text: "", toolCalls: [{ id: "c1", name: "fs__read_ref", arguments: { ref: SUSPICIOUS_REF } }], stopReason: "tool_calls" },
    ];
    const { host, callTool } = provHost(turns, {});
    const confirmWrite = vi.fn(async (_i: WriteConfirmInfo) => true);
    await runMcpAgentLoop(params(host, confirmWrite));
    expect(confirmWrite).not.toHaveBeenCalled();
    expect(callTool).toHaveBeenCalledTimes(1);
  });

  it("…mais une ÉCRITURE aux mêmes arguments confirme toujours", async () => {
    // The rule is not "never a card again": it is "only a write opens one".
    const turns: CompleteToolsResult[] = [
      { text: "", toolCalls: [{ id: "c1", name: "fs__delete_ref", arguments: { ref: SUSPICIOUS_REF } }], stopReason: "tool_calls" },
    ];
    const { host, callTool } = provHost(turns, {});
    const confirmWrite = vi.fn(async (_i: WriteConfirmInfo) => true);
    await runMcpAgentLoop(params(host, confirmWrite, "supprime cette référence"));
    expect(confirmWrite).toHaveBeenCalledTimes(1);
    expect(confirmWrite.mock.calls[0][0]).toMatchObject({ reason: "write" });
    expect(callTool).toHaveBeenCalledTimes(1);
  });

  it("AVEC provenance (le connecteur a renvoyé la valeur), la lecture passe SANS carte", async () => {
    const turns: CompleteToolsResult[] = [
      { text: "", toolCalls: [{ id: "c1", name: "fs__list_refs", arguments: {} }], stopReason: "tool_calls" },
      { text: "", toolCalls: [{ id: "c2", name: "fs__read_ref", arguments: { ref: SUSPICIOUS_REF } }], stopReason: "tool_calls" },
    ];
    const { host, callTool } = provHost(turns, {
      fs__list_refs: `Références disponibles :\n${SUSPICIOUS_REF}\nautre-ref`,
    });
    const confirmWrite = vi.fn(async () => true);
    await runMcpAgentLoop(params(host, confirmWrite));
    expect(confirmWrite).not.toHaveBeenCalled();
    expect(callTool).toHaveBeenCalledTimes(2);
  });

  it("un arg COMPOSÉ passe aussi — la provenance ne décide plus rien pour une lecture", async () => {
    const turns: CompleteToolsResult[] = [
      { text: "", toolCalls: [{ id: "c1", name: "fs__list_refs", arguments: {} }], stopReason: "tool_calls" },
      { text: "", toolCalls: [{ id: "c2", name: "fs__read_ref", arguments: { ref: `${SUSPICIOUS_REF} + données de la conversation` } }], stopReason: "tool_calls" },
    ];
    const { host, callTool } = provHost(turns, {
      fs__list_refs: `Références disponibles :\n${SUSPICIOUS_REF}`,
    });
    const confirmWrite = vi.fn(async () => true);
    await runMcpAgentLoop(params(host, confirmWrite));
    expect(confirmWrite).not.toHaveBeenCalled();
    expect(callTool).toHaveBeenCalledTimes(2);
  });
});
