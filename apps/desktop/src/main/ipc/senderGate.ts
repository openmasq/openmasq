import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from "electron";
import { getMainWindow } from "../mainWindowRef";
import { isAppPageUrl } from "../appPage";
import { guardFaults } from "./hostFault";

/**
 * WHO may call a privileged channel: the TOP frame of THE main window, showing the app's
 * own page (`../appPage.ts`). Only that window carries the IPC preload; every other one
 * (write-confirm, auth, halo, PDF, the agent browser's views) has none, so none is
 * admitted. A sub-frame, another webContents, or the main window after a navigation off
 * the app page is refused BEFORE the handler —
 * capability gates further in assume the caller is the app's own UI.
 * Pinned by `senderGate.test.ts`, `senderGate.listeners.test.ts`, `senderSurface.test.ts`.
 */
export class IpcSenderError extends Error {
  constructor(channel: string) {
    super(`IPC ${channel}: sender is not the app window`);
    this.name = "IpcSenderError";
  }
}

type Event = Pick<IpcMainInvokeEvent | IpcMainEvent, "sender" | "senderFrame">;

export function isTrustedSender(event: Event, mainContents = getMainWindow()?.webContents): boolean {
  let frame: Event["senderFrame"];
  try {
    frame = event.senderFrame;
  } catch {
    return false;
  }
  if (!frame || !mainContents || event.sender !== mainContents) return false;
  if (frame.parent !== null) return false;
  return isAppPageUrl(frame.url);
}

/** Throw (logged without any argument) unless the sender is the app window's top frame. */
export function assertTrustedSender(channel: string, event: Event): void {
  if (isTrustedSender(event)) return;
  console.warn(`[ipc] refused: ${channel} from a sender that is not the app window`);
  throw new IpcSenderError(channel);
}

/** `ipcMain.handle` behind the sender gate — for the modules that validate their own
 *  arguments rather than declaring a `handle()` shape. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function trustedHandle(channel: string, fn: (event: IpcMainInvokeEvent, ...args: any[]) => unknown): void {
  ipcMain.handle(channel, (event, ...args: unknown[]) => {
    assertTrustedSender(channel, event);
    return guardFaults(channel, () => fn(event, ...args));
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OnFn = (event: IpcMainEvent, ...args: any[]) => unknown;

/** An untrusted fire-and-forget message has no caller to throw at: it is DROPPED. A
 *  `sendSync` caller still gets `null` (an unset `returnValue` would block its renderer);
 *  on an async message the property is inert. */
function drop(channel: string, event: IpcMainEvent): void {
  console.warn(`[ipc] dropped: ${channel} from a sender that is not the app window`);
  event.returnValue = null;
}

/** `ipcMain.on` behind the sender gate. */
export function trustedOn(channel: string, fn: OnFn): void {
  ipcMain.on(channel, (event, ...args: unknown[]) => {
    if (!isTrustedSender(event)) return drop(channel, event);
    return fn(event, ...args);
  });
}

/** One-shot reply channel behind the sender gate. Only a TRUSTED message consumes it — a
 *  dropped one leaves it armed for the real reply. Returns the disposer (timeout, window
 *  gone); `ipcMain.removeAllListeners(channel)` disposes it too. */
export function trustedOnce(channel: string, fn: OnFn): () => void {
  const listener = (event: IpcMainEvent, ...args: unknown[]): void => {
    if (!isTrustedSender(event)) return drop(channel, event);
    ipcMain.removeListener(channel, listener);
    fn(event, ...args);
  };
  ipcMain.on(channel, listener);
  return () => ipcMain.removeListener(channel, listener);
}
