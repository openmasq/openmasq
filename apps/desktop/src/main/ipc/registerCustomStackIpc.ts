import { app, dialog, type BrowserWindow } from "electron";
import { CUSTOM_STACK_ALLOWED, validateCustomStack, type CustomStack, type CustomStackVerdict } from "../../environments/customStack";
import { writeEnvPointer } from "../environment";
import { relaunchSafely } from "../updates/install";
import { mainMessages } from "../i18n";
import { handle, obj } from "./handle";

/**
 * `env:set-custom-stack` — write a SELF-HOSTED stack and switch to it.
 *
 * ⚠️ A trust boundary (rule 7), with three teeth in this order:
 *
 * 1. **The build must honor it.** Without `OPENMASQ_ALLOW_CUSTOM_STACK=1`, the channel isn't
 *    wired up at all — an official binary doesn't have this handler, it has nothing to refuse.
 * 2. **Validation is replayed HERE**, not only in the screen (`validateCustomStack`:
 *    https, no credentials, Supabase pair). A renderer is UX.
 * 3. **A NATIVE confirmation** (`dialog.showMessageBox`, modal on the window) names
 *    the hosts and waits for a human click — which a compromised renderer can't produce.
 *
 * What follows a "yes": the pointer switches to `custom` with the stack, and the app restarts
 * in ITS OWN `(Custom)` profile (`profile.ts`) — never in production's.
 */
type SetCustomStackResult =
  | { ok: true; relaunching: true }
  | { ok: false; reason: "custom_not_allowed" | "invalid" | "declined" | "write_failed"; field?: keyof CustomStack; detail?: string };

/** The native box's text, pure — testable and the same every time. */
function customStackConfirmText(stack: CustomStack): { message: string; detail: string } {
  const host = (u: string) => {
    try {
      return new URL(u).host;
    } catch {
      return u;
    }
  };
  const t = mainMessages().desktopMain.customStack;
  const lines = [t.api(host(stack.backend))];
  if (stack.gateway) lines.push(t.gateway(host(stack.gateway)));
  if (stack.supabaseUrl) lines.push(t.accounts(host(stack.supabaseUrl)));
  return { message: t.switchMessage, detail: `${lines.join("\n")}\n\n${t.switchDetail}` };
}

export function registerCustomStackIpc(args: { baseUserData: string; window: () => BrowserWindow | null }): void {
  if (!CUSTOM_STACK_ALLOWED) return;
  handle("env:set-custom-stack", [obj], async (_e, raw): Promise<SetCustomStackResult> => {
    const verdict: CustomStackVerdict = validateCustomStack(raw);
    if (!verdict.ok) return { ok: false, reason: "invalid", field: verdict.field, detail: verdict.reason };
    const { message, detail } = customStackConfirmText(verdict.stack);
    const win = args.window();
    const t = mainMessages().desktopMain.customStack;
    const opts = { type: "warning" as const, buttons: [t.switchButton, t.cancel], defaultId: 1, cancelId: 1, message, detail };
    const { response } = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts);
    if (response !== 0) return { ok: false, reason: "declined" };
    if (!writeEnvPointer(args.baseUserData, "custom", undefined, verdict.stack)) {
      return { ok: false, reason: "write_failed" };
    }
    void relaunchSafely(() => {
      app.relaunch();
      app.quit();
    });
    return { ok: true, relaunching: true };
  });
  // Forgetting the stack: the pointer goes back to production WITHOUT a stack, the app restarts.
  // Same native box — removing an address is a decision, not a setting.
  handle("env:forget-custom-stack", [], async (): Promise<SetCustomStackResult> => {
    const win = args.window();
    const t = mainMessages().desktopMain.customStack;
    const opts = {
      type: "warning" as const,
      buttons: [t.forgetButton, t.cancel],
      defaultId: 1,
      cancelId: 1,
      message: t.forgetMessage,
      detail: t.forgetDetail,
    };
    const { response } = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts);
    if (response !== 0) return { ok: false, reason: "declined" };
    if (!writeEnvPointer(args.baseUserData, "production", undefined, null)) return { ok: false, reason: "write_failed" };
    void relaunchSafely(() => {
      app.relaunch();
      app.quit();
    });
    return { ok: true, relaunching: true };
  });
}
