/**
 * The FR catalogue's « sections » slice — the SOURCE language.
 *
 * `satisfies` per entry: the compiler demands EXACTLY the contract's keys
 * (`../messages/sections.ts`), no more and no less, slice by slice — so a forgotten
 * key names ITS slice rather than the whole catalogue.
 */
import type { Messages } from "../messages";

export const sections = {
  chats: {
    label: "Conversations",
    tip: "Conversations — vos échanges avec les modèles",
    guide: (brand) =>
      `C'est ici que vous écrivez. Tapez comme vous parlez : ${brand} masque les données sensibles avant l'envoi, et rétablit vos vraies valeurs dans la réponse. Le nom du modèle est sous la zone de saisie — cliquez-le pour en changer à tout moment.`,
    keywords: "chat conversation discussion message écrire nouvelle",
  },
  library: {
    label: "Bibliothèque",
    tip: "Bibliothèque — les fichiers de vos conversations, déjà masqués",
    subtitle: "Tous les fichiers et images de vos conversations, protégés et prêts à réutiliser.",
    guide:
      "Chaque image et document partagé dans une conversation atterrit ici automatiquement, déjà masqué. Vous les retrouvez par type, et vous les réutilisez ailleurs en un clic.",
    keywords: "fichiers documents images pièces jointes pdf téléchargements library",
  },
  competences: {
    label: "Compétences",
    tip: "Compétences — vos instructions réutilisables",
    subtitle:
      "Vos instructions réutilisables, rangées par catégorie. Utilisez-en une en un clic, ou tapez / dans la zone de message.",
    guide:
      "Une bonne instruction que vous réécrivez souvent — une réponse type, une traduction, un résumé — s'enregistre une fois et se réutilise partout. Certaines mettent en plus vos services connectés au travail (« rassemble mes e-mails importants de la semaine et prépare un résumé ») : ce sont les Routines, une catégorie comme une autre. Tapez / dans la zone de message pour en utiliser une.",
    keywords:
      "prompts instructions modèles de message raccourcis skills routines workflows automatisation connecteurs outils",
  },
  memory: {
    label: "Mémoire",
    tip: (brand) => `Mémoire — ce que ${brand} retient d'une fois sur l'autre`,
    subtitle: (brand) =>
      `Ce que ${brand} retient d'une conversation à l'autre, pour ne pas avoir à vous répéter.`,
    guide:
      "Pour ne pas réexpliquer chaque fois qui est ce client ou où en est ce projet. Dites « retiens que… » dans une conversation, sélectionnez un passage et choisissez « Retenir », ou créez une fiche ici. Tout reste sur votre machine, et part masqué comme le reste.",
    keywords: "souvenirs fiches profil se souvenir retenir contexte",
  },
  vault: {
    label: "Coffre",
    tip: "Coffre — les mots à masquer dans tous vos échanges",
    subtitle:
      "Vos termes toujours masqués — noms de code, comptes, identifiants — remplacés avant chaque envoi, quel que soit le modèle.",
    guide: (brand) =>
      `Vos mots à vous : un nom de code, un numéro de compte, un identifiant. Ajoutez-les une fois, et ${brand} les masque dans tous vos envois, sans exception.`,
    keywords: "masquer toujours termes mots secrets noms de code vault coffre-fort",
  },
  helpEntry: {
    title: (brand) => `Aide — prendre en main ${brand}`,
    sub: (brand) => `Le masquage, les mots de ${brand}, et à quoi sert chaque section.`,
    keywords:
      "aide guide aidez-moi comment ça marche débuter démarrer tutoriel manuel documentation help",
  },
} satisfies Messages["sections"];
