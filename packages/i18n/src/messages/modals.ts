/**
 * Les MODALES — les panneaux qui prennent l'écran, et le vocabulaire qu'ils présentent.
 *
 * Une TRANCHE du contrat (`../messages.ts`), qui reste la seule liste des namespaces.
 * Le découpage tient le cap 300 LOC (règle 1) — même forme que `packages/emails/i18n/`.
 */
export interface ModalsMessages {
  /** Le comparatif côte à côte : votre texte / ce qui est réellement parti. */
  transparency: {
    title: string;
    sub: (count: number, modelName: string) => string;
    /** Le nom du modèle quand on l'a ; sinon ce mot. */
    theModel: string;
    close: string;
    empty: string;
  };

  /** Le message BRUT d'un fournisseur ou d'un outil — jamais ajouté à la conversation. */
  error: {
    eyebrow: string;
    title: string;
    sub: string;
    copy: string;
    copied: string;
    retry: string;
  };

  /** La mise à jour téléchargée, avec sa note de version si elle est publiée. */
  updateReady: {
    eyebrow: string;
    version: (version: string) => string;
    noNote: string;
    later: string;
    restartNow: string;
  };

  /** Un connecteur qui accepte les deux : votre compte, ou l'accès anonyme. */
  mcpAuth: {
    title: (connector: string) => string;
    sub: (connector: string) => string;
    withAccount: string;
    withAccountDesc: (connector: string) => string;
    anonymous: string;
    anonymousDesc: string;
    cancel: string;
  };

  /** ⌘K. */
  search: {
    placeholder: string;
    newChat: string;
    noResults: string;
  };

  /**
   * « Votre avis ». L'HUMEUR cesse d'être obligatoire dès que le journal accompagne
   * l'envoi — l'étiquette doit donc le DIRE, sinon la friction retirée du code se
   * réinstalle dans la tête de qui écrit.
   */
  avis: {
    title: string;
    sub: string;
    thanks: string;
    thanksWithJournal: string;
    thanksPlain: string;
    close: string;
    moodLabel: string;
    optional: string;
    categoryLabel: string;
    messageLabel: string;
    messagePlaceholder: string;
    attachContext: string;
    attachContextSub: string;
    attachJournal: string;
    /** Les humeurs et les types de retour : le glyphe et l'id restent au code. */
    moods: { love: string; ok: string; meh: string };
    categories: { idea: string; bug: string; love: string; other: string };
  };
}
