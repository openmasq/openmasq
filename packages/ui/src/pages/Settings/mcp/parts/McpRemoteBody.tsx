import { useState } from "react";
import { Btn } from "../McpBtn";
import { composeApiKeyUrl, type ApiKeyHelp } from "../mcpApiKeyHelp";
import type { McpItem } from "../mcpItems";

import { useT } from "../../../../i18n";
/**
 * A REMOTE connector that isn't connected yet — either a one-click OAuth /
 * already-configured endpoint (optionally asking for the URL of a custom
 * server), or an API-key one, which gets the "où trouver votre clé" tutorial
 * and a masked key field instead of the raw URL.
 *
 * The key never leaves this form except through the parent's callbacks: per the
 * connector's style it is folded into the endpoint URL (Exa/Tavily) or sent as a
 * Bearer header and stored encrypted (Fireflies). It is `type="password"` and is
 * never logged or echoed.
 */
export function McpRemoteBody({
  item,
  help,
  busy,
  onConnectRemote,
  onConnectApiKey,
  onRemove,
}: {
  item: McpItem;
  /** Present only for an API-key connector with a documented tutorial. */
  help?: ApiKeyHelp;
  busy: boolean;
  onConnectRemote: (url: string) => void;
  onConnectApiKey: (key: string) => void;
  onRemove: () => void;
}) {
  const t = useT();
  const [url, setUrl] = useState(item.url ?? "");
  const [key, setKey] = useState("");
  const needsUrl = !item.url && !item.configured;

  if (help) {
    const submit = () => {
      if (!key.trim()) return;
      if (help.keyIn === "header") onConnectApiKey(key.trim());
      else onConnectRemote(composeApiKeyUrl(item.url ?? "", help, key));
    };
    return (
      <>
        <div className="mcp-apikey-help">
          <div className="mcp-apikey-title">{t.mcpTab.whereKey}</div>
          <ol className="mcp-apikey-steps">
            {help.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          <a className="mcp-apikey-link" href={help.keyUrl} target="_blank" rel="noreferrer">
            {t.mcpTab.getKey}
          </a>
        </div>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder={help.keyLabel}
          className="mcp-url-input"
          autoComplete="off"
        />
        <div className="mcp-modal-actions">
          <Btn
            label={busy ? t.mcpTab.connecting : t.byo.connect}
            onClick={submit}
            disabled={busy || !key.trim()}
            loading={busy}
          />
        </div>
      </>
    );
  }

  return (
    <>
      {needsUrl && (
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t.mcpTab.urlPlaceholder}
          className="mcp-url-input"
        />
      )}
      <div className="mcp-modal-actions">
        {item.configured && (
          <Btn
            label={t.mcpTab.forget}
            onClick={onRemove}
            disabled={busy}
            subtle
            title={t.mcpTab.forgetTip}
          />
        )}
        <Btn
          label={busy ? t.mcpTab.connecting : t.byo.connect}
          onClick={() => onConnectRemote(url)}
          disabled={busy || (needsUrl && !url.trim())}
          loading={busy}
        />
      </div>
    </>
  );
}
