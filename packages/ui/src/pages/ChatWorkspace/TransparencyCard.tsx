import { AgentCard, AgentCardDesc, AgentCardTitle, GlyphTile } from "../../components/agent/AgentCard";
import { ArrowRightIcon, EyeIcon, ShieldIcon } from "../../components/brand";

/**
 * L'encart de TRANSPARENCE — montré UNE FOIS, après la première réponse d'une
 * conversation qui a réellement protégé quelque chose.
 *
 * Audit du 27/07 : le produit tenait sa promesse sans jamais proposer de la vérifier.
 * Le survol d'une marque et la ligne sous chaque message existaient déjà, mais il faut
 * savoir qu'ils existent ; le comparatif entier, lui, vivait dans un journal réservé à
 * l'équipe. Cet encart est le seul moment où le produit dit « allez voir », et il le dit
 * quand la preuve vient d'être produite.
 *
 * ⚠️ Il ne revient jamais (`Settings.transparencySeen`). Un bandeau de réassurance qui
 * se répète cesse d'être lu, et devient le bruit dont l'utilisateur apprend à se
 * débarrasser — l'inverse de ce qu'il vient chercher. Ensuite, la ligne sous chaque
 * message suffit, et le comparatif reste dans le menu ⋯ de la conversation.
 *
 * Il compose `AgentCard` comme les autres conteneurs in-chat : une famille, pas une
 * boîte de plus (voir `components/CLAUDE.md`).
 */
export function TransparencyCard({
  count,
  modelName,
  onOpen,
  onDismiss,
}: {
  /** Nombre de valeurs distinctes protégées dans cette conversation. */
  count: number;
  modelName?: string;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  return (
    <AgentCard
      className="transparency-card"
      role="group"
      ariaLabel="Ce que le modèle a vu"
      eyebrow="Transparence"
      tile={
        <GlyphTile>
          <ShieldIcon size={18} />
        </GlyphTile>
      }
      footer={
        <>
          <span className="agent-card-note">
            <EyeIcon size={13} />
            <span>Rien à activer : c'est déjà ce qui s'est passé.</span>
          </span>
          <span className="agent-card-spacer" />
          <button className="btn-ghost btn-inline" onClick={onDismiss}>
            Plus tard
          </button>
          <button className="btn-primary btn-inline" onClick={onOpen}>
            Voir ce que le modèle a vu <ArrowRightIcon size={14} />
          </button>
        </>
      }
    >
      <AgentCardTitle>
        {count} information{count === 1 ? "" : "s"} protégée{count === 1 ? "" : "s"} pendant cet
        échange
      </AgentCardTitle>
      <AgentCardDesc>
        {modelName ?? "Le modèle"} n'a jamais reçu ces valeurs : elles ont été remplacées par des
        pseudonymes avant l'envoi, puis rétablies dans la réponse que vous lisez. Ouvrez le
        comparatif pour voir votre message et ce qui est réellement parti, côte à côte.
      </AgentCardDesc>
    </AgentCard>
  );
}
