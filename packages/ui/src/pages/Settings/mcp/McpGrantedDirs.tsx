import { useState } from "react";
import type { McpCatalogEntry } from "../../../host";
import { Btn } from "./McpBtn";

import { useT } from "../../../i18n";
/**
 * An ALREADY-connected local server's granted folders, with add and remove.
 *
 * Why on the connected card, and not only in the connect form: the list used to be
 * composed just once, at connection time. Adding a second folder required disconnecting
 * everything then re-granting each folder one by one — a full revocation for one
 * addition. Nobody does that; they give up on the folder.
 *
 * Removal is immediate on the host side (the connector is rebuilt with the new
 * scope), so this button really removes access, it doesn't remove it "on the next
 * launch". That's also why the error the host returns is displayed here exactly as
 * received: a revocation that fails must be visible.
 */
export function McpGrantedDirs({
  entry,
  params,
  onPickDir,
  onSetDirs,
}: {
  entry: McpCatalogEntry;
  /** The currently granted folders, by parameter key. */
  params?: Record<string, string[]>;
  onPickDir: () => Promise<string | undefined>;
  onSetDirs: (key: string, dirs: string[]) => Promise<string | undefined>;
}) {
  const t = useT();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fields = (entry.params ?? []).filter((p) => p.kind === "directory");
  if (!fields.length) return null;

  const apply = async (key: string, dirs: string[]) => {
    setBusyKey(key);
    setError(null);
    try {
      setError((await onSetDirs(key, dirs)) ?? null);
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="mcp-granted-dirs">
      {fields.map((p) => {
        const dirs = params?.[p.key] ?? [];
        const busy = busyKey === p.key;
        return (
          <div key={p.key} className="mcp-param">
            <div className="mcp-rownote">{p.label}</div>
            {dirs.map((d) => (
              <div key={d} className="flex items-center gap-2">
                <code className="mcp-cmd flex-min">{d}</code>
                <button
                  type="button"
                  className="opacity-60 hover:opacity-100"
                  onClick={() =>
                    apply(
                      p.key,
                      dirs.filter((x) => x !== d),
                    )
                  }
                  // A required folder can't be removed if it's the last one: the host
                  // would refuse, so don't bother offering the gesture.
                  disabled={busy || (!!p.required && dirs.length === 1)}
                  aria-label={t.mcpTab.removeDir(d)}
                  title={p.required && dirs.length === 1 ? t.mcpTab.atLeastOneDir : t.mcpTab.remove}
                >
                  ✕
                </button>
              </div>
            ))}
            <Btn
              label={busy ? t.mcpTab.updating : t.mcpTab.addDir}
              onClick={async () => {
                const dir = await onPickDir();
                if (!dir || dirs.includes(dir)) return;
                await apply(p.key, [...dirs, dir]);
              }}
              disabled={busy}
              loading={busy}
              subtle
            />
          </div>
        );
      })}
      {error && <div className="mcp-modal-error">{error}</div>}
    </div>
  );
}
