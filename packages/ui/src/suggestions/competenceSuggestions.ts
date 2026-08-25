import type { Competence, CompetenceCategoryId } from "../types";
import { pickSuggestions, type SuggestionBase } from "./suggestions";

/** One compétence template — a `CompetenceDraft` plus a stable id. */
export interface CompetenceSuggestion extends SuggestionBase {
  cat: CompetenceCategoryId;
}

/**
 * The compétences people ask for first. CURATED, not generated: each one is a
 * prompt that stands on its own.
 *
 * ⚠️ ORDER MATTERS — the modal shows the first `COMPETENCE_SUGGESTION_LIMIT`,
 * so the five categories are INTERLEAVED at the head: grouped by theme, the
 * visible strip was three ways to write prose and a lawyer never saw a template
 * for their work. Pinned by `suggestions.test.ts` (the OFFERED set, not just the
 * catalog, must cover every category).
 *
 * Two rules the copy follows, and they are not decoration:
 *  - the instruction ends on the LABEL of what the user must paste (« Texte : »),
 *    so a picked template leaves an obvious hole to fill rather than looking
 *    finished;
 *  - it never asks the model to invent what the source does not say — a
 *    template is a starting point the user edits, and a confident hallucination
 *    is the one thing they will not catch.
 */
export const COMPETENCE_SUGGESTIONS: CompetenceSuggestion[] = [
  {
    id: "reponse-email",
    name: "Réponse e-mail pro",
    desc: "Rédige une réponse claire à partir d'un e-mail reçu.",
    cat: "redaction",
    prompt: `Rédige une réponse professionnelle à l'e-mail ci-dessous.

- Ton courtois et direct, sans formule creuse.
- Reprends chaque point soulevé, dans l'ordre.
- Termine par la prochaine étape concrète.

E-mail reçu :
`,
  },
  {
    id: "resume-document",
    name: "Résumé d'un document",
    desc: "Sort l'essentiel, les points clés et les décisions à prendre.",
    cat: "analyse",
    prompt: `Résume le document ci-dessous.

1. L'essentiel en trois phrases.
2. Les points clés, en liste.
3. Les décisions à prendre ou les actions attendues, avec qui fait quoi.

Signale ce qui manque ou reste ambigu plutôt que de le combler.

Document :
`,
  },
  {
    id: "explication-code",
    name: "Explication de code",
    desc: "Explique ce que fait un bout de code, étape par étape.",
    cat: "code",
    prompt: `Explique le code ci-dessous.

1. Ce qu'il fait, en deux phrases.
2. Le déroulé, étape par étape.
3. Les cas limites et les risques que tu repères.

Code :
`,
  },
  {
    id: "lecture-contrat",
    name: "Lecture d'un contrat",
    desc: "Repère engagements, délais et clauses à risque.",
    cat: "juridique",
    prompt: `Analyse le contrat ci-dessous.

- Les engagements de chaque partie.
- Les durées, délais, préavis et renouvellements.
- Les clauses inhabituelles ou à risque, et pourquoi.
- Les points à faire préciser avant signature.

C'est une lecture, pas un conseil juridique : dis clairement ce qui mérite
l'avis d'un professionnel.

Contrat :
`,
  },
  {
    id: "reponse-client",
    name: "Réponse à un client mécontent",
    desc: "Reconnaître, expliquer, proposer — sans se justifier.",
    cat: "support",
    prompt: `Rédige une réponse au message client ci-dessous.

- Reconnais le problème sans te justifier.
- Explique ce qui s'est passé, simplement.
- Propose une solution concrète et une échéance.
- Ton posé et humain, jamais défensif.

Message du client :
`,
  },
  {
    id: "relecture",
    name: "Relecture et correction",
    desc: "Corrige la langue et allège le style, sans toucher au fond.",
    cat: "redaction",
    prompt: `Relis le texte ci-dessous.

- Corrige l'orthographe, la grammaire et la ponctuation.
- Allège les phrases lourdes sans changer le sens ni le ton.
- Rends d'abord la version corrigée, puis la liste des changements notables.

Texte :
`,
  },
  {
    id: "compte-rendu",
    name: "Compte rendu de réunion",
    desc: "Transforme des notes brutes en compte rendu structuré.",
    cat: "analyse",
    prompt: `Transforme ces notes de réunion en compte rendu.

- Contexte et participants.
- Sujets abordés, un paragraphe court chacun.
- Décisions prises.
- Actions : quoi, qui, pour quand.

N'ajoute aucune décision qui n'apparaît pas dans les notes.

Notes :
`,
  },
  {
    id: "traduction",
    name: "Traduction FR ⇄ EN",
    desc: "Traduit en gardant le ton et le vocabulaire métier.",
    cat: "redaction",
    prompt: `Traduis le texte ci-dessous dans l'autre langue (français ⇄ anglais).

- Garde le ton et le niveau de langue d'origine.
- Conserve la mise en forme, les noms propres et le vocabulaire métier.
- Signale à la fin les passages ambigus et les choix que tu as dû faire.

Texte :
`,
  },
];

/** How many templates the modal offers at once — enough to cover the usual
 *  needs, few enough that the strip stays a hint and not a second page. */
export const COMPETENCE_SUGGESTION_LIMIT = 6;

/** The templates to offer beside `existing` (the user's own compétences). */
export function suggestedCompetences(
  existing: readonly Competence[],
  limit = COMPETENCE_SUGGESTION_LIMIT,
): CompetenceSuggestion[] {
  return pickSuggestions(COMPETENCE_SUGGESTIONS, existing, limit);
}
