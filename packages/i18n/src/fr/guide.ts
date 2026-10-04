/**
 * The FR catalogue's « guide » slice — the SOURCE language.
 *
 * `satisfies` per entry: the compiler demands EXACTLY the contract's keys
 * (`../messages/guide.ts`), ni plus ni moins.
 */
import type { Messages } from "../messages";

export const guide = {
  protection: {
    title: (brand) => `Ce que ${brand} fait pour vous`,
    lead:
      (brand) => `Vous écrivez normalement. Avant l'envoi de votre message, ${brand} repère les données sensibles (noms, e-mails, téléphones, adresses, numéros de compte) et les remplace par des valeurs de substitution. Le modèle ne voit que ces substituts. Vous voyez les vraies valeurs, dans votre message comme dans la réponse. C'est le masquage : contrairement à un passage noirci, le modèle reçoit un texte complet et cohérent.`,
    points: [
      () => "Le repérage s'exécute sur votre appareil, avant tout envoi. Rien n'est envoyé pour être analysé.",
      () => "Sous chaque message envoyé, une courte mention indique combien d'éléments ont été masqués.",
      () => "Cliquez sur un mot surligné pour le démasquer, ou sélectionnez un autre passage pour le masquer.",
      () => "Les personnalités publiques et les grandes marques ne sont pas masquées : elles n'identifient ni votre client ni votre dossier. Le niveau Strict les masque aussi. Les pays ne sont jamais masqués.",
      () => "Si une conversation ne contient aucune donnée sensible, rien n'est remplacé et le compteur affiche zéro.",
      () => "Ajoutez au Coffre les noms de code ou surnoms que la détection ne peut pas reconnaître. Ils sont masqués dans chaque conversation.",
    ],
  },
  firstMessage: {
    title: () => "Votre premier message",
    lead:
      (brand) => `Un modèle gratuit est déjà sélectionné et fonctionne avec votre compte ${brand}. Écrivez un message et envoyez-le, ou cliquez sur un exemple de l'écran d'accueil.`,
    points: [
      () => "Le nom du modèle est sous la zone de saisie. Cliquez dessus pour changer de modèle.",
      (brand) => `Certains modèles demandent votre propre clé. ${brand} vous le signale à l'envoi et vous propose d'en ajouter une.`,
      () => "Tapez / dans la zone de message pour vos compétences, vos routines et « retiens que… ».",
    ],
  },
  models: {
    title: () => "Modèles inclus, ou votre clé",
    lead:
      (brand) => `Vous pouvez accéder à un modèle de deux façons, et les combiner. Les modèles inclus fonctionnent avec votre compte ${brand}, sans rien configurer. Un modèle gratuit est sélectionné au départ. Les autres modèles utilisent votre propre clé chez le fournisseur.`,
    terms: [
      {
        term: () => "Gratuit",
        def: (brand) =>
          `Inclus avec votre compte ${brand}, sans clé. L'usage est limité : la vitesse et la disponibilité dépendent du fournisseur.`,
      },
      {
        term: (brand) => `Inclus avec votre compte ${brand}`,
        def: (brand) =>
          `Les modèles fournis par ${brand}, hébergés en France pour la plupart. Aucune clé à gérer.`,
      },
      {
        term: () => "Avec votre propre clé",
        def: () =>
          `Vous ajoutez votre clé OpenAI, Anthropic, Mistral…, et votre fournisseur vous facture. Le masquage fonctionne de la même façon.`,
      },
    ],
    points: [
      () => "Dans le sélecteur de modèle, une pastille signale les modèles que vous ne pouvez pas encore utiliser. Cliquez dessus pour savoir quoi faire.",
      (brand) => `Si vous ne pouvez pas encore utiliser un modèle, rien n'est envoyé : ${brand} bloque le message et affiche vos deux options en dessous.`,
      () => "Vos clés restent chiffrées sur cet appareil et ne sont jamais envoyées au modèle.",
    ],
  },
  sections: {
    title: () => "Se repérer dans l'app",
    lead:
      () => "La barre de gauche mène à chaque section de l'app. Survolez une icône pour voir son nom. Cliquez sur le logo, en haut, pour déplier la barre.",
  },
  words: {
    title: (brand) => `Glossaire ${brand}`,
    lead:
      () => "Les termes utilisés dans l'app, et ce que chacun désigne précisément.",
    terms: [
      {
        term: () => "Masquer",
        def: () =>
          "Remplacer une donnée sensible par une valeur de substitution avant l'envoi, puis rétablir la vraie valeur dans la réponse.",
      },
      {
        term: () => "Coffre",
        def: () =>
          "Les termes toujours masqués, dans chaque conversation et avec chaque modèle.",
      },
      {
        term: () => "Mémoire",
        def: (brand) =>
          `Ce que ${brand} retient d'une conversation à l'autre, pour que vous n'ayez pas à vous répéter.`,
      },
      {
        term: () => "Compétence",
        def: () => "Une instruction que vous réutilisez telle quelle dans vos conversations.",
      },
      {
        term: () => "Routine",
        def: () => "Une compétence qui exécute des actions dans vos services connectés.",
      },
      {
        term: () => "Connecteur",
        def: () =>
          "Un service que vous connectez (agenda, e-mails, fichiers) pour que le modèle puisse s'en servir. Toute action qui écrit des données demande votre accord.",
      },
    ],
  },
  data: {
    title: () => "Où vont vos données",
    lead:
      () => "Vos conversations, vos fichiers, votre Coffre et votre mémoire restent sur votre appareil, chiffrés. Seuls vos messages masqués sont envoyés à un modèle.",
    points: [
      () => "La mémoire est stockée sur votre appareil, pas sur un serveur. Elle est masquée chaque fois qu'elle est envoyée à un modèle.",
      () => "L'icône bouclier, en bas de la barre de gauche, ouvre le rapport de confidentialité : tout ce qui a été masqué, par catégorie.",
      () => "Les statistiques d'usage sont anonymes, ne contiennent jamais vos messages, et se refusent dans Réglages.",
    ],
  },
  releases: {
    title: () => "Nouveautés",
    lead:
      (brand) => `Ce qui a changé dans ${brand}, version par version, la plus récente en premier. C'est la même liste que celle envoyée par e-mail à chaque version.`,
    points: [
      (brand) => `Ouvrir cette page ne fait que télécharger la liste des nouveautés. ${brand} n'envoie rien de vos conversations.`,
      () => "Pour voir la version installée, ou en installer une autre : Réglages → Avancé → Versions.",
    ],
  },
} satisfies Messages["guide"];
