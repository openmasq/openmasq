import { AlertIcon } from "../../../../components/brand";
import { BRAND } from "@openmasq/branding";

/**
 * What adding an unvetted MCP server actually costs the user. Every line is a fact
 * about the pipeline, not a disclaimer:
 *
 * - a tool call leaves UN-redacted (root rule 11 — `unredactArgs`; only the MODEL ever
 *   sees a fake), so this server receives the real values it is asked to act on. This is
 *   the line that must never be softened: it is the whole reason the checkbox exists;
 * - its answers re-enter the conversation, and the model acts on them — a hostile server
 *   can try to steer it (prompt injection);
 * - the write confirmation still holds. That is a real, enforced backstop (main's own
 *   un-spoofable window, `apps/desktop/src/main/mcp/writeConfirmWindow.ts`), so say it —
 *   an all-red warning with no true reassurance just trains people to click through.
 *
 * Kept as a component rather than a paragraph in the form so the wording has ONE home:
 * the help site (outside this repo) states the same thing, and the two must not drift.
 */
export function McpCustomWarning() {
  return (
    <div className="mcp-warn">
      <span className="mcp-warn-icon" aria-hidden="true">
        <AlertIcon size={16} />
      </span>
      <div className="mcp-warn-text">
        <p className="mcp-warn-title">Ce service n'est pas vérifié par {BRAND.name}.</p>
        <ul className="mcp-warn-list">
          <li>
            Il reçoit <strong>vos données réelles</strong> : pour qu'un outil agisse
            vraiment, ce qui lui est envoyé est unredacted au dernier moment.
          </li>
          <li>
            Ses réponses reviennent dans la conversation, et le modèle s'en sert : un
            service malveillant peut chercher à le manipuler.
          </li>
          <li>
            {BRAND.name} continue de vous demander confirmation avant toute action qui modifie
            quelque chose.
          </li>
        </ul>
        <p className="mcp-warn-foot">N'ajoutez que des services dont vous connaissez l'origine.</p>
      </div>
    </div>
  );
}
