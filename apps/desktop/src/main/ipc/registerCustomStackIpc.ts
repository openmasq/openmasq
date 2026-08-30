import { app, dialog, type BrowserWindow } from "electron";
import { CUSTOM_STACK_ALLOWED, validateCustomStack, type CustomStack, type CustomStackVerdict } from "../../environments/customStack";
import { writeEnvPointer } from "../environment";
import { relaunchSafely } from "../updates/install";
import { handle, obj } from "./handle";

/**
 * `env:set-custom-stack` — écrire une pile AUTO-HÉBERGÉE et basculer dessus.
 *
 * ⚠️ Une frontière de confiance (règle 7), à trois dents dans cet ordre :
 *
 * 1. **Le build doit l'honorer.** Sans `OPENMASQ_ALLOW_CUSTOM_STACK=1`, le canal n'est pas
 *    branché du tout — un binaire officiel n'a pas ce handler, il n'a rien à refuser.
 * 2. **La validation se rejoue ICI**, pas seulement dans l'écran (`validateCustomStack` :
 *    https, pas d'identifiants, couple Supabase). Un renderer est de l'UX.
 * 3. **Une confirmation NATIVE** (`dialog.showMessageBox`, modale sur la fenêtre) nomme
 *    les hôtes et attend un clic humain — qu'un renderer compromis ne peut pas produire.
 *
 * Ce qui suit un « oui » : le pointeur passe à `custom` avec la pile, et l'app redémarre
 * dans SON profil `(Custom)` (`profile.ts`) — jamais dans celui de la production.
 */
export type SetCustomStackResult =
  | { ok: true; relaunching: true }
  | { ok: false; reason: "custom_not_allowed" | "invalid" | "declined" | "write_failed"; field?: keyof CustomStack; detail?: string };

/** Le texte de la boîte native, pur — testable et le même à chaque fois. */
export function customStackConfirmText(stack: CustomStack): { message: string; detail: string } {
  const host = (u: string) => {
    try {
      return new URL(u).host;
    } catch {
      return u;
    }
  };
  const lines = [`API : ${host(stack.backend)}`];
  if (stack.gateway) lines.push(`Passerelle : ${host(stack.gateway)}`);
  if (stack.supabaseUrl) lines.push(`Comptes : ${host(stack.supabaseUrl)}`);
  return {
    message: "Pointer l'application vers cette pile auto-hébergée ?",
    detail:
      `${lines.join("\n")}\n\n` +
      "L'application redémarre dans un profil séparé : vos conversations, votre coffre et vos " +
      "clés de l'environnement actuel n'y sont pas copiés. Vous pourrez revenir à tout moment.",
  };
}

export function registerCustomStackIpc(args: { baseUserData: string; window: () => BrowserWindow | null }): void {
  if (!CUSTOM_STACK_ALLOWED) return;
  handle("env:set-custom-stack", [obj], async (_e, raw): Promise<SetCustomStackResult> => {
    const verdict: CustomStackVerdict = validateCustomStack(raw);
    if (!verdict.ok) return { ok: false, reason: "invalid", field: verdict.field, detail: verdict.reason };
    const { message, detail } = customStackConfirmText(verdict.stack);
    const win = args.window();
    const opts = { type: "warning" as const, buttons: ["Basculer", "Annuler"], defaultId: 1, cancelId: 1, message, detail };
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
  // Oublier la pile : le pointeur repasse à la production SANS pile, l'app redémarre.
  // Même boîte native — retirer une adresse est une décision, pas un réglage.
  handle("env:forget-custom-stack", [], async (): Promise<SetCustomStackResult> => {
    const win = args.window();
    const opts = {
      type: "warning" as const,
      buttons: ["Oublier", "Annuler"],
      defaultId: 1,
      cancelId: 1,
      message: "Oublier la pile auto-hébergée ?",
      detail: "L'application redémarre sur l'environnement par défaut. Le profil de la pile reste sur le disque.",
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
