// Opens the Sentry SDK's IPC bridge: the renderer's CSP does NOT allow Sentry as a
// host, so the renderer CANNOT emit on its own — it goes through main, which holds
// the DSN. Under `contextIsolation` this import is the only way to expose the bridge.
import "@sentry/electron/preload";
import { contextBridge } from "electron";
import { chat } from "./api/chat";
import { mcp } from "./api/mcp";
import { browser } from "./api/browser";
import { db, embeddings, memoryIndex, files } from "./api/data";
import { cloudFs } from "./api/cloudfs";
import { localFs } from "./api/localfs";
import { keys, sync, authStore } from "./api/secrets";
import { media, notify, claudeSkills, links, python, pdf, web, models, auth, billing, onAppError, onAppEvent, app, updates, env } from "./api/system";

export * from "./types";

// The entire main↔renderer bridge, composed from per-namespace modules (hard rule 2).
// The chat surface (`startChat`/`complete`/…) is spread at the top level; every other
// capability is a namespace. Wire strings + the exposed shape are IDENTICAL to the
// former single-file preload, so `OpenMasqApi` (= typeof api) is unchanged.
const api = {
  ...chat,
  keys,
  sync,
  authStore,
  media,
  notify,
  claudeSkills,
  links,
  python,
  pdf,
  web,
  models,
  mcp,
  browser,
  db,
  embeddings,
  memoryIndex,
  files,
  localFs,
  cloudFs,
  auth,
  billing,
  onAppError,
  onAppEvent,
  app,
  updates,
  env,
};

contextBridge.exposeInMainWorld("openmasq", api);

export type OpenMasqApi = typeof api;
