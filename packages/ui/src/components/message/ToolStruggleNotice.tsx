import { connectorBrandName } from "@openmasq/catalog/mcp";
import { connectorPresentation, splitToolName } from "../ToolTrace";
import { RefreshIcon } from "../brand";
import { useOpenConnector } from "../../containers/providers/connectors";
import { humanToolLabel } from "../../agent/humanToolLabel";
import { connectorOfTool, type ToolStruggle } from "../../agent/toolStruggle";

import { useT } from "../../i18n";
/**
 * The caption under a turn whose tool calls went wrong — and its ONE job is to name
 * the right culprit, because each cause needs a different move from the user.
 *
 * « Changez de modèle » is only ever true for `no_tool_used` and `arg_error`. Told
 * about `unknown_tool` it is nonsense (no model can call a tool that doesn't exist),
 * and told about `connector_error` it is actively costly: the loop has already checked
 * that the arguments matched the tool's own schema, so a capable model sends the very
 * same call and meets the very same refusal. That is the case behind the reported
 * Google Agenda turn — the app blamed a free model for a 400 it had no part in.
 *
 * ⚠️ Naming the culprit is only half the job — the fix has to be REACHABLE. An expired
 * OAuth token is the most common `connector_error` there is, and the caption used to end
 * on « Ouvrez Réglages → Connecteurs » : a screen the user must find, then recognise which
 * of a dozen connectors failed, from a message that already said which one. The button
 * opens THAT connector's card, from the turn that failed.
 *
 * `useOpenConnector()` is a channel with a null default (like `useLinkOpen`), so this leaf
 * stays mountable with no provider — a preview harness or a test gets the old sentence
 * instead of a button. That fallback is why the prose still names the destination itself.
 *
 * ⚠️ **Nothing here speaks the language of code.** The caption addresses someone who wanted
 * to read their e-mails, not debug a call: the connector is named by its BRAND
 * (`connectorBrandName`) and the action by its French label (`humanToolLabel`, the sole
 * translator — the same one as the trace just above, so the two answer each other). The
 * tool's technical name only survives in the tooltip, where it serves support without
 * cluttering the sentence. We also don't say « les arguments envoyés étaient conformes »
 * nor « le détail figure au journal si vous l'avez activé »: one explains our
 * plumbing, the other points to a setting the person doesn't have — neither one
 * tells them what to DO.
 */
export function ToolStruggleNotice({
  struggle,
  modelName,
}: {
  struggle: ToolStruggle;
  modelName?: string;
}) {
  const t = useT();
  const who = modelName ?? "Ce modèle";
  const openConnector = useOpenConnector();
  // ⚠️ The connector comes from the tool's NAME (`connectorOfTool`), not from `struggle.server`
  // — that one used to hold « ipc » (the MCP client's transport id), hence « Ipc a refusé
  // l'appel… ». Deriving it HERE also repairs messages ALREADY recorded with « ipc ».
  const connectorId = connectorOfTool(struggle.tool, struggle.server);
  const connector = connectorBrandName(connectorId) ?? connectorPresentation(connectorId).name;
  // The action, in French: « Recherche · e-mails » rather than `gmail__search_messages`.
  const action = struggle.tool ? humanToolLabel(connectorId, splitToolName(struggle.tool).tool) : "";
  // The two causes that get resolved INSIDE the connector's card: an expired token for
  // one, an action that requires your own keys for the other. The other two are down
  // to the model — offering « Reconnecter » there would send to the wrong place.
  const fixableHere = struggle.kind === "connector_error" || struggle.kind === "unknown_tool";
  const canOpen = fixableHere && !!openConnector && !!connectorId;

  return (
    <div
      className="shield-caption warn"
      title={struggle.tool ? `Un appel d'outil n'a pas abouti : ${struggle.tool}` : "Un appel d'outil n'a pas abouti"}
    >
      <span aria-hidden>⚠️</span>
      <span className="flex-min">
        {struggle.kind === "unknown_tool" ? (
          <>
            {t.conversation.struggle.unknownTool(connector, action)}{" "}
            {canOpen
              ? t.conversation.struggle.ownKeysHint
              : t.conversation.struggle.ownKeysHintWithPath}
          </>
        ) : struggle.kind === "connector_error" ? (
          <>
            {t.conversation.struggle.connectorError(connector, action)}{" "}
            {canOpen
              ? t.conversation.struggle.reconnect
              : t.conversation.struggle.reconnectWithPath}
          </>
        ) : struggle.kind === "no_tool_used" ? (
          t.conversation.struggle.noToolUsed(who)
        ) : (
          t.conversation.struggle.badCall(who, action)
        )}
      </span>
      {canOpen && (
        <button
          type="button"
          className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--radius-sm)] border border-border-default bg-surface-card text-body text-xs font-semibold cursor-pointer hover:bg-surface-hover transition-colors"
          title={t.conversation.struggle.reconnectTip(connector)}
          onClick={() => openConnector?.(connectorId)}
        >
          <RefreshIcon size={12} /> {t.conversation.struggle.reconnectCta}
        </button>
      )}
    </div>
  );
}
