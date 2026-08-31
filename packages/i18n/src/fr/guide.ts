/**
 * Tranche « guide » du catalogue FR — la langue SOURCE.
 *
 * `satisfies` par entrée : le compilateur exige EXACTEMENT les clés du contrat
 * (`../messages/guide.ts`), ni plus ni moins.
 */
import type { Messages } from "../messages";

export const guide = {
  protection: {
    title: (brand) => `Ce que ${brand} fait pour vous`,
    lead:
      (brand) => `Vous écrivez normalement. Avant que votre message ne parte, ${brand} repère les données sensibles — noms, e-mails, téléphones, adresses, numéros de compte — et les remplace par de fausses valeurs. Le modèle ne travaille que sur ces fausses valeurs ; vous, vous continuez de voir les vraies, dans votre message comme dans la réponse. C'est ce remplacement qu'on appelle le redaction, comme les passages noircis d'un document officiel.`,
    points: [
      () => "Le repérage s'exécute sur votre machine, avant tout envoi — rien ne part pour être analysé.",
      () => "Sous chaque message envoyé, une petite mention indique combien d'éléments ont été protégés.",
      () => "Vous gardez la main : cliquez un mot surligné pour le laisser en clair, ou sélectionnez-en un autre pour le masquer.",
      () => "Les personnalités publiques et les grandes marques restent en clair : elles n'identifient pas votre dossier. Le niveau Strict les masque aussi ; les pays, eux, ne sont jamais masqués.",
      () => "Une conversation sans donnée personnelle est normale : rien n'est remplacé, le compteur reste à zéro — la protection était bien là, elle n'a simplement rien trouvé à faire.",
      () => "Un nom de code ou un surnom qu'aucun détecteur ne peut deviner s'ajoute au Coffre : il sera masqué partout, dans chaque conversation.",
    ],
  },
  firstMessage: {
    title: () => "Votre premier message",
    lead:
      (brand) => `Il n'y a rien à configurer. Un modèle gratuit est déjà sélectionné et fonctionne avec votre compte ${brand} : écrivez, envoyez. Les exemples proposés sur l'écran d'accueil partent en un clic si vous voulez juste voir à quoi ça ressemble.`,
    points: [
      () => "Le nom du modèle est sous la zone de saisie — cliquez-le pour en changer.",
      (brand) => `Certains modèles demandent votre propre clé ou un abonnement : ${brand} vous le dit au moment de l'envoi, et vous propose l'une ou l'autre.`,
      () => "Tapez / dans la zone de message pour retrouver vos compétences, vos workflows et « retiens que… ».",
    ],
  },
  models: {
    title: () => "Modèles gratuits, abonnement, votre clé",
    lead:
      (brand) => `Il y a trois façons d'atteindre un modèle, et vous pouvez les mélanger. Un modèle marqué gratuit s'utilise avec votre compte, sans rien payer ni configurer — c'est le point de départ. Les autres passent soit par un abonnement ${brand}, soit par votre propre clé chez le fournisseur.`,
    terms: [
      {
        term: () => "Gratuit",
        def: (brand) =>
          `Inclus avec votre compte ${brand}, sans abonnement et sans clé. L'usage est limité : le débit et la disponibilité dépendent du fournisseur.`,
      },
      {
        term: (brand) => `Avec un abonnement ${brand}`,
        def: (brand) =>
          `Les modèles que ${brand} fournit, sans aucune clé à gérer — vos crédits mensuels paient l'usage.`,
      },
      {
        term: () => "Avec votre propre clé",
        def: (brand) =>
          `Vous branchez votre clé OpenAI, Anthropic, Mistral… : c'est votre fournisseur qui vous facture, vos crédits ${brand} ne bougent pas. La protection est exactement la même.`,
      },
    ],
    points: [
      () => "Dans le sélecteur, un modèle que vous ne pouvez pas encore utiliser porte une pastille — cliquez-la, elle explique quoi faire.",
      (brand) => `Rien n'est jamais envoyé avant : si un modèle vous est inaccessible, ${brand} refuse l'envoi et vous propose les deux issues sous le message.`,
      () => "Vos clés restent chiffrées sur cette machine, et ne sont jamais transmises au modèle.",
    ],
  },
  sections: {
    title: () => "Retrouver vos affaires",
    lead:
      () => "La barre de gauche mène aux six endroits de l'app. Survolez une icône pour son nom ; cliquez le logo, en haut, pour déplier la barre.",
  },
  words: {
    title: (brand) => `Les mots de ${brand}`,
    lead:
      () => "Quelques termes reviennent souvent dans l'app. Les voici, une fois pour toutes.",
    terms: [
      {
        term: () => "Redact",
        def: () =>
          "Remplacer une donnée sensible par une fausse valeur avant l'envoi — et rétablir la vraie à l'arrivée.",
      },
      {
        term: () => "Le coffre",
        def: () =>
          "Vos mots à masquer systématiquement, quel que soit le modèle et quelle que soit la conversation.",
      },
      {
        term: () => "La mémoire",
        def: (brand) =>
          `Ce que ${brand} retient d'une conversation à l'autre pour ne pas vous faire répéter.`,
      },
      {
        term: () => "Une compétence",
        def: () => "Une instruction que vous réutilisez telle quelle dans vos conversations.",
      },
      {
        term: () => "Un workflow",
        def: () => "Une instruction qui met vos services connectés au travail.",
      },
      {
        term: () => "Un connecteur",
        def: () =>
          "Un service que vous branchez — agenda, e-mails, fichiers — pour que le modèle puisse s'en servir, avec votre accord à chaque action qui écrit.",
      },
    ],
  },
  data: {
    title: () => "Où vont vos données",
    lead:
      () => "Vos conversations, vos fichiers, votre coffre et votre mémoire restent sur votre machine, chiffrés. Ce qui part vers un modèle, ce sont vos messages une fois redacted — et rien d'autre.",
    points: [
      () => "La mémoire ne passe par aucun serveur pour « se souvenir » : elle est locale, et repart redacted à chaque envoi.",
      () => "Le bouclier, en bas de la barre de gauche, ouvre le rapport de confidentialité : tout ce qui a été protégé, catégorie par catégorie.",
      () => "Les statistiques d'usage sont anonymes, ne contiennent jamais vos messages, et se refusent dans Réglages.",
    ],
  },
  releases: {
    title: () => "Nouveautés",
    lead:
      (brand) => `Ce qui a changé dans ${brand}, version par version, la plus récente en premier. C'est la même liste que celle envoyée par mail à chaque sortie — elle est ici pour ne pas avoir à la chercher.`,
    points: [
      (brand) => `Lire cette page n'envoie rien : ${brand} demande la liste des nouveautés, jamais l'inverse.`,
      () => "Pour savoir quelle version tourne sur cette machine, ou en installer une autre : Réglages → Avancé → Versions.",
    ],
  },
} satisfies Messages["guide"];
