import type { MemoryCard, MemoryData } from "../types";
import { CLUSTER_MIN_SIM, PERSON_PAIR_MIN_SIM, type SemanticEdge } from "./cluster";
import { crossLinks } from "./graph";
import { DUPLICATE_MIN_SIM } from "./dedupe";
import { BRAND } from "@openmasq/branding";

/**
 * The Mémoire as a plain-text dump, for DEBUGGING.
 *
 * What makes it worth a file rather than a screenshot is the LINKS. Three things a first
 * version got wrong, and that a real export (13 cards, 26 edges) made obvious:
 *
 *  1. It listed the RAW kNN edges as if they were the graph. They aren't: `strongSemEdges`
 *     keeps ≥ `CLUSTER_MIN_SIM`, and a personne↔personne pair needs the higher
 *     `PERSON_PAIR_MIN_SIM`. Eight of those 26 edges survived — reading the list without
 *     the bars told the opposite story.
 *  2. It showed only the SEMANTIC half. The graph also draws MENTION links (a card whose
 *     facts name another entity), which is where real groupings come from — so « Laura has
 *     no link to Vera » was an artefact of the export, not a fact about the memory.
 *  3. It sorted globally by similarity, which answers « which pair is closest » but never
 *     « what is this card connected to » — the question you actually open the file with.
 *
 * ⚠️ It holds the memory VERBATIM, which is REAL data (the Mémoire is stored un-redacted
 * on the machine and only re-redacted at injection). Local file, explicit click — never
 * send it anywhere, and the warning is inside the file so a stray copy still carries it.
 */
export interface MemoryExportInput {
  memoryData: MemoryData;
  /** Semantic edges from the on-device index (raw kNN). Absent ⇒ the export says so
   *  rather than implying the memory has no links. */
  edges?: readonly SemanticEdge[] | null;
  /** Injected so the output is deterministic in tests. */
  now?: Date;
}

/** The bar a pair must clear to stay in the graph — higher between two people. */
export function barFor(a: MemoryCard | undefined, b: MemoryCard | undefined): number {
  return a?.cat === "personne" && b?.cat === "personne"
    ? Math.max(CLUSTER_MIN_SIM, PERSON_PAIR_MIN_SIM)
    : CLUSTER_MIN_SIM;
}

const line = (n = 60) => "─".repeat(n);
const fmtDate = (ms: number): string => (ms ? new Date(ms).toISOString() : "—");

function cardBlock(c: MemoryCard, index: number): string {
  const out = [
    `[${index}] ${c.entity}`,
    `    id        ${c.id}`,
    `    catégorie ${c.cat}`,
    `    source    ${c.source ?? "utilisateur"}`,
  ];
  if (c.aliases?.length) out.push(`    alias     ${c.aliases.join(" · ")}`);
  out.push(`    créée     ${fmtDate(c.createdAt)}`);
  out.push(`    modifiée  ${fmtDate(c.updatedAt)}`);
  out.push(`    faits     ${c.facts || "(vide)"}`);
  return out.join("\n");
}

interface Row {
  other: string;
  /** `sem` carries a cosine; `mention` is structural (no score). */
  kind: "sem" | "mention";
  sim?: number;
  bar?: number;
  kept: boolean;
}

/** One card's neighbourhood, strongest first, mentions last (they have no score). */
function neighbourhood(rows: Row[]): string[] {
  const sorted = [...rows].sort(
    (x, y) => Number(y.kind === "sem") - Number(x.kind === "sem") || (y.sim ?? 0) - (x.sim ?? 0),
  );
  return sorted.map((r) =>
    r.kind === "mention"
      ? `      mention   ${r.other}`
      : `      ${r.sim!.toFixed(4)} ${r.kept ? "✓" : "✗"}  ${r.other}   (seuil ${r.bar!.toFixed(2)})`,
  );
}

