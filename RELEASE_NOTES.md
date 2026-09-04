# Release notes

<sub>**English** · [Français](#notes-de-version) · [openmasq.com](https://openmasq.com)</sub>

This file feeds the **release announcement e-mail**. On every **production** release (a
`v*` tag), the CI of the private `infra` repository reads the published version's section,
renders it as an e-mail and creates a **draft Resend broadcast** — re-read then sent by hand
from the Resend dashboard (Resend handles the audience + unsubscribes). The renderer, the
parser and that workflow all live there; this repository only holds the source text.

⚠️ **The notes themselves are written in FRENCH, on purpose**: they are the copy users
receive, and the product speaks French. Everything else in this repository is English (see
`CONTRIBUTING.md`) — this file and `evals-reports/README.md` are the exceptions, the first
because its content is not documentation but a message to customers.

**Per-version format — the parser (in the `infra` repository) depends on it:**

- a `## <version> — <YYYY-MM-DD>` heading, carrying the version being released — that is
  the string CI looks up (an absent section is the no-op stated below, never a broken
  release);
- a quoted lead line `> …` (the teaser under the title);
- a `### Nouveautés` list of `- **Title** — description` bullets (the highlighted features,
  rendered with a tick) — **3 at most, one line each**;
- an `### Améliorations & corrections` list of `- …` bullets (rendered with a purple bullet)
  — **6 at most, one line each**.

⚠️ Both sections are read AS BULLETS. Prose stays accepted for already-published notes —
Contentful serves a past note as a single markdown block — but a section that carries bullets
renders its bullets and nothing else.

The budget is not a style preference: a note is read in thirty seconds or it is not read. It
is held on both sides — the generator's schema caps it (in `infra`) and step 3 of the
`release-version` skill says the same thing, with a test checking that the two agree.

A version with no section here ⇒ CI sends nothing (a no-op; the release is not blocked). Keep
the most recent section **at the top**.


# Notes de version

**Les notes elles-mêmes restent en FRANÇAIS et ne sont pas traduites** : ce ne sont pas de la
documentation, c'est la copie que les clients reçoivent, et l'analyseur du dépôt `infra` lit
les intitulés `## <version> — <AAAA-MM-JJ>`, `### Nouveautés` et
`### Améliorations & corrections` tels quels. Ce qui suit traduit donc le mode d'emploi
ci-dessus, à l'intention de qui écrit une note.

Ce fichier alimente l'**e-mail d'annonce de version**. À chaque version de **production** (un
tag `v*`), la CI du dépôt privé `infra` lit la section de la version publiée, la rend en
e-mail et crée un **brouillon de broadcast Resend** — relu puis envoyé à la main depuis le
tableau de bord Resend (Resend tient l'audience et les désabonnements). Le rendu, l'analyseur
et ce workflow vivent là-bas ; ce dépôt-ci ne détient que le texte source.

**Le format par version — l'analyseur (dans le dépôt `infra`) en dépend :**

- un intitulé `## <version> — <AAAA-MM-JJ>`, portant la version publiée — c'est la chaîne que
  la CI cherche (une section absente est le non-événement énoncé plus bas, jamais une
  publication cassée) ;
- une ligne d'accroche citée `> …` (le teaser sous le titre) ;
- une liste `### Nouveautés` de puces `- **Titre** — description` (les fonctionnalités mises
  en avant, rendues avec une coche) — **3 au maximum, une ligne chacune** ;
- une liste `### Améliorations & corrections` de puces `- …` (rendues avec une puce violette)
  — **6 au maximum, une ligne chacune**.

⚠️ Les deux sections sont lues COMME DES PUCES. La prose reste acceptée pour les notes déjà
publiées — Contentful sert une note passée comme un seul bloc markdown — mais une section qui
porte des puces rend ses puces et rien d'autre.

Le budget n'est pas une préférence de style : une note se lit en trente secondes ou elle ne se
lit pas. Il est tenu des deux côtés — le schéma du générateur le plafonne (dans `infra`) et
l'étape 3 de la compétence `release-version` dit la même chose, avec un test qui vérifie que
les deux s'accordent.

Une version sans section ici ⇒ la CI n'envoie rien (un non-événement ; la publication n'est
pas bloquée). Gardez la section la plus récente **en haut**.

---

## 0.9.0 — 2026-09-02
> Moins de portes, moins de mots : l'app dit chaque chose une fois, au même endroit.

### Nouveautés
- **Un seul bouton « + » dans la zone de message** — fichier, dossier, connecteur ou compétence, sans quitter la conversation.
- **Trois niveaux de masquage nommés par l'usage** — Allégé pour la recherche web, Renforcé pour la rédaction, Strict pour les documents ; chacun dit ce qu'il laisse lisible.
- **Des réglages qui tiennent en quatre onglets** — Compte, Confidentialité, Modèles, Connecteurs ; l'organisation rejoint le compte, ce que l'agent peut faire rejoint les connecteurs.

### Améliorations & corrections
- Laisser un mot en clair se dit d'une seule façon, avec sa portée : cet envoi, cette conversation ou ce message.
- Sous une réponse, un seul encart de statut et une seule ligne mémoire ; les suggestions de connecteurs se font plus rares et plus justes.
- La Mémoire s'ouvre sur son graphe, la liste reste à un clic ; le réglage d'extraction vit dans Confidentialité.
- Une compétence se crée avec un nom et une consigne ; le Coffre devine la catégorie d'un terme et permet de le modifier.
- Le premier lancement tient en trois écrans ; les fenêtres de dialogue gardent le clavier à l'intérieur.
- Deux thèmes, clair et sombre, avec les mêmes contrastes partout.

## 0.8.0 — 2026-08-20
> Le niveau de masquage se règle désormais là où vous écrivez, pour la conversation en cours.

### Nouveautés
- **Le niveau de masquage, depuis la barre de saisie** — un clic le pose pour la conversation en cours, et le glyphe montre d'un coup d'œil ce qui sera masqué.
- **Un sélecteur de modèles qui se lit** — trois blocs titrés, les variantes techniques en moins, et l'offre gratuite enfin nommée.
- **Fermer à distance Mémoire, Bibliothèque et Compétences** — une organisation décide des espaces ouverts à ses membres, sans passer par chaque poste.

### Améliorations & corrections
- Le masquage reconnaît de nouveaux formats d'identifiants, en espagnol et en allemand.
- Les pièces jointes d'un même dossier partagent une seule table de correspondance.
- Un connecteur dit ce qui le bloque et ce qu'il faut faire pour le rétablir.
- L'aperçu avant envoi distingue mieux deux identités proches.
- Un document dont le texte est illisible passe par la reconnaissance de caractères.
- Les consoles d'administration et d'opération adoptent le nouveau cadre.

## 0.7.6 — 2026-08-15
> L'aperçu d'un document s'ouvre désormais sur ce qui part vraiment, pas sur votre
> fichier d'origine.

### Nouveautés
- **L'aperçu montre d'abord la version masquée** — quel que soit le format, la
  vérification avant envoi s'ouvre sur ce qui quittera la machine ; l'original reste à
  un clic.
- **La phrase de synchronisation se vérifie à la saisie** — si elle n'ouvre pas les clés
  de vos autres appareils, l'app le dit tout de suite au lieu de vous laisser diverger.
- **L'avertissement d'utilité lit aussi les pièces jointes** — il vous prévient quand la
  réponse va dépendre d'une valeur remplacée dans un document joint.

### Améliorations & corrections
- Vos valeurs reviennent en clair même lorsque le modèle réécrit leur orthographe ou
  reformule une date.
- Les tableaux séparés par des points-virgules sont lus tels quels, virgule décimale
  comprise.
- Le nom d'un fichier joint est restitué dans la réponse.
- Refuser une écriture n'est plus présenté comme un échec.
- Le masquage distingue mieux les mentions d'état civil et les termes juridiques des
  noms propres.
- La synchronisation attend que vos données soient chargées avant de démarrer.

---

## 0.7.5 — 2026-08-15
> Votre compte arrive avec le palier Solo inclus — et changer d'offre se fait sans
> détour.

### Nouveautés
- **Le palier Solo, inclus** — chaque compte démarre avec son enveloppe de crédits, sans
  rien souscrire ni renseigner de carte.

### Améliorations & corrections
- Souscrire une offre ou en changer se fait sans accroc, depuis n'importe quel palier.
- La connexion vous dit ce qui se passe, y compris quand elle n'aboutit pas.
- La synchronisation annonce la cause d'un échec au lieu de rester muette.
- Les cartes de fournisseurs de modèles respirent.

---

## 0.7.4 — 2026-08-14
> Vos documents s'ouvrent masqués, et un interrupteur montre l'original quand
> vous le décidez.

### Nouveautés
- **Masqué ⇄ Original, d'un geste** — la visionneuse ouvre toujours sur la version
  masquée ; l'interrupteur révèle l'original le temps que vous le regardez.

### Améliorations & corrections
- Un document rouvert depuis la Bibliothèque montre le masquage tel qu'il était à l'envoi.
- Une image scannée se relit masquée, boîtes comprises.
- Les catégories annoncées sous un document sont celles de ce document.

## 0.7.3 — 2026-08-14
> L'aperçu d'un document déposé montre d'emblée sa version masquée, et la lecture
> des documents scannés va plus loin.

### Nouveautés
- **L'aperçu s'ouvre sur le masqué** — déposez un document dans la conversation :
  la première vue est celle qui montre ce qui est masqué, boîtes et halo compris.

### Améliorations & corrections
- La lecture d'une pièce d'identité scannée est plus complète, et mieux protégée.
- Le masquage reconnaît des mentions que la numérisation déforme.
- La liste des modèles se lit d'un coup d'œil : prix, contexte et débit en un signe.
- La synchronisation entre appareils gagne en fiabilité.

## 0.7.1 — 2026-08-14
> Les organisations décident de ce qui est ouvert, et l'application se tient à jour
> toute seule.

### Nouveautés
- **Comptes d'entreprise : l'organisation ouvre les modèles** — tout est fermé par
  défaut, l'administrateur choisit la liste ; les clés personnelles sont désactivées
  sur ces comptes.

### Améliorations & corrections
- L'application se met à jour plus sûrement.
- La console d'administration gagne en clarté.
- Le masquage imposé par une organisation tient même hors connexion.

## 0.7.0 — 2026-08-14
> Un long document se lit en entier si vous le demandez, l'aperçu montre exactement ce
> qui part au modèle, et la Mémoire s'explique.

### Nouveautés
- **Relire un document en entier** — la vignette annonce « 10/32 pages lues » quand la
  lecture s'est arrêtée, et un clic lance les pages restantes.
- **Le halo s'allume et s'éteint** — dans l'aperçu, son étiquette masque ou réaffiche
  d'un clic le texte reconnu ; votre choix est retenu.
- **La Mémoire s'explique** — une légende nomme chaque trait du graphe : catégorie,
  mention, même sujet.

### Améliorations & corrections
- L'application reste réactive pendant la lecture d'un scan, même long.
- L'aperçu d'un document distingue d'un halo net le texte qui part, masqué, au modèle
  de ce qui reste dans l'image (logo, tampon, cachet).
- Une fiche Mémoire se supprime depuis la liste, sans ouvrir son panneau.
- Le masquage distingue mieux une donnée personnelle d'un nom de produit ou d'outil,
  et reconnaît les numéros de TVA intracommunautaire.
- Quand un connecteur refuse une action, le message dit lequel et propose de le
  reconnecter.
- Les surfaces et les boutons perdent leur motif rayé : l'interface est plus calme.

## 0.6.0 — 2026-08-13
> L'application s'entretient toute seule : les mises à jour s'installent en coulisses, la lecture
> d'un document se voit, et la mémoire montre son travail.

### Nouveautés
- **Les mises à jour s'installent toutes seules** — quand l'app est en arrière-plan ou que
  vous êtes absent, jamais pendant que vous travaillez.
- **La lecture d'un scan se voit** — page en cours et texte déjà lu s'affichent pendant
  l'analyse d'un document.
- **La mémoire dit ce qu'elle fait** — « Mise en mémoire… » s'affiche dès votre
  « retiens que… », puis les fiches créées s'ouvrent en un clic.

### Améliorations & corrections
- Les graphiques générés portent un vrai nom, plus un code technique.
- Un fichier ouvert depuis vos dossiers s'affiche immédiatement, dans sa version originale.
- Le navigateur intégré est prêt dès la connexion du compte.
- Les réponses et la réflexion des modèles suivent mieux votre langue.
- La synchronisation entre appareils s'établit plus vite et affiche son état.
- Un compte déjà abonné retrouve son abonnement dès la connexion sur un nouvel appareil.

## 0.5.0 — 2026-08-11
> Les nouveautés de chaque version se lisent maintenant dans l'aide, la page Modèles annonce
> votre modèle par défaut, et une connexion expirée se rétablit d'un clic.

### Nouveautés
- **Un onglet « Nouveautés » dans l'aide** — l'historique des versions, la plus récente en
  tête, sans quitter l'app.
- **Votre modèle par défaut est annoncé en haut de la page Modèles** — au lieu d'être
  cherché parmi les cartes.
- **Bouton « Reconnecter »** — quand une connexion expire, on la rétablit depuis le message
  qui vient de le signaler.

### Améliorations & corrections
- Le masquage reconnaît de nouveaux formats de données sensibles.
- Le compteur d'informations protégées gagne en précision.
- L'aperçu d'un document rend compte plus fidèlement de son masquage.
- La liste des conversations et les menus s'utilisent au clavier.
- Les chiffres du sélecteur de modèles portent leur unité.
- En thème sombre, plusieurs éléments regagnent en lisibilité.

## 0.4.1 — 2026-08-07
> Un centre d'aide en ligne, un avis qui part sans quitter la réponse, et des offres qui
> passent de trois paliers à deux. Un changement à connaître : le tarif de Solo change.

### Nouveautés
- **Un centre d'aide en ligne** — l'installation, l'usage, et surtout ce que
  l'application protège et où vont vos données.
- **Donner un avis sans quitter la réponse** — une icône sous chaque réponse ouvre le
  formulaire, avec le journal technique déjà joint si vous l'aviez activé.
- **Une compétence proposée par le modèle s'ajoute d'un bouton** — au lieu de la recopier.

### Améliorations & corrections
- Les offres passent à deux paliers : Solo est à 12 €/siège avec 8 € de crédits, la même
  enveloppe que Team ; Scale n'est plus proposé et les abonnements en cours continuent.
- Un prénom accentué pouvait, dans certains cas, partir en clair à l'intérieur de son
  propre remplacement — corrigé.
- Entre vos appareils, chacun n'accède plus qu'aux données qui le concernent.
- « Demander » sur plusieurs fichiers les joint désormais tous, au lieu d'un seul.
- Un envoi qui échoue s'explique en français clair — clé refusée, compte fournisseur à
  sec, quota épuisé — avec le geste à faire et l'heure de reprise.
- Le chargeur n'annonce plus une recherche pendant un envoi, et ne disparaît plus dès le
  premier mot écrit.

## 0.4.0 — 2026-08-05
> Drive et OneDrive s'ouvrent dans la conversation, l'assistant consulte sans vous
> interrompre à chaque pas, et l'application se met à jour en cours de session. Un
> changement à connaître : la clé de l'application ne sert plus que deux fournisseurs.

### Nouveautés
- **Google Drive et OneDrive se parcourent comme un dossier de votre machine** — depuis le
  panneau « Dossiers », sans quitter la conversation ni rien synchroniser.
- **Consulter ne demande plus la permission à chaque pas** — seule une écriture vous
  interrompt, et une vingtaine de lectures tiennent désormais en un seul tour.
- **Les mises à jour n'attendent plus un redémarrage** — l'application revérifie en cours de
  session au lieu de ne regarder qu'au lancement.

### Améliorations & corrections
- Sur sa propre clé, l'application ne sert plus qu'OpenRouter et Scaleway ; OpenAI,
  Anthropic, Google, Mistral et DeepSeek demandent désormais votre clé personnelle.
- L'accent du produit devient l'indigo : le vert quitte l'application, y compris pour les
  comptes qui l'avaient choisi.
- L'accueil s'ouvre sur un bonjour, avec des amorces qui parlent des services que vous avez
  réellement connectés.
- La Bibliothèque, les Compétences et les Workflows se regardent en grille ou en liste, et
  le journal du masquage se lit conversation par conversation.
- Quatre corrections de masquage : « lundi » n'est plus pris pour un nom, un lien vers un
  service connecté garde sa vraie adresse, une adresse de document n'est plus rangée parmi
  les secrets, et un faux nom complet se tire dans un vivier bien plus large.
- Un message d'échec dit la cause plutôt que le mode d'emploi, et un dossier distant qui ne
  répond pas le dit au lieu de charger indéfiniment.

## 0.3.4 — 2026-08-02
> Choisir un modèle ne demande plus de choisir un fournisseur, vos fichiers se retrouvent
> par ce qu'ils sont, vos documents s'écrivent dans l'app — et le masquage dit désormais
> ce dont il n'est pas sûr.

### Nouveautés
- **Un sélecteur de modèles qui ne vous demande plus de choisir** — une courte liste, le
  catalogue complet à un clic, et un modèle par défaut gratuit : vous écrivez dès
  l'installation, sans clé ni abonnement.
- **« À vérifier » : le masquage annonce ses doutes** — un élément détecté sans certitude
  est signalé comme tel dans le récapitulatif d'avant-envoi, au lieu d'un verdict uniforme.
- **Retrouvez un fichier par ce qu'il est** — « les documents fiscaux », « le bail de
  l'appartement » : le rapprochement se fait sur votre ordinateur, et l'assistant ne
  reçoit que les fichiers les plus proches.

### Améliorations & corrections
- Vos documents s'éditent en place, sans passer par le markdown : titres, listes,
  citations et blocs de code gardent leur forme à l'enregistrement.
- La réflexion du modèle reste visible pendant l'attente, puis repliée au-dessus de la
  réponse, et survit au rechargement.
- Brancher OpenRouter ne demande plus de coller une clé : l'autorisation se fait dans le
  navigateur.
- Un fichier ou un dossier se glisse directement sur une conversation, et un fichier cité
  dans une réponse s'ouvre d'un clic dans le panneau latéral.
- Le masquage reconnaît environ 15 000 prénoms de plus, corrige plusieurs sur-masquages
  mesurés sur de vrais documents (un horodatage pris pour une carte, une date de relevé
  pour un téléphone) et referme trois fuites, dont un nom de fichier accentué.
- Les faux identifiants respectent leur clé de contrôle, les règles d'une conversation
  gouvernent aussi ses documents, Stop interrompt un envoi avant l'appel au modèle, et
  l'application est allégée de 346 Mo.

## 0.3.3 — 2026-07-30
> Une mémoire qui se relit, se corrige et se comprend, un masquage honnête sur ses
> limites, et vos dossiers modifiables directement dans l'app.

### Nouveautés
- **La Mémoire, revue de fond en comble** — recherchez vos fiches, relisez ce que
  l'extraction automatique a noté, revenez en arrière d'un clic sur « Rétablir », et
  coupez la mémoire pour une conversation sensible.
- **Honnête sur ce que le masquage peut fausser** — un âge calculé depuis une date
  masquée, une question sur une entreprise au nom d'emprunt : le composeur vous prévient
  avant l'envoi et propose « garder en clair ».
- **Vos dossiers, dans l'app** — parcourez et modifiez les dossiers autorisés depuis la
  Bibliothèque, et regardez le modèle écrire dans un fichier en direct.

### Améliorations & corrections
- La recherche en mémoire comprend le sens : « mon client du secteur audio » retrouve la
  fiche qu'aucun mot ne nomme, calculé entièrement sur votre machine.
- La notoriété suit votre niveau : en Standard et Renforcé, marques et personnalités
  publiques restent lisibles ; en Strict, elles sont masquées aussi.
- Un nouveau réglage fait voir au modèle des jetons neutres ([PERSONNE1]) plutôt que des
  faux vraisemblables.
- La vue côte à côte montre votre message et sa version masquée telle qu'elle est partie,
  et démasquer un élément le rend à son texte normal au lieu de le barrer.
- Le masquage progresse sur les dates d'actes (bail, embauche, mariage), les BIC entre
  guillemets, les chaînes de connexion et les documents administratifs — mesuré sur un
  banc de corpus rejoué à chaque changement.
- Le changement de modèle ne peut plus faire tomber l'app, le lancement est vérifié par des
  tests automatiques avant chaque publication, et la page Versions dit simplement que
  l'application est à jour.

## 0.3.2 — 2026-07-21
> Vos prompts réutilisables à portée de « / », un masquage plus fin et plus sûr, et un
> agent qui garde le fil du début à la fin.

### Nouveautés
- **Compétences** — enregistrez vos prompts réutilisables et glissez-en un dans la
  conversation d'un simple « / » ; leur contenu reste sur votre machine.
- **Un faux propre à chaque conversation** — les valeurs de substitution sont uniques à
  chaque discussion, ce qui les rend bien plus difficiles à ré-identifier.
- **Un agent qui garde le fil** — un connecteur qui se coupe est rétabli sans interrompre
  votre demande, et chaque appel d'outil montre sa progression en direct.

### Améliorations & corrections
- Les personnalités, marques et lieux publics célèbres cités comme tels ne sont plus
  masqués : vos échanges restent lisibles.
- La protection des noms de personnes et d'entreprises est active par défaut.
- L'agent vous laisse choisir son moteur de recherche, et le catalogue de connecteurs
  s'enrichit de nouveaux services, descriptions et logos.
- L'écran des règles de masquage gagne une couleur par famille et des catégories
  simplifiées, et l'aperçu d'un document indique les catégories laissées de côté.
- Onglets, barre du haut, écran de démarrage et états vides des sections sont raffinés.
- Corrigés : le bouton de fermeture des fenêtres, le forçage d'un masquage depuis un
  message, et l'ouverture de la palette « ⌘K » depuis les Réglages.

## 0.3.1 — 2026-07-09
> Un premier contact plus clair, vos connecteurs MCP au même endroit, et un
> masquage encore plus fiable.

### Nouveautés
- **Onboarding repensé** — un parcours guidé qui met en place vos catégories à
  masquer et votre premier modèle en quelques secondes.
- **Onglet MCP** — connectez et gérez tous vos connecteurs (Gmail, Drive, Notion…)
  depuis un seul écran, chaque appel d'outil restant masqué.
- **OpenCode Zen** — une nouvelle plateforme de modèles disponible, avec les
  métadonnées de chaque modèle pour bien choisir.

### Améliorations & corrections
- Les modales de masquage sont refondues.
- Les polices sont embarquées en local : l'application fonctionne hors-ligne, sans
  Google Fonts.
- Les états « vu » qui restaient bloqués se déverrouillent.
- Le masquage est plus robuste sur les longs messages.
