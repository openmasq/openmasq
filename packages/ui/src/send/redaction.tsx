import { createContext, useContext, useMemo, type ReactNode } from "react";
import { pseudonymize } from "@openmasq/redact";
import { useHost } from "../host";
import { makeRedactFn, type RedactFn } from "./redactionEngine";
import type { Settings } from "../types";

const RedactionCtx = createContext<RedactFn | null>(null);

export function RedactionProvider({
  settings,
  orgForcedCategories,
  children,
}: {
  settings: Settings;
  /** The org's MANDATED redaction categories — merged into the document/preview pass so a
   *  member can't switch one off here (the send merges them too). Absent = solo user. */
  orgForcedCategories?: string[];
  children: ReactNode;
}) {
  const host = useHost();

  // The engine-dispatch (remote/model/local/regex) is a pure, unit-testable builder
  // in `./redactionEngine`; this provider only binds it to the current host+settings+org.
  // `orgKey` keeps the memo stable across profile refreshes that return a fresh array.
  const orgKey = orgForcedCategories?.length ? [...orgForcedCategories].sort().join(",") : "";
  const redact = useMemo<RedactFn>(
    () => makeRedactFn(host, settings, orgKey ? orgKey.split(",") : undefined),
    [host, settings, orgKey],
  );

  return (
    <RedactEngineCtx.Provider value={settings.redactEngine}>
      <RedactionCtx.Provider value={redact}>{children}</RedactionCtx.Provider>
    </RedactEngineCtx.Provider>
  );
}

/** The settings-bound pseudonymise. Falls back to regex-only when no provider. */
export function useRedaction(): RedactFn {
  return (
    useContext(RedactionCtx) ??
    ((text: string) => pseudonymize(text, { numbers: false }))
  );
}

/**
 * The redaction engine currently in effect (`patterns` when redaction is off), so
 * a component rendering a failure warning can phrase it correctly — the `remote`
 * (cloud) engine's model key is a SERVER-side secret the user can't set, unlike
 * the local `model` engine. Populated by {@link RedactionProvider}.
 */
const RedactEngineCtx = createContext<Settings["redactEngine"]>("patterns");
export function useRedactEngine(): Settings["redactEngine"] {
  return useContext(RedactEngineCtx);
}

// The failure-message logic is pure (React-free) and lives in `./redactFailure`
// so it's unit-testable; re-exported here for existing `../redaction` importers.
export {
  describeRedactFailure,
  classifyRedactFailure,
  redactFailureIsUserFixable,
  type RedactFailureKind,
} from "./redactFailure";
