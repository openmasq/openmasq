import { describe, expect, it } from "vitest";
import {
  ANTIGRAVITY_EMPTY_TURN,
  antigravityUsage,
  interpretAntigravityEvent,
} from "./antigravityStream";
import { buildAntigravityArgs, ANTIGRAVITY_APP_DATA_DIR } from "./antigravityEngine";

/**
 * Les évènements ci-dessous sont des CAPTURES RÉELLES de la CLI 1.1.21 (31/08/2026),
 * réduites au strict nécessaire. Ce que ces cas tiennent :
 *  1. tous les `text_delta` sont des INCRÉMENTS — celui de l'évènement `DONE` compris.
 *     En sauter un tronque la réponse ; les lire deux fois la double ;
 *  2. un tour `SUCCESS` mais VIDE (le modèle a tenté un outil local, refusé en headless)
 *     devient une erreur EXPLIQUÉE, jamais une bulle vide ;
 *  3. les drapeaux d'isolement partent bien — surtout PAS `--dangerously-skip-permissions`,
 *     qui rendrait la machine de l'utilisateur au modèle.
 */
const step = (over: Record<string, unknown>) => ({
  event: "step_update",
  step_update: { conversation_id: "c1", step_index: 1, ...over },
});

describe("interpretAntigravityEvent — le flux mesuré de la CLI agy", () => {
  it("l'init donne la session", () => {
    expect(
      interpretAntigravityEvent(
        { event: "init", conversation_id: "c1", init: { tools: [] } },
        false,
      ),
    ).toEqual({ kind: "session", id: "c1" });
  });

  it("chaque text_delta est un incrément — y compris celui de l'évènement DONE", () => {
    const active = step({ state: "ACTIVE", step_type: "agent_response", text_delta: "OK" });
    const done = step({ state: "DONE", step_type: "agent_response", text_delta: "\n" });
    expect(interpretAntigravityEvent(active, false)).toEqual({ kind: "text", delta: "OK" });
    expect(interpretAntigravityEvent(done, true)).toEqual({ kind: "text", delta: "\n" });
  });

  it("un pas d'OUTIL refusé par le mode headless ne dit rien au flux", () => {
    const tool = step({
      state: "ERROR",
      step_type: "tool",
      tool_name: "run_command",
      tool_info: {
        error: { type: "TOOL_ERROR", message: "user denied permission to run command" },
      },
    });
    expect(interpretAntigravityEvent(tool, false)).toBeNull();
  });

  it("le result SUCCESS termine le tour avec l'usage", () => {
    const action = interpretAntigravityEvent(
      {
        event: "result",
        result: {
          status: "SUCCESS",
          response: "OK\n",
          usage: { input_tokens: 13698, output_tokens: 76, cache_read_tokens: 8128 },
        },
      },
      true,
    );
    expect(action).toEqual({
      kind: "done",
      finish: "stop",
      usage: { inputTokens: 13698, outputTokens: 76, cachedInputTokens: 8128 },
    });
  });

  it("un SUCCESS VIDE (outil local refusé) devient une erreur expliquée, pas une bulle vide", () => {
    expect(
      interpretAntigravityEvent(
        { event: "result", result: { status: "SUCCESS", response: "" } },
        false,
      ),
    ).toEqual({ kind: "error", message: ANTIGRAVITY_EMPTY_TURN });
  });

  it("un statut non-SUCCESS remonte le message de la CLI", () => {
    const action = interpretAntigravityEvent(
      { event: "result", result: { status: "ERROR", error: { message: "quota dépassé" } } },
      true,
    );
    expect(action).toEqual({ kind: "error", message: "quota dépassé" });
  });

  it("un usage sans compteur ne fabrique pas de zéros", () => {
    expect(antigravityUsage({ thinking_tokens: 42 })).toBeUndefined();
  });
});

describe("buildAntigravityArgs — l'isolement est dans les drapeaux", () => {
  const args = buildAntigravityArgs({ prompt: "bonjour" });

  it("sert le tour en NDJSON, sans expansion de commandes slash", () => {
    expect(args).toContain("stream-json");
    expect(args).toContain("--disable-slash-commands");
    expect(args[args.length - 2]).toBe("-p");
    expect(args[args.length - 1]).toBe("bonjour");
  });

  it("isole les réglages ET l'historique dans un dossier de données à nous", () => {
    // Le drapeau n'accepte qu'un chemin RELATIF (mesuré) : le passer absolu fait
    // refuser le démarrage (« must not be absolute »).
    expect(args).toContain(`--app_data_dir=${ANTIGRAVITY_APP_DATA_DIR}`);
    expect(ANTIGRAVITY_APP_DATA_DIR.startsWith("/")).toBe(false);
  });

  it("⛔ ne rend JAMAIS la machine au modèle", () => {
    expect(args).not.toContain("--dangerously-skip-permissions");
  });
});
