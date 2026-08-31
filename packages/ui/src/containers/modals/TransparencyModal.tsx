import { toSegments, wireSegments, type RedactionSegment } from "@openmasq/redact";
import { ModalShell } from "./ModalShell";
import { EyeIcon, IconButton, ShieldIcon, XIcon } from "../../components/brand";
import { transparencyPairs, type TransparencyPair } from "../../privacy/transparency";
import { conversationProtectedCount } from "../../state/protectedCount";
import { useT } from "../../i18n";
import type { Conversation } from "../../types";

/**
 * « Voyez ce que le modèle a vu » — votre message et sa contrepartie, côte à côte.
 *
 * Demandé par l'audit du 27/07 : la garantie du produit était vérifiable au survol
 * d'une marque, valeur par valeur, ou dans un journal technique réservé à l'équipe.
 * Personne d'extérieur ne pouvait lire les DEUX textes entiers l'un en face de l'autre
 * — la seule forme qui répond vraiment à « qu'est-ce qui est parti ? ».
 *
 * ⚠️ Les deux colonnes sont RECALCULÉES depuis le texte réel et le coffre
 * (`transparencyPairs` → `applyVault`), la même substitution que l'envoi. Ne jamais la
 * remplacer par une copie du wire prise au moment du send : une copie peut diverger de
 * ce qui part réellement, et une preuve qui diverge de la chose prouvée ne prouve rien.
 */
export function TransparencyModal({
  conversation,
  modelName,
  onClose,
}: {
  conversation: Conversation;
  modelName?: string;
  onClose: () => void;
}) {
  const pairs = transparencyPairs(conversation);
  const kinds = conversation.redactionKinds;
  const vault = conversation.redactionVault ?? {};
  // La définition unique (`state/protectedCount.ts`) : une VALEUR protégée, pas une entrée
  // de coffre — celui-ci porte les alias d'une même valeur, et ce panneau est justement
  // celui où le chiffre annoncé se compte à l'écran.
  const total = conversationProtectedCount(conversation);
  const t = useT();

  return (
    <ModalShell onClose={onClose} width="880px" maxHeight="84vh">
      <div className="rlog-head">
        <span className="rlog-icon">
          <ShieldIcon size={18} />
        </span>
        <div className="rlog-head-text">
          <div className="rlog-title">{t.modals.transparency.title}</div>
          <div className="rlog-sub">
            {t.modals.transparency.sub(total, modelName ?? t.modals.transparency.theModel)}
          </div>
        </div>
        <IconButton label={t.modals.transparency.close} size="sm" onClick={onClose}>
          <XIcon size={18} />
        </IconButton>
      </div>

      <div className="rlog-body">
        {pairs.length === 0 ? (
          <div className="rlog-empty">{t.modals.transparency.empty}</div>
        ) : (
          <div className="tsp-list">
            {pairs.map((p) => (
              <PairRow key={p.id} pair={p} vault={vault} kinds={kinds} />
            ))}
          </div>
        )}
      </div>
    </ModalShell>
  );
}

function PairRow({
  pair,
  vault,
  kinds,
}: {
  pair: TransparencyPair;
  vault: Record<string, string>;
  kinds?: Record<string, string>;
}) {
  // ⚠️ Les en-têtes SUIVENT le rôle. Sur une réponse, « ce que vous avez écrit » serait
  // faux des deux côtés : la gauche est ce que VOUS LISEZ (rétabli), la droite ce que le
  // modèle a réellement PRODUIT — il n'a jamais tenu que des pseudonymes, à l'aller comme
  // au retour. Un libellé qui ment sur ce panneau-ci ruinerait précisément ce qu'il prouve.
  const isUser = pair.role === "user";
  const leftHead = isUser ? "Ce que vous avez écrit" : "Ce que vous lisez";
  const rightHead = isUser ? "Ce que le modèle a reçu" : "Ce que le modèle a écrit";

  return (
    <div className="tsp-pair">
      <div className="tsp-pair-head">
        <span className="cv-eyebrow">{isUser ? "Votre message" : "Réponse"}</span>
        <span className="tsp-pair-count">
          {pair.swapped} remplacement{pair.swapped === 1 ? "" : "s"}
        </span>
      </div>
      <div className="tsp-cols">
        <div className="tsp-col">
          <div className="tsp-col-head">
            <ShieldIcon size={13} />
            <span>{leftHead}</span>
          </div>
          <p className="tsp-text">
            {/* Les valeurs RÉELLES, surlignées à leur couleur de catégorie. */}
            <Segments segments={toSegments(pair.real, vault, kinds)} />
          </p>
        </div>
        <div className="tsp-col tsp-col-wire">
          <div className="tsp-col-head">
            <EyeIcon size={13} />
            <span>{rightHead}</span>
          </div>
          <p className="tsp-text">
            {/* `wireSegments` surligne les PSEUDONYMES : c'est la forme partie. */}
            <Segments segments={wireSegments(pair.wire, vault, kinds)} />
          </p>
        </div>
      </div>
    </div>
  );
}

/** Segments → texte + marques. Volontairement SANS `data-real` : ce panneau MONTRE, il
 *  ne propose pas de unredact — le survol qui ouvre le menu d'action vit dans la
 *  conversation, où l'action a un sens. */
function Segments({ segments }: { segments: RedactionSegment[] }) {
  return (
    <>
      {segments.map((s, i) =>
        s.kind === "text" ? (
          <span key={i}>{s.value}</span>
        ) : (
          <mark key={i} className={`redaction-mark hl-${s.tone ?? "slate"}`} data-kind={s.label ?? "sensitive"}>
            {s.value}
          </mark>
        ),
      )}
    </>
  );
}
