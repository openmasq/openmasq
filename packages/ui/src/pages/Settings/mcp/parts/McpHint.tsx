import { ShieldIcon } from "../../../../components/brand";
import { authTagOf } from "../mcpAuth";
import { connectorErrorText } from "../connectorErrorText";
import type { McpItem } from "../mcpItems";

/**
 * The kit's lime privacy block. Two facts, always: HOW this connector
 * authenticates (the shared catalog tag's own explanation — rule 9, no second
 * copy of that sentence), and the standing promise that the redaction covers
 * what is exchanged with it (tool arguments and results go through the same
 * vault as a message — `packages/mcp/src/redact/client.ts`).
 *
 * ⚠️ **Sur une autorisation EXPIRÉE, la première phrase change.** Elle était
 * inconditionnelle, si bien qu'après « Refresh token is invalid. » l'utilisateur lisait
 * « vous acceptez, et c'est fini. Rien à créer. » — la phrase d'un PREMIER branchement,
 * juste sous l'annonce d'une panne (journal du 15/08). Ce qu'il lui faut alors n'est pas
 * comment ça marchera, c'est quoi faire — et surtout que « Oublier » n'est PAS ce geste.
 * La promesse de redaction, elle, ne bouge jamais : elle vaut dans les deux états.
 */
export function McpHint({ item }: { item: McpItem }) {
  const expired = item.error ? connectorErrorText(item.error)?.reconnect : false;
  return (
    <div className="mcp-hint">
      <span className="mcp-hint-icon" aria-hidden="true">
        <ShieldIcon size={16} />
      </span>
      <p className="mcp-hint-text">
        {expired
          ? "Reconnectez-vous ci-dessous : votre configuration est conservée, il n'y a rien à recréer."
          : authTagOf(item).title}{" "}
        Comme ailleurs, vos données sensibles sont masquées avant tout échange avec ce
        service.
      </p>
    </div>
  );
}