export function memoryExportText(input: MemoryExportInput): string {
  const { memoryData, edges, now = new Date() } = input;
  const cards = memoryData.cards ?? [];
  const byId = new Map(cards.map((c) => [c.id, c]));
  const nameOf = (id: string) => byId.get(id)?.entity ?? `? ${id}`;

  // Both halves of the graph, per card.
  const rows = new Map<string, Row[]>(cards.map((c) => [c.id, []]));
  const add = (id: string, row: Row) => rows.get(id)?.push(row);
  let keptCount = 0;
  for (const e of edges ?? []) {
    const bar = barFor(byId.get(e.a), byId.get(e.b));
    const kept = e.sim >= bar;
    if (kept) keptCount += 1;
    add(e.a, { other: nameOf(e.b), kind: "sem", sim: e.sim, bar, kept });
    add(e.b, { other: nameOf(e.a), kind: "sem", sim: e.sim, bar, kept });
  }
  const mentions = crossLinks(cards);
  for (const [a, b] of mentions) {
    add(a, { other: nameOf(b), kind: "mention", kept: true });
    add(b, { other: nameOf(a), kind: "mention", kept: true });
  }

  const head = [
    `MÉMOIRE ${BRAND.name.toUpperCase()} — EXPORT DE DÉBOGAGE`,
    line(),
    `Date            ${now.toISOString()}`,
    `Fiches          ${cards.length}`,
    edges
      ? `Liens sémantiq. ${edges.length} bruts · ${keptCount} retenus par le graphe`
      : "Liens sémantiq. index sémantique absent",
    `Liens mention   ${mentions.length}`,
    `Seuils          cluster ${CLUSTER_MIN_SIM} · paire de personnes ${PERSON_PAIR_MIN_SIM} · doublon ${DUPLICATE_MIN_SIM}`,
    "",
    "✓ = retenu par le graphe · ✗ = sous le seuil applicable (listé quand même : c'est",
    "souvent le lien manquant qu'on vient chercher).",
    "",
    "⚠️ Ce fichier contient vos données RÉELLES, non redacted. Il reste sur votre",
    "machine : ne le transmettez pas tel quel.",
    line(),
  ];

  const profile = [
    "",
    "PROFIL",
    line(),
    memoryData.profile?.trim() ? memoryData.profile.trim() : "(aucun profil enregistré)",
  ];

  const cardsPart = ["", `FICHES ET LEURS LIENS (${cards.length})`, line()];
  if (!cards.length) cardsPart.push("(aucune fiche)");
  else {
    cardsPart.push(
      cards
        .map((c, i) => {
          const mine = rows.get(c.id) ?? [];
          const links = mine.length
            ? ["    liens", ...neighbourhood(mine)]
            : ["    liens     (aucun)"];
          return [cardBlock(c, i + 1), ...links].join("\n");
        })
        .join("\n\n"),
    );
  }

  // The flat view stays, under the per-card one: it answers a different question
  // (« which pair is closest », the one a threshold discussion starts from).
  const flat = ["", `TOUS LES LIENS SÉMANTIQUES, DU PLUS FORT AU PLUS FAIBLE`, line()];
  if (!edges) {
    flat.push("Index sémantique indisponible sur cette plateforme.");
  } else if (!edges.length) {
    flat.push("(aucun lien)");
  } else {
    flat.push(
      ...[...edges]
        .sort((x, y) => y.sim - x.sim)
        .map((e) => {
          const bar = barFor(byId.get(e.a), byId.get(e.b));
          return `${e.sim.toFixed(4)} ${e.sim >= bar ? "✓" : "✗"}  ${nameOf(e.a)}  ⇄  ${nameOf(e.b)}   (seuil ${bar.toFixed(2)})`;
        }),
    );
  }

  return [...head, ...profile, ...cardsPart, ...flat, ""].join("\n");
}

/** `<slug>-memoire-2026-07-26.txt` — dated so two exports never overwrite each other. */
export function memoryExportFilename(now = new Date()): string {
  return `${BRAND.slug}-memoire-${now.toISOString().slice(0, 10)}.txt`;
}
