import { createContext, useContext } from "react";

/**
 * « Ouvre la modale de CE connecteur », from anywhere.
 *
 * The channel only — no data, no host call. The implementation (the modal,
 * `useMcpConnectors` and all its calls) lives in `pages/Settings/mcp/`, and it's
 * `AppShell` that wires the two together: a `containers/` doesn't reach up into
 * `pages/` for DATA, but the shell is allowed to MOUNT a screen (which is what
 * `shell/sections/` already does). Same wiring as `searchSettings`'s injection
 * into `SearchModal`.
 *
 * ⚠️ `null` = no host mounted (a preview harness, a test) — not an error. Like
 * `linkOpen`, the ABSENCE is the signal: the caller then falls back to its old path
 * (Réglages → Connecteurs) instead of throwing.
 */
const OpenConnectorCtx = createContext<((connectorId: string) => void) | null>(null);

export const OpenConnectorProvider = OpenConnectorCtx.Provider;

/** The connector modal opener, or `null` if nothing mounted it. */
export function useOpenConnector(): ((connectorId: string) => void) | null {
  return useContext(OpenConnectorCtx);
}
