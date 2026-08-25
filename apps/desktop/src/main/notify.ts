import { Notification, type BrowserWindow } from "electron";
import { handle, obj } from "./ipc/handle";
import { BRAND } from "@openmasq/branding";

/** Ce qu'une bannière porte au plus. Coupé court : une notification système tronque de
 *  toute façon, et un texte long y devient illisible. */
const MAX = 120;

const text = (v: unknown, fallback: string): string =>
  typeof v === "string" && v.trim() ? v.slice(0, MAX) : fallback;

/**
 * La notification SYSTÈME « une réponse est arrivée ».
 *
 * Elle vit dans main pour une raison unique et suffisante : **le clic doit ramener la
 * fenêtre au premier plan**, ce qu'un renderer ne peut pas faire pour lui-même. Le reste
 * (quand notifier, quoi écrire) est décidé côté UI — `packages/ui/src/state/replyNotice.ts`
 * — et arrive ici déjà composé.
 *
 * ⚠️ Ce processus n'INVENTE aucun texte à partir de la conversation, et n'en lit aucune :
 * il reçoit un titre et un corps déjà dépourvus de contenu, les borne, et les affiche. La
 * seule donnée qui traverse est l'id du fil, qui ne s'affiche jamais — il sert au retour.
 *
 * Le renderer est non fiable (règle 7) : l'id est renvoyé tel quel à la fenêtre qui l'a
 * fourni, jamais utilisé ici pour ouvrir, lire ou écrire quoi que ce soit.
 */
export function registerNotifyIpc(getWin: () => BrowserWindow | null): void {
  handle("notify:supported", [], () => Notification.isSupported());

  handle("notify:reply", [obj], (_e, raw) => {
    if (!Notification.isSupported()) return { ok: false as const };
    const arg = raw as { conversationId?: unknown; title?: unknown; body?: unknown };
    const convId = typeof arg.conversationId === "string" ? arg.conversationId : "";
    if (!convId) return { ok: false as const };

    const n = new Notification({
      title: text(arg.title, BRAND.name),
      body: text(arg.body, "Réponse prête."),
      silent: false,
    });
    n.on("click", () => {
      const win = getWin();
      if (!win || win.isDestroyed()) return;
      // Rendre la fenêtre visible AVANT de la focaliser : réduite dans le Dock, `focus()`
      // seul ne la restaure pas, et l'app « répond » sans que rien n'apparaisse.
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
      win.webContents.send("notify:activate", convId);
    });
    n.show();
    return { ok: true as const };
  });
}
