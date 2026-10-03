import { ipcRenderer } from "electron";
import type { ExtractStreamEvent } from "@openmasq/redact/documents";

/** One preview-stream event of a file being read, as the renderer receives it. */
export type ExtractStream = ExtractStreamEvent & { name: string; path?: string };

/**
 * Listens to `files:extract-stream` for the DURATION of ONE invoke, keeping only the events
 * main tagged with THIS call's id (`filesExtractIpc.ts` `streamTo`): the channel is shared by
 * every extraction in flight, the id is what keeps one file's pages out of another's preview.
 * Without a listener, no id is sent and main streams nothing.
 */
export function withExtractStream<T>(
  invoke: (req: string | undefined) => Promise<T>,
  onStream?: (ev: ExtractStream) => void,
): Promise<T> {
  if (!onStream) return invoke(undefined);
  const req = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  const listener = (_e: unknown, p: ExtractStream & { req?: string }) => {
    if (!p || p.req !== req) return;
    const { req: _drop, ...ev } = p;
    onStream(ev as ExtractStream);
  };
  ipcRenderer.on("files:extract-stream", listener);
  return invoke(req).finally(() => ipcRenderer.removeListener("files:extract-stream", listener));
}
