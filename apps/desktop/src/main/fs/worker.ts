// utilityProcess child: the ACTUAL filesystem operations, jailed behind the grant
// gate (grant.ts). Runs in a SEPARATE process from the main app (so a bug here never
// touches the vault/keys/IPC in RAM) and via `utilityProcess.fork` — NOT
// ELECTRON_RUN_AS_NODE — so it works with the `RunAsNode:false` fuse. Node-only (no
// electron API beyond `process.parentPort`, which is why `trash`/`open` live in
// `mainOps.ts` instead). Every path goes through `grant.resolve` FIRST; all ops are
// async + bounded (no event-loop block / OOM).
//
// This file is DISPATCH ONLY. The two op maps are deliberately separate modules and are
// selected by `req.surface`, never by anything inside the op name — see `protocol.ts`.
import { fsErrorText } from "./fsErrorText";
import { makeGrant, type Grant } from "./grant";
import { TOOL_OPS } from "./toolOps";
import { UI_OPS } from "./uiOps";
import { stopWatch } from "./watch";
import type { FsMsg, FsReq } from "./protocol";

// `process.parentPort` is injected by Electron in a utilityProcess child; @types/node
// doesn't know it, so type the minimal surface we use.
interface ParentPort {
  on(ev: "message", cb: (e: { data: FsReq }) => void): void;
  postMessage(msg: FsMsg): void;
}
const parentPort = (process as unknown as { parentPort: ParentPort }).parentPort;

let grant: Grant | null = null;
let grantError = "";
try {
  grant = makeGrant(
    JSON.parse(process.env.FS_ROOTS || "[]") as string[],
    JSON.parse(process.env.FS_DENY || "[]") as string[],
  );
} catch (e) {
  grantError = e instanceof Error ? e.message : String(e);
}
const g = (): Grant => {
  if (!grant) throw new Error(grantError || "filesystem non configuré");
  return grant;
};

const notify = (path: string): void => parentPort.postMessage({ event: "changed", path });

parentPort.on("message", (e) => {
  const { id, surface, op, args } = e.data;
  void (async () => {
    try {
      // The surface picks the MAP. A name arriving on the "tool" surface is looked up
      // ONLY among the MCP tools, so the UI-only ops stay unreachable from the model.
      if (surface === "ui") {
        const h = UI_OPS[op];
        if (!h) throw new Error(`opération filesystem inconnue : ${op}`);
        parentPort.postMessage({ id, ok: true, data: await h(g(), args ?? {}, notify) });
        return;
      }
      const h = TOOL_OPS[op];
      if (!h) throw new Error(`outil filesystem inconnu : ${op}`);
      parentPort.postMessage({ id, ok: true, data: await h(g(), args ?? {}) });
    } catch (err) {
      // Still just dispatch: the FORMATTING of the refusal lives in `fsErrorText.ts`.
      parentPort.postMessage({ id, ok: false, error: fsErrorText(err, surface) });
    }
  })();
});

process.on("exit", stopWatch);
