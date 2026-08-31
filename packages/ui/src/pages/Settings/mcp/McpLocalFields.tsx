import { useState } from "react";
import type { McpCatalogEntry } from "../../../host";
import { Btn } from "./McpBtn";
import { BRAND } from "@openmasq/branding";

import { useT } from "../../../i18n";
/**
 * The LOCAL (stdio) server setup fields — the read-only command line, declared env
 * inputs, and native directory-grant pickers — plus the "Connecter" action. Lifted
 * out of the old row so the connector detail modal renders it directly. Secret env
 * values are sent to main on connect and stored encrypted; never kept in the
 * renderer beyond this form's local state.
 */
export function McpLocalFields({
  entry,
  busy,
  onConnect,
  onPickDir,
}: {
  entry: McpCatalogEntry;
  busy?: boolean;
  onConnect: (env: Record<string, string>, params: Record<string, string | string[]>) => void;
  onPickDir: () => Promise<string | undefined>;
}) {
  const t = useT();
  const [env, setEnv] = useState<Record<string, string>>({});
  const [params, setParams] = useState<Record<string, string | string[]>>({});

  const dirsOf = (key: string): string[] => {
    const v = params[key];
    return Array.isArray(v) ? v : v ? [v] : [];
  };
  const missingRequired =
    entry.env.some((f) => f.required && !env[f.key]?.trim()) ||
    (entry.params ?? []).some((p) => p.required && dirsOf(p.key).length === 0);

  const addDir = async (p: { key: string; multiple?: boolean }) => {
    const dir = await onPickDir();
    if (!dir) return;
    setParams((s) => {
      if (!p.multiple) return { ...s, [p.key]: dir };
      const cur = dirsOf(p.key);
      return cur.includes(dir) ? s : { ...s, [p.key]: [...cur, dir] };
    });
  };
  const removeDir = (key: string, dir: string) =>
    setParams((s) => ({ ...s, [key]: dirsOf(key).filter((d) => d !== dir) }));

  return (
    <div className="mcp-local-fields">
      {entry.inProcess ? (
        <p className="mcp-cmd-note">{t.mcpTab.runsInternally(BRAND.name)}</p>
      ) : (
        <code className="mcp-cmd">$ {entry.commandLine}</code>
      )}
      {entry.env.map((f) => (
        <input
          key={f.key}
          type={f.secret ? "password" : "text"}
          value={env[f.key] ?? ""}
          onChange={(e) => setEnv((s) => ({ ...s, [f.key]: e.target.value }))}
          placeholder={`${f.label}${f.placeholder ? ` (${f.placeholder})` : ""}`}
          className="mcp-url-input"
        />
      ))}
      {(entry.params ?? []).map((p) => {
        const dirs = dirsOf(p.key);
        return (
          <div key={p.key} className="mcp-param">
            {dirs.map((d) => (
              <div key={d} className="flex items-center gap-2">
                <code className="mcp-cmd flex-min">{d}</code>
                <button
                  type="button"
                  className="opacity-60 hover:opacity-100"
                  onClick={() => removeDir(p.key, d)}
                  aria-label={t.mcpTab.removeDir(d)}
                  title={t.mcpTab.remove}
                >
                  ✕
                </button>
              </div>
            ))}
            <Btn
              label={p.multiple && dirs.length ? t.mcpTab.addDir : t.mcpTab.chooseDir(p.label)}
              onClick={() => addDir(p)}
              subtle
            />
          </div>
        );
      })}
      {entry.note && (
        <div className="mcp-rownote">
          {entry.note}
          {entry.setupUrl && (
            <>
              {" "}
              <a href={entry.setupUrl} target="_blank" rel="noreferrer">
                {t.mcpTab.guide}
              </a>
            </>
          )}
        </div>
      )}
      <div className="mcp-modal-actions">
        <Btn
          label={busy ? t.mcpTab.connecting : t.mcpTab.connect.replace(" →", "")}
          onClick={() => onConnect(env, params)}
          disabled={busy || missingRequired}
          loading={busy}
        />
      </div>
    </div>
  );
}
