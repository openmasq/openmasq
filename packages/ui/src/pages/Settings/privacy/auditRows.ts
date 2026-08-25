import { redactionCategory } from "@openmasq/redact";
import type { Conversation } from "../../../types";
import { protectedEntries } from "../../../state/protectedCount";
import { conversationKindIndex, kindOf } from "./privacyStats";

/**
 * Le journal de redaction, en données — la vue ne fait que rendre ce que ceci décide.
 *
 * ⚠️ **Le coffre réversible est PAR CONVERSATION, et le journal doit se lire ainsi.**
 * Chaque conversation a son propre sel : la MÊME valeur réelle reçoit un faux différent
 * d'une conversation à l'autre, et un faux ne veut rien dire hors de la sienne. Aplati en
 * une seule liste, le journal montrait donc « Julien Sabourdin » quatre fois avec quatre
 * remplaçants sans jamais dire pourquoi — on y lisait une incohérence du moteur là où
 * c'est justement la garantie : rien ne relie deux conversations entre elles.
 *
 * ⚠️ **La DATE appartient au groupe, jamais à la ligne.** Le coffre n'horodate pas ses
 * entrées ; tout ce qu'on a est le `updatedAt` de la conversation. Répété sur chaque
 * ligne, il promettait l'heure du redaction de CETTE valeur — une précision qu'aucune
 * donnée ne porte. Sur l'en-tête du groupe, il dit ce qu'il est vraiment.
 */

export interface AuditRow {
  id: string;
  convId: string;
  /** Le message où la valeur réelle apparaît — la cible du saut, quand on la trouve. */
  msgId?: string;
  original: string;
  fake: string;
  kind: string;
}

export interface AuditGroup {
  convId: string;
  convTitle: string;
  /** `Conversation.updatedAt` — la seule date que le coffre permette (voir ci-dessus). */
  at: number;
  rows: AuditRow[];
}

/** Les groupes du journal, conversation la plus récente en tête. */
export function buildAuditGroups(conversations: readonly Conversation[]): AuditGroup[] {
  const out: AuditGroup[] = [];
  for (const c of conversations) {
    const index = conversationKindIndex(c);
    const rows: AuditRow[] = [];
    // Même définition que le bouclier et la carte « tout ce qui a été redacted », pour que
    // le compte de cet onglet ne puisse pas diverger des leurs.
    for (const [fake, original] of protectedEntries(c)) {
      // La valeur réelle apparaît telle quelle dans le `content` affiché d'un message (ou
      // dans `modelContent` quand un fichier y a été replié) — on la localise pour ancrer
      // le saut. La PREMIÈRE occurrence gagne.
      const msg = c.messages.find(
        (m) => m.content?.includes(original) || m.modelContent?.includes(original),
      );
      rows.push({
        id: `${c.id}::${fake}`,
        convId: c.id,
        msgId: msg?.id,
        original,
        fake,
        kind: redactionCategory(kindOf(index, original) ?? "secret"),
      });
    }
    if (rows.length) {
      out.push({ convId: c.id, convTitle: c.title || "Nouvelle conversation", at: c.updatedAt, rows });
    }
  }
  return out.sort((a, b) => b.at - a.at);
}

/**
 * Filtrer sans casser les groupes : une conversation dont plus rien ne correspond
 * DISPARAÎT (un en-tête vide se lit comme un groupe sans résultat, pas comme un exclu).
 * Le texte cherché porte aussi sur le TITRE — chercher une conversation garde tout son
 * redaction, ce qui est le geste « montre-moi celle-ci ».
 */
export function filterAuditGroups(
  groups: readonly AuditGroup[],
  opts: { query?: string; kind?: string | null },
): AuditGroup[] {
  const needle = (opts.query ?? "").trim().toLowerCase();
  const out: AuditGroup[] = [];
  for (const g of groups) {
    const byTitle = !!needle && g.convTitle.toLowerCase().includes(needle);
    const rows = g.rows.filter(
      (r) =>
        (!opts.kind || r.kind === opts.kind) &&
        (!needle || byTitle || r.original.toLowerCase().includes(needle)),
    );
    if (rows.length) out.push({ ...g, rows });
  }
  return out;
}

/** Combien de valeurs, tous groupes confondus. */
export const countAuditRows = (groups: readonly AuditGroup[]): number =>
  groups.reduce((n, g) => n + g.rows.length, 0);

/** Les catégories présentes, la plus fournie en tête. */
export function auditKindCounts(groups: readonly AuditGroup[]): { key: string; n: number }[] {
  const counts: Record<string, number> = {};
  for (const g of groups) for (const r of g.rows) counts[r.kind] = (counts[r.kind] ?? 0) + 1;
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([key, n]) => ({ key, n }));
}

/**
 * Les N premières VALEURS, groupes conservés — ce que le défilement infini rend.
 * On compte les lignes, pas les groupes : une conversation à 500 entrées ne doit pas
 * arriver d'un bloc parce qu'elle tient sur un seul en-tête.
 */
export function takeAuditRows(groups: readonly AuditGroup[], limit: number): AuditGroup[] {
  const out: AuditGroup[] = [];
  let left = limit;
  for (const g of groups) {
    if (left <= 0) break;
    out.push(g.rows.length <= left ? g : { ...g, rows: g.rows.slice(0, left) });
    left -= g.rows.length;
  }
  return out;
}
