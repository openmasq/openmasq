/**
 * Le contrat des MODÈLES de départ — les routines et les compétences que l'app propose
 * quand la liste est vide.
 *
 * Leur `prompt` PRÉ-REMPLIT le message de la personne : il n'est donc pas de la prose
 * pour le modèle (qui, elle, suit la langue de la conversation et reste hors catalogue),
 * mais du texte qu'elle va lire, éditer et envoyer. Il se traduit comme le reste.
 *
 * La STRUCTURE reste au code (`suggestions/`) : l'id, l'ordre, les connecteurs de chaque
 * routine, la catégorie de chaque compétence. Ici, uniquement les mots.
 */

export interface TemplateCopy {
  name: string;
  desc: string;
  prompt: string;
}

export interface TemplatesMessages {
  /** Une routine par id du catalogue `ROUTINE_SUGGESTIONS`. */
  routines: Record<string, TemplateCopy>;
  /** Une compétence par id du catalogue `COMPETENCE_SUGGESTIONS`. */
  competences: Record<string, TemplateCopy>;
  /** L'idée CONSTRUITE pour un connecteur que la liste curatée ne couvre pas. */
  generic: {
    name: (service: string) => string;
    desc: (what: string) => string;
    prompt: (service: string) => string;
  };
}
