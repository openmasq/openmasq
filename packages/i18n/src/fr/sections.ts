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
      `C'est ici que vous écrivez. ${brand} masque les données sensibles avant l'envoi et rétablit vos vraies valeurs dans la réponse. Le nom du modèle est sous la zone de saisie. Cliquez dessus pour changer de modèle.`,
    keywords: "chat conversation discussion message écrire nouvelle",
  },
  library: {
    label: "Bibliothèque",
    tip: "Bibliothèque — les fichiers de vos conversations",
    subtitle: "Tous les fichiers et images de vos conversations, prêts à réutiliser.",
    guide:
      "Chaque image et document partagé dans une conversation apparaît ici. Parcourez-les par type et réutilisez-les en un clic.",
    keywords: "fichiers documents images pièces jointes pdf téléchargements library",
  },
  skills: {
    label: "Compétences",
    tip: "Compétences — vos instructions réutilisables",
    subtitle:
      "Vos instructions réutilisables, rangées par catégorie. Utilisez-en une en un clic, ou tapez / dans la zone de message.",
    guide:
      "Enregistrez une instruction que vous écrivez souvent, comme une réponse type, une traduction ou un résumé, et réutilisez-la partout. Les compétences qui utilisent aussi vos services connectés (« rassemble mes e-mails importants de la semaine et prépare un résumé ») s'appellent des Routines. Tapez / dans la zone de message pour en utiliser une.",
    keywords:
      "prompts instructions modèles de message raccourcis skills routines workflows automatisation connecteurs outils",
  },
  memory: {
    label: "Mémoire",
    tip: (brand) => `Mémoire — ce que ${brand} retient d'une conversation à l'autre`,
    subtitle: (brand) =>
      `Ce que ${brand} retient d'une conversation à l'autre, pour ne pas avoir à vous répéter.`,
    guide:
      "Enregistrez du contexte pour ne pas réexpliquer un client ou un projet. Dites « retiens que… » dans une conversation, sélectionnez un passage et choisissez « Retenir », ou créez une fiche ici. La Mémoire est stockée sur votre ordinateur et masquée avant d'atteindre un modèle.",
    keywords: "souvenirs fiches profil se souvenir retenir contexte",
  },
  vault: {
    label: "Coffre",
    tip: "Coffre — les termes à masquer dans tous vos messages",
    subtitle:
      "Les termes toujours masqués, comme des noms de code, des comptes ou des identifiants. Ils sont remplacés avant chaque envoi, quel que soit le modèle.",
    guide: (brand) =>
      `Ajoutez les termes à toujours masquer, comme un nom de code, un numéro de compte ou un identifiant. ${brand} les masque dans tout ce que vous envoyez.`,
    keywords: "masquer toujours termes mots secrets noms de code vault coffre-fort",
  },
  helpEntry: {
    title: (brand) => `Aide : prendre en main ${brand}`,
    sub: (brand) => `Comment ${brand} masque les données, son vocabulaire et le rôle de chaque section.`,
    keywords:
      "aide guide aidez-moi comment ça marche débuter démarrer tutoriel manuel documentation help",
  },
} satisfies Messages["sections"];
