import { connectorBrandName } from "@openmasq/catalog/mcp";
import { connectorPresentation, splitToolName } from "../ToolTrace";
import { RefreshIcon } from "../brand";
import { useOpenConnector } from "../../containers/providers/connectors";
import { humanToolLabel } from "../../agent/humanToolLabel";
import { connectorOfTool, type ToolStruggle } from "../../agent/toolStruggle";

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
 * ⚠️ **Rien ici ne parle la langue du code.** La légende s'adresse à quelqu'un qui voulait
 * lire ses e-mails, pas déboguer un appel : le connecteur est nommé par sa MARQUE
 * (`connectorBrandName`) et l'action par son libellé français (`humanToolLabel`, l'unique
 * traducteur — le même que la trace juste au-dessus, pour que les deux se répondent). Le
 * nom technique de l'outil ne subsiste que dans l'infobulle, où il sert au support sans
 * encombrer la phrase. On ne dit pas non plus « les arguments envoyés étaient conformes »
 * ni « le détail figure au journal si vous l'avez activé » : l'un explique notre
 * plomberie, l'autre renvoie à un réglage que la personne n'a pas — ni l'un ni l'autre ne
 * lui dit quoi FAIRE.
 */
export function ToolStruggleNotice({
  struggle,
  modelName,
}: {
  struggle: ToolStruggle;
  modelName?: string;
}) {
  const who = modelName ?? "Ce modèle";
  const openConnector = useOpenConnector();
  // ⚠️ Le connecteur vient du NOM de l'outil (`connectorOfTool`), pas de `struggle.server`
  // — celui-ci valait « ipc » (l'id de transport du client MCP), d'où « Ipc a refusé
  // l'appel… ». Le dériver ICI répare aussi les messages DÉJÀ enregistrés avec « ipc ».
  const connectorId = connectorOfTool(struggle.tool, struggle.server);
  const connector = connectorBrandName(connectorId) ?? connectorPresentation(connectorId).name;
  // L'action, en français : « Recherche · e-mails » plutôt que `gmail__search_messages`.
  const action = struggle.tool ? humanToolLabel(connectorId, splitToolName(struggle.tool).tool) : "";
  // Les deux causes qui se règlent DANS la fiche du connecteur : un jeton expiré pour
  // l'une, une action qui réclame vos propres clés pour l'autre. Les deux autres tiennent
  // au modèle — y proposer « Reconnecter » enverrait au mauvais endroit.
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
            {connector} ne sait pas faire «&nbsp;{action}&nbsp;» — cette action n&apos;existe pas
            dans le connecteur.{" "}
            {canOpen ? (
              <>Certaines ne s&apos;activent qu&apos;avec vos propres clés d&apos;accès.</>
            ) : (
              <>
                Ouvrez sa fiche dans Réglages → Connecteurs&nbsp;: certaines ne s&apos;activent
                qu&apos;avec vos propres clés d&apos;accès.
              </>
            )}
          </>
        ) : struggle.kind === "connector_error" ? (
          <>
            {connector} a refusé l&apos;action «&nbsp;{action}&nbsp;». Le modèle n&apos;y est pour
            rien&nbsp;: en changer ne changerait rien. Le plus souvent, l&apos;accès au compte a
            expiré —{" "}
            {canOpen ? (
              <>reconnectez-le, puis relancez votre demande.</>
            ) : (
              <>reconnectez-le dans Réglages → Connecteurs, puis relancez votre demande.</>
            )}
          </>
        ) : struggle.kind === "no_tool_used" ? (
          <>
            {who} a répondu sans se servir de vos connecteurs. Un modèle plus à l&apos;aise avec
            les outils (Claude, par exemple) s&apos;en sert mieux&nbsp;: changez de modèle sous le
            message, puis relancez.
          </>
        ) : (
          <>
            {who} n&apos;a pas réussi à formuler l&apos;action «&nbsp;{action}&nbsp;». Un modèle
            plus à l&apos;aise avec les outils (Claude, par exemple) y parvient souvent&nbsp;:
            changez de modèle sous le message.
          </>
        )}
      </span>
      {canOpen && (
        <button
          type="button"
          className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--radius-sm)] border border-border-default bg-surface-card text-body text-xs font-semibold cursor-pointer hover:bg-surface-hover transition-colors"
          title={`Ouvrir la fiche ${connector} pour reconnecter le compte`}
          onClick={() => openConnector?.(connectorId)}
        >
          <RefreshIcon size={12} /> Reconnecter
        </button>
      )}
    </div>
  );
}
