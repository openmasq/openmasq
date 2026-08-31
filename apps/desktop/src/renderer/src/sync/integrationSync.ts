/**
 * Desktop orchestration of the synced integrations DIRECTORY. Emission diffs
 * the LOCALLY-connected MCP servers against a per-account ledger and pushes
 * `integration`/`integrationTombstone` records on the reserved scope; the pull
 * side feeds the Settings "Connect on this device" section. Config only —
 * the allow-list in `@openmasq/sync` `integrations.ts` guarantees no URL, no
 * key, no token ever rides a record; the receiving device re-grants OAuth
 * itself, per device.
 */
import Debug from "debug";
import { BRAND } from "@openmasq/branding";
import type { McpServerInfo } from "@openmasq/ui";
import {
  applyIntegrationRecords,
  emitIntegrationRecords,
  emptyIntegrationSyncState,
  type IntegrationSyncState,
  type SyncedIntegration,
} from "@openmasq/sync";
import { authHost } from "../auth";
import { recordSync, syncDeviceId } from "./client";

const debug = Debug("openmasq:sync");

const stateKey = (accountId: string) => `${BRAND.slug}:integ-sync:${accountId}`;

function loadState(accountId: string): IntegrationSyncState {
  try {
    const raw = localStorage.getItem(stateKey(accountId));
    if (raw) {
      const s = JSON.parse(raw) as IntegrationSyncState;
      if (s.accountId === accountId) return s;
    }
  } catch {
    /* fresh ledger → an idempotent re-emit at worst */
  }
  return emptyIntegrationSyncState(accountId);
}

const toDirectory = (servers: McpServerInfo[]): SyncedIntegration[] =>
  servers
    .filter((s) => s.connected)
    .map((s) => ({
      id: s.id,
      connectorId: s.connectorId ?? s.id,
      name: s.name,
      kind: s.kind,
      ...(s.label ? { label: s.label } : {}),
    }));

/** Push the directory delta for the currently-connected servers. */
export async function pushIntegrationDirectory(servers: McpServerInfo[]): Promise<void> {
  const rs = recordSync();
  if (!rs) return;
  const account = (await authHost.getSession().catch(() => null))?.id;
  if (!account) return;
  const state = loadState(account);
  const { records, state: next } = emitIntegrationRecords(
    toDirectory(servers),
    state,
    syncDeviceId(),
  );
  if (!records.length) return;
  const pushed = await rs.pushIntegrations(records);
  if (pushed > 0) {
    debug("integration directory: pushed %d record(s)", pushed);
    try {
      localStorage.setItem(stateKey(account), JSON.stringify(next));
    } catch {
      /* best-effort */
    }
  }
}

/** The account's full directory (all devices), for the Settings section. */
export async function pullSyncedIntegrations(): Promise<SyncedIntegration[]> {
  const rs = recordSync();
  if (!rs) return [];
  const { records } = await rs.pullIntegrations(0);
  return applyIntegrationRecords(records);
}
