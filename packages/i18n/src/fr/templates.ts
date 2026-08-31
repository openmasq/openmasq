/**
 * The FR catalogue's « templates » slice — the SOURCE language: the routines and skills
 * offered at the start. The `prompt` pre-fills the message: it is read and edited.
 */
import type { Messages } from "../messages";

export const templates = {
  routines: {
    "comparer-offres": {
      name: "Comparer des offres en ligne",
      desc: "Le navigateur va lire les sites et compare pour vous. Aucun compte requis.",
      prompt: `Sur {site 1} et {site 2}, trouve {ce que je cherche}.

1. Un tableau comparatif : prix, disponibilité, conditions.
2. Ce qui diffère vraiment entre les deux, en trois lignes.
3. Ce que les pages ne disent pas et qu'il faudrait vérifier.

Lis seulement : ne remplis aucun formulaire et ne te connecte à aucun compte.`,
    },
    "preparer-journee": {
      name: "Préparer ma journée",
      desc: "Vos rendez-vous, les participants, et ce qu'il faut avoir préparé.",
      prompt: `Prépare ma journée du {date}.

1. Mes rendez-vous dans l'ordre, avec les participants et le lieu.
2. Pour chacun : le sujet, et ce que je dois avoir préparé.
3. Ce qui se chevauche ou ne me laisse pas le temps de me déplacer.`,
    },
    "compte-rendu-reunions": {
      name: "Compte rendu de mes réunions",
      desc: "Décisions et actions tirées des transcriptions de la semaine.",
      prompt: `Reprends mes réunions depuis {date}.

1. Pour chacune : le sujet, les participants, et les décisions prises.
2. Les actions qui me reviennent, avec l'échéance si elle a été dite.
3. Les sujets restés ouverts, à remettre à l'ordre du jour.

N'ajoute aucune décision qui n'apparaît pas dans les transcriptions.`,
    },
    "recherche-notion": {
      name: "Retrouver dans Notion",
      desc: "Cherche dans vos pages et répond avec les sources.",
      prompt: `Cherche dans mon espace Notion ce qui concerne {sujet}.

1. Les pages trouvées, de la plus pertinente à la moins pertinente.
2. Ce que chacune dit sur la question, en deux lignes, avec le lien.
3. La réponse que ces pages permettent de donner — et ce qu'elles ne disent pas.

Ne modifie rien : lecture seule.`,
    },
    "revue-boite-mail": {
      name: "Revue de ma boîte mail",
      desc: "Trie les e-mails reçus et sort ce qui attend une réponse.",
      prompt: `Passe en revue mes e-mails reçus depuis {période, ex. hier 18 h}.

1. Ce qui attend une réponse de ma part, du plus urgent au moins urgent.
2. Ce qui est purement informatif, une ligne chacun.
3. Pour les trois plus urgents, propose un brouillon de réponse.

N'envoie rien : montre-moi d'abord.`,
    },
    "point-hebdo-slack": {
      name: "Point hebdo sur un canal",
      desc: "Décisions, questions en suspens et ce qui m'est adressé.",
      prompt: `Relis les messages du canal {canal} sur les {nombre} derniers jours.

- Les décisions prises.
- Les questions restées sans réponse.
- Ce qui m'est adressé directement.

Termine par les trois choses à ne pas rater.`,
    },
    "point-client": {
      name: "Point sur un client",
      desc: "Rassemble échanges et documents autour d'un client, et dit où ça en est.",
      prompt: `Fais le point sur {client}.

1. Les derniers échanges par e-mail : qui a écrit quoi, et quand.
2. Les documents qui le concernent, avec leur date.
3. Ce qui est en attente de mon côté, et ce qui est en attente du sien.

Termine par la prochaine chose à faire. N'ajoute rien qui ne figure pas dans
les échanges ou les documents.`,
    },
    "recherche-documents": {
      name: "Retrouver un document",
      desc: "Cherche dans vos fichiers et résume ce qui répond à la question.",
      prompt: `Cherche dans mes fichiers ce qui concerne {sujet}.

1. Les documents trouvés, du plus pertinent au moins pertinent, avec leur date.
2. Ce que chacun dit sur la question, en deux lignes.
3. La réponse que ces documents permettent de donner — et ce qu'ils ne disent pas.`,
    },
    "point-paiements": {
      name: "Point sur mes paiements",
      desc: "Encaissements, échecs et impayés de la période.",
      prompt: `Fais le point sur mes paiements depuis {date}.

1. Le total encaissé, et l'écart avec la période précédente.
2. Les paiements échoués ou contestés, avec le motif.
3. Les factures impayées, de la plus ancienne à la plus récente.

Consultation seule : ne crée, ne rembourse et n'annule rien.`,
    },
    "veille-sujet": {
      name: "Veille sur un sujet",
      desc: "Cherche le web et rend une synthèse sourcée.",
      prompt: `Fais une veille sur {sujet} pour les {nombre} derniers jours.

1. Les faits nouveaux, avec la source et la date de chacun.
2. Ce que cela change concrètement, en trois lignes.
3. Ce que tu n'as PAS trouvé et qui manquerait pour conclure.

Cite tes sources et ne conclus rien qu'elles ne disent pas.`,
    },
    "revue-depot": {
      name: "Revue de dépôt",
      desc: "PR ouvertes, revues en attente, issues les plus actives.",
      prompt: `Fais le point sur le dépôt {dépôt}.

1. Les pull requests ouvertes : depuis quand, et qui attend quoi.
2. Celles qui attendent ma revue.
3. Les issues les plus actives des {nombre} derniers jours.

Une ligne par élément, avec le lien.`,
    },
    "suivi-projet": {
      name: "Suivi de projet",
      desc: "Ce qui avance, ce qui bloque, ce qui a glissé.",
      prompt: `Fais le point sur le projet {projet}.

- Ce qui a été terminé depuis {date}.
- Ce qui est en cours, et depuis combien de temps.
- Ce qui est bloqué ou en retard, avec la raison si elle est notée.

Termine par les risques que tu vois pour l'échéance.`,
    },
    "erreurs-semaine": {
      name: "Erreurs de la semaine",
      desc: "Les erreurs qui montent, triées par impact.",
      prompt: `Liste les erreurs remontées sur {projet} depuis {date}.

1. Les nouvelles erreurs, par nombre d'occurrences.
2. Celles qui augmentent le plus par rapport à la période précédente.
3. Pour les trois premières : où elles se déclenchent, et ce que tu en déduis.`,
    },
  },
  competences: {
    "reponse-email": {
      name: "Réponse e-mail pro",
      desc: "Rédige une réponse claire à partir d'un e-mail reçu.",
      prompt: `Rédige une réponse professionnelle à l'e-mail ci-dessous.

- Ton courtois et direct, sans formule creuse.
- Reprends chaque point soulevé, dans l'ordre.
- Termine par la prochaine étape concrète.

E-mail reçu :
`,
    },
    "resume-document": {
      name: "Résumé d'un document",
      desc: "Sort l'essentiel, les points clés et les décisions à prendre.",
      prompt: `Résume le document ci-dessous.

1. L'essentiel en trois phrases.
2. Les points clés, en liste.
3. Les décisions à prendre ou les actions attendues, avec qui fait quoi.

Signale ce qui manque ou reste ambigu plutôt que de le combler.

Document :
`,
    },
    "explication-code": {
      name: "Explication de code",
      desc: "Explique ce que fait un bout de code, étape par étape.",
      prompt: `Explique le code ci-dessous.

1. Ce qu'il fait, en deux phrases.
2. Le déroulé, étape par étape.
3. Les cas limites et les risques que tu repères.

Code :
`,
    },
    "lecture-contrat": {
      name: "Lecture d'un contrat",
      desc: "Repère engagements, délais et clauses à risque.",
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
    "reponse-client": {
      name: "Réponse à un client mécontent",
      desc: "Reconnaître, expliquer, proposer — sans se justifier.",
      prompt: `Rédige une réponse au message client ci-dessous.

- Reconnais le problème sans te justifier.
- Explique ce qui s'est passé, simplement.
- Propose une solution concrète et une échéance.
- Ton posé et humain, jamais défensif.

Message du client :
`,
    },
    relecture: {
      name: "Relecture et correction",
      desc: "Corrige la langue et allège le style, sans toucher au fond.",
      prompt: `Relis le texte ci-dessous.

- Corrige l'orthographe, la grammaire et la ponctuation.
- Allège les phrases lourdes sans changer le sens ni le ton.
- Rends d'abord la version corrigée, puis la liste des changements notables.

Texte :
`,
    },
    "compte-rendu": {
      name: "Compte rendu de réunion",
      desc: "Transforme des notes brutes en compte rendu structuré.",
      prompt: `Transforme ces notes de réunion en compte rendu.

- Contexte et participants.
- Sujets abordés, un paragraphe court chacun.
- Décisions prises.
- Actions : quoi, qui, pour quand.

N'ajoute aucune décision qui n'apparaît pas dans les notes.

Notes :
`,
    },
    traduction: {
      name: "Traduction FR ⇄ EN",
      desc: "Traduit en gardant le ton et le vocabulaire métier.",
      prompt: `Traduis le texte ci-dessous dans l'autre langue (français ⇄ anglais).

- Garde le ton et le niveau de langue d'origine.
- Conserve la mise en forme, les noms propres et le vocabulaire métier.
- Signale à la fin les passages ambigus et les choix que tu as dû faire.

Texte :
`,
    },
  },
  generic: {
    name: (service) => `Faire le point sur ${service}`,
    desc: (what) => `Une routine de départ : ${what}`,
    prompt: (service) => `Fais le point sur {ce qui m'intéresse} dans ${service}.

1. Ce que tu trouves, du plus pertinent au moins pertinent, avec sa date.
2. Ce que chaque élément dit, en deux lignes.
3. Ce qui attend une action de ma part.

Lecture seule : ne crée, ne modifie et n'envoie rien.`,
  },
} satisfies Messages["templates"];
