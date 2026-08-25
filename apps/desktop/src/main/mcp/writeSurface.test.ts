import { describe, it, expect, beforeEach, vi } from "vitest";

// The real confirmation opens a BrowserWindow; the impl is injected instead, so electron
// only needs to RESOLVE. Same harness as `writeConfirmWindow.test.ts`.
vi.mock("electron", () => ({ BrowserWindow: class {}, app: { on: () => {} } }));
// Ce test atteint `runtime/errorReport.ts`, qui importe RÉELLEMENT `@sentry/electron/main`
// depuis que le rapport de plantage existe. Le vrai module charge `electron` et y attend
// `app`, que l'environnement `node` de vitest ne fournit pas — le fichier ne se chargeait
// donc plus du tout. On mocke Sentry plutôt que d'étoffer le mock d'electron : ce test ne
// dit rien de la télémétrie, et l'étoffer reviendrait à réimplémenter electron ici.
vi.mock("@sentry/electron/main", () => ({ captureException: vi.fn(), init: vi.fn() }));

import { __setWriteConfirmImpl, __resetWriteConfirmImpl, setWriteAutoApprove } from "./writeConfirmWindow";
import { _resetConfirmationMode, setConfirmationMode } from "./confirmationMode";
import { assertWriteAllowed } from "./server/callTool";

/**
 * WHICH SURFACE confirms a write — now decided by `CONFIRMATION_POLICY` fed with main's
 * persisted mode. In **Mode renforcé** the main-owned window is reserved for RISKY calls
 * (the historical, audit-M6 behaviour); in the default **standard** mode the policy routes
 * NOTHING to the window (the in-conversation card is the only confirmation — the accepted
 * residual is stated in `callTool.ts`). "Did main ask?" stays a security assertion: every
 * case below is "could this action happen without the un-spoofable surface, and is that
 * what the ACTIVE mode promises?"
 */
let asked: string[] = [];

beforeEach(async () => {
  __resetWriteConfirmImpl();
  _resetConfirmationMode(); // un-inited store ⇒ in-memory only, default "standard"
  asked = [];
  await setWriteAutoApprove(false); // session auto-approve off: it would short-circuit everything
  __setWriteConfirmImpl(async (req) => {
    asked.push(req.toolName);
    return true;
  });
});

const renforce = () => setConfirmationMode("renforce", async () => true);

const call = (name: string, args: Record<string, string> = {}) => ({ name, arguments: args });
const route = (realName: string, annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean }) => ({
  realName,
  annotations,
});

describe("mode renforcé — the system window still guards everything risky", () => {
  it("asks before a send — the irreversible, third-party case", async () => {
    await renforce();
    await assertWriteAllowed(call("gmail__send_email"), route("gmail__send_email"));
    expect(asked).toEqual(["gmail__send_email"]);
  });

  it("asks before a delete, a permission change and a script run", async () => {
    await renforce();
    for (const tool of ["gmail__delete_thread", "github__grant_access", "github__run_workflow"]) {
      await assertWriteAllowed(call(tool), route(tool));
    }
    expect(asked).toHaveLength(3);
  });

  it("asks for a server WE DON'T SHIP, whatever its tool is called", async () => {
    await renforce();
    // A user-added endpoint can name a destructive operation `add_label`.
    await assertWriteAllowed(call("custom-9f2a__add_label"), route("custom-9f2a__add_label"));
    expect(asked).toEqual(["custom-9f2a__add_label"]);
  });

  it("asks when the server declares the tool destructive", async () => {
    await renforce();
    await assertWriteAllowed(
      call("gmail__add_label"),
      route("gmail__add_label", { destructiveHint: true }),
    );
    expect(asked).toEqual(["gmail__add_label"]);
  });

  it("still REFUSES the call when the window says no (fail closed, unchanged)", async () => {
    await renforce();
    __setWriteConfirmImpl(async () => false);
    await expect(
      assertWriteAllowed(call("gmail__send_email"), route("gmail__send_email")),
    ).rejects.toThrow(/refusée par l'utilisateur/);
  });

  it("ordinary (low-risk) actions are confirmed in the conversation, not by a modal", async () => {
    await renforce();
    for (const tool of ["gmail__create_draft", "gmail__add_label", "gmail__archive_thread"]) {
      await assertWriteAllowed(call(tool), route(tool));
    }
    expect(asked).toEqual([]);
  });
});

describe("mode standard (the default) — no system window, ever", () => {
  it("a risky write proceeds without the window (the in-conversation card is the confirmation)", async () => {
    await assertWriteAllowed(call("gmail__send_email"), route("gmail__send_email"));
    await assertWriteAllowed(call("custom-9f2a__add_label"), route("custom-9f2a__add_label"));
    expect(asked).toEqual([]);
  });

  it("lets the call proceed rather than silently refusing it", async () => {
    await expect(
      assertWriteAllowed(call("gmail__create_draft"), route("gmail__create_draft")),
    ).resolves.toBeUndefined();
  });
});

describe("both modes — untouched paths", () => {
  it("leaves read-only tools and browser tools exactly as they were", async () => {
    await assertWriteAllowed(call("gmail__list_messages"), route("gmail__list_messages"));
    await assertWriteAllowed(call("browser__browser_click"), route("browser_click"));
    await renforce();
    await assertWriteAllowed(call("gmail__list_messages"), route("gmail__list_messages"));
    await assertWriteAllowed(call("browser__browser_click"), route("browser_click"));
    expect(asked).toEqual([]);
  });
});
