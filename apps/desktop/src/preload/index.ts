// Ouvre le pont IPC du SDK Sentry : le CSP du renderer n'autorise PAS Sentry comme
// hôte, donc le renderer NE PEUT PAS émettre lui-même — il passe par main, qui détient
// le DSN. Sous `contextIsolation` cet import est le seul moyen d'exposer le pont.
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
