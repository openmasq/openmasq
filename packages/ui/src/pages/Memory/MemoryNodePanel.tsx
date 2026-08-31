import { useEffect, useRef, useState } from "react";
import { XIcon, CheckIcon, IconButton } from "../../components/brand";
import { MAX_FACTS_CHARS, MEMORY_CATEGORIES, restoreFact, memoryCategoryLabel } from "../../memory";
import type { MemoryCardUsage } from "../../memory/usage";
import type { GraphNode, MemoryGraphData } from "../../memory/graph";
import { neighborsOf } from "../../memory/graph";
import type { MemoryCard } from "../../types";

import { useT } from "../../i18n";
/**
 * The graph's SELECTION side panel (kit `MemoryPage` right card): what the clicked node
 * is, WHERE it served (« rappelée dans N conversations » + the surprising non-recall
 * explained), its connections (click-through), and — for a card — the editable fields
 * + delete. Presentation only; every mutation goes back through the store's memory
 * CRUD. Editing here IS reviewing, so every card patch stamps `reviewedAt` — the
 * extraction never does, which is what keeps the « À revoir » inbox honest.
 */
export function MemoryNodePanel({
  node,
  graph,
  card,
  usage,
  fresh,
  onConfirm,
  onSelect,
  onClose,
  onUpdate,
  onRemove,
}: {
  node: GraphNode;
  graph: MemoryGraphData;
  /** The backing card when `node` is a leaf. */
  card: MemoryCard | null;
  /** Where the card actually served (`memory/usage.ts`) — null: never recalled. */
  usage?: MemoryCardUsage | null;
  /** The card is in the « À revoir » inbox — offer the explicit Confirmer. */
  fresh?: boolean;
  onConfirm?: (id: string) => void;
  onSelect: (id: string) => void;
  onClose: () => void;
  onUpdate: (id: string, patch: Partial<Omit<MemoryCard, "id" | "createdAt">>) => void;
  onRemove: (id: string) => void;
}) {
  const t = useT();
  const KIND_LABEL = { core: "Racine", hub: "Catégorie", leaf: "Souvenir" } as const;
  const kindLabel = node.kind === "hub" && node.group ? "Groupe" : KIND_LABEL[node.kind];
  const nameRef = useRef<HTMLInputElement>(null);
  const [aliases, setAliases] = useState((card?.aliases ?? []).join(", "));
  useEffect(() => {
    setAliases((card?.aliases ?? []).join(", "));
    // A freshly-created card (empty facts) gets the caret straight into the name.
    if (card && !card.facts) nameRef.current?.select();
  }, [card?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Editing from the panel counts as REVIEWING (the user has the card in front of
  // them) — same commit semantics for every field, alias included.
  const edit = (id: string, patch: Partial<Omit<MemoryCard, "id" | "createdAt">>) =>
    onUpdate(id, { ...patch, reviewedAt: Date.now() });

  const connections = neighborsOf(node.id, graph.edges);
  const linked = graph.nodes.filter((n) => connections.has(n.id));
  const day = (t: number) => new Date(t).toLocaleDateString("fr-FR");

  return (
    <aside className="om-mem-panel om-step-in" aria-label={t.lists.memory.panel.aria}>
      <div className="om-mem-panel-head">
        <span className="om-mem-dot-chip" style={node.tone !== "core" ? { background: `var(--hl-${node.tone})` } : undefined} />
        <span className="cv-eyebrow">{kindLabel}</span>
        <span className="om-skill-spacer" />
        <IconButton label={t.lists.memory.panel.close} size="sm" onClick={onClose}>
          <XIcon size={15} />
        </IconButton>
      </div>

      {card ? (
        <div className="om-mem-panel-body">
          <input
            ref={nameRef}
            className="om-mem-input om-mem-panel-name"
            value={card.entity}
            onChange={(e) => edit(card.id, { entity: e.target.value })}
            aria-label={t.lists.memory.panel.entity}
          />
          {/* Où la fiche a SERVI — ce qui rend la valeur de la mémoire visible, et le
              non-rappel surprenant diagnosticable au lieu d'invisible. */}
          <span className="om-mem-usage">
            {usage && usage.convCount > 0
              ? `Rappelée dans ${usage.convCount} conversation${usage.convCount > 1 ? "s" : ""} · dernière le ${day(usage.lastAt)}`
              : "Jamais rappelée pour l'instant — elle part dès qu'un message mentionne cette entité."}
            {usage?.lastSkip &&
              (usage.lastSkip.reason === "budget"
                ? ` Écartée le ${day(usage.lastSkip.at)}, faute de place dans le budget d'injection.`
                : ` Pas rappelée le ${day(usage.lastSkip.at)} : le prénom seul est un homonyme trop courant — un alias plus distinctif aiderait.`)}
          </span>
          <div className="om-skill-filters" role="radiogroup" aria-label={t.lists.memory.panel.category}>
            {MEMORY_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`om-skill-chip${card.cat === c.id ? " on" : ""}`}
                onClick={() => edit(card.id, { cat: c.id })}
                aria-pressed={card.cat === c.id}
              >
                {memoryCategoryLabel(c.id, t)}
              </button>
            ))}
          </div>
          <textarea
            className="om-mem-textarea"
            value={card.facts}
            maxLength={MAX_FACTS_CHARS}
            rows={4}
            onChange={(e) => edit(card.id, { facts: e.target.value })}
            placeholder={t.lists.memory.panel.factsPlaceholder}
            aria-label={t.lists.memory.panel.facts}
          />
          {/* La borne, DITE — sans elle, celui qui écrit une fiche fleuve découvre la
              compaction en perdant une phrase. Le seuil de 600 n'est pas re-déclaré :
              il vient de la même constante que le maxLength. */}
          <span className="om-mem-limit">
            {card.facts.length}/{MAX_FACTS_CHARS} — une fiche se compacte : au-delà, la
            phrase la plus ancienne passe dans l'historique.
          </span>
          <input
            className="om-mem-input"
            value={aliases}
            onChange={(e) => {
              // Même sémantique que les autres champs : commit à la frappe (les états
              // intermédiaires « Jean,  » se replient d'eux-mêmes au parse suivant).
              setAliases(e.target.value);
              const list = e.target.value.split(",").map((a) => a.trim()).filter(Boolean);
              edit(card.id, { aliases: list.length ? list : undefined });
            }}
            placeholder={t.lists.memory.panel.aliasesPlaceholder}
            aria-label={t.lists.memory.panel.aliases}
          />
          {card.source === "auto" && <span className="om-skill-cat om-mem-auto-badge">{t.lists.memory.panel.autoNoted}</span>}
          {/* L'historique de compaction : ce qu'une mise à jour a REMPLACÉ (deadline
              changée, phrase évincée à saturation). Visible et rétablissable — une
              consolidation qui écrase sa preuve en silence est le défaut mesuré des
              mémoires d'agent, et « Rétablir » est symétrique (la version actuelle
              repasse dans l'historique). */}
          {(card.factsLog?.length ?? 0) > 0 && (
            <div className="om-mem-history">
              <div className="cv-eyebrow">{t.lists.memory.panel.replaced}</div>
              {card.factsLog!.map((e, i) => (
                <div key={`${e.at}-${i}`} className="om-mem-history-row">
                  <span className="om-mem-history-prev">{e.prev}</span>
                  <span className="om-mem-history-meta">
                    {new Date(e.at).toLocaleDateString("fr-FR")}
                    <button
                      type="button"
                      className="om-mem-history-restore"
                      title={t.lists.memory.panel.restoreTip}
                      onClick={() => {
                        const r = restoreFact(card, i);
                        if (r) edit(card.id, r);
                      }}
                    >
                      Rétablir
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="om-mem-panel-body">
          <div className="om-mem-panel-name om-mem-panel-static">{node.label}</div>
          {node.kind === "hub" && node.id !== "profil" && (
            <p className="om-skill-desc">{t.lists.memory.hubDesc(memoryCategoryLabel(node.id.replace("hub-", ""), t))}</p>
          )}
        </div>
      )}

      <div className="om-mem-panel-links">
        <div className="cv-eyebrow">Connexions · {linked.length}</div>
        {linked.map((n) => (
          <button key={n.id} type="button" className="om-mem-link" onClick={() => onSelect(n.id)}>
            <span className="om-mem-dot-chip sm" style={n.tone !== "core" ? { background: `var(--hl-${n.tone})` } : undefined} />
            <span className="om-mem-link-label">{n.label}</span>
          </button>
        ))}
        {linked.length === 0 && <p className="om-skill-desc">{t.lists.memory.panel.noLinks}</p>}
      </div>

      {card && (
        <div className="om-mem-panel-foot">
          {fresh && onConfirm && (
            <button
              type="button"
              className="om-skill-use"
              title={t.lists.memory.confirmTip}
              onClick={() => onConfirm(card.id)}
            >
              <CheckIcon size={13} /> Confirmer
            </button>
          )}
          <button type="button" className="om-skill-use danger" onClick={() => onRemove(card.id)}>
            Supprimer
          </button>
        </div>
      )}
    </aside>
  );
}
