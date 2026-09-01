# Release notes

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

---

## 0.8.0 — 2026-08-20
> Le niveau de masquage se règle désormais là où vous écrivez, message par message.

### Nouveautés
- **Le niveau de masquage, depuis la barre de saisie** — un clic le pose pour le message en cours, et le glyphe montre d'un coup d'œil ce qui sera masqué.
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
- **Un centre d'aide en ligne** — il explique l'installation, l'usage, et surtout ce
  que l'application protège et où vont vos données.
- **Donner un avis sans quitter la réponse** — une icône sous chaque réponse ouvre le
  formulaire, avec le journal technique déjà joint si vous l'aviez activé.
- **Une compétence proposée par le modèle s'ajoute d'un bouton** — au lieu de la recopier.

### Améliorations & corrections
- Les offres passent à deux paliers : Solo est désormais à 12 €/siège avec 8 € de crédits,
  soit la même enveloppe que Team, dont il ne se distingue plus que par les règles
  d'équipe ; Scale n'est plus proposé, et les abonnements en cours continuent normalement.
- Un prénom accentué pouvait, dans certains cas, partir en clair à l'intérieur de son
  propre remplacement — corrigé.
- Entre vos appareils, chacun n'accède plus qu'aux données qui le concernent.
- « Demander » sur plusieurs fichiers les joint désormais tous, au lieu d'un seul.
- Un envoi qui échoue s'explique en français clair — clé refusée, compte fournisseur à
  sec, quota épuisé — avec le geste à faire et l'heure de reprise.
- Le chargeur n'annonce plus une recherche pendant un envoi, et ne disparaît plus dès le
  premier mot écrit.

## 0.4.0 — 2026-08-05
> Vos dossiers Drive et OneDrive s'ouvrent dans la conversation, l'assistant consulte sans
> vous interrompre à chaque pas, et l'application se met à jour sans attendre un redémarrage. Un
> changement à connaître : les modèles servis sur la clé de l'application se réduisent à deux
> fournisseurs.

### Nouveautés
- **Google Drive et OneDrive se parcourent comme un dossier de votre machine** — depuis le
  panneau « Dossiers », sans quitter la conversation ni rien synchroniser.
- **Consulter ne demande plus la permission à chaque pas** — seule une écriture vous
  interrompt, et une vingtaine de lectures tiennent désormais en un seul tour.
- **Les mises à jour n'attendent plus un redémarrage** — l'application revérifie en cours de
  session au lieu de ne regarder qu'au lancement.

### Améliorations & corrections
- L'application ne sert plus que deux fournisseurs sur sa propre clé, OpenRouter et Scaleway :
  OpenAI, Anthropic, Google, Mistral et DeepSeek demandent désormais votre clé personnelle,
  et un envoi sans clé est refusé clairement plutôt que facturé ailleurs.
- L'accent du produit devient l'indigo : le vert quitte l'application, y compris pour les
  comptes qui l'avaient choisi.
- L'accueil s'ouvre sur un bonjour, avec des amorces qui parlent des services que vous avez
  réellement connectés.
- La Bibliothèque, les Compétences et les Workflows se regardent en grille ou en liste, une
  conversation se renomme depuis sa ligne, et le journal du masquage se lit conversation
  par conversation — comme la table de correspondance l'est déjà.
- Quatre corrections de masquage : « lundi » n'est plus pris pour un nom de personne, un
  lien vers un service connecté garde sa vraie adresse, une adresse de document n'est plus
  rangée parmi les clés et secrets, et un faux nom complet se tire dans un vivier bien plus
  large.
- Un message d'échec dit la cause plutôt que le mode d'emploi, une pièce jointe s'affiche au
  clic sans se faire attendre, et un dossier distant qui ne répond pas le dit au lieu de
  charger indéfiniment.

## 0.3.4 — 2026-08-02
> Choisir un modèle ne demande plus de choisir un fournisseur, vos fichiers se retrouvent
> par ce qu'ils sont, vos documents s'écrivent dans l'app — et le masquage dit désormais
> ce dont il n'est pas sûr.

### Nouveautés
- **Un sélecteur de modèles qui ne vous demande plus de choisir** — il s'ouvre sur une
  courte liste, sans prix ni drapeau ; le catalogue complet reste à un clic, et l'application
  retient votre préférence. Le modèle par défaut est gratuit : vous écrivez dès
  l'installation, sans clé et sans abonnement.
- **Cliquez le texte, écrivez** — vos documents s'éditent en place, sans quitter l'application
  ni passer par le markdown : titres, listes, citations et blocs de code gardent leur
  forme à l'enregistrement. Un clic sur un lien reste un clic sur un lien, et une
  sélection reste copiable.
- **« À vérifier » : le masquage annonce ses doutes** — quand un élément détecté n'est
  pas certain, il est signalé comme tel dans le récapitulatif d'avant-envoi. Vous voyez
  ce qui est solide et ce qui mérite un œil, au lieu d'un verdict uniforme.
- **Retrouvez un fichier par ce qu'il est** — « les documents fiscaux », « le bail de
  l'appartement » : plus besoin de deviner un mot de son nom. Le rapprochement se fait
  **sur votre ordinateur**, et l'assistant n'en reçoit que les fichiers les plus proches.
- **La réflexion du modèle se garde** — visible pendant l'attente quand le modèle en
  produit une, puis conservée, repliée au-dessus de la réponse. Elle survit au
  rechargement : c'est le seul récit de l'endroit où sont passées quarante secondes.

### Améliorations & corrections
Brancher OpenRouter ne demande plus de coller une clé : l'autorisation se fait dans le
navigateur. Un fichier ou un dossier se **glisse** directement sur une conversation, et un
fichier cité dans une réponse s'ouvre d'un clic dans le panneau latéral. Quand un appel
d'outil échoue, l'application nomme la cause au lieu de vous laisser deviner — et ne vous propose
de changer de modèle que quand cela peut réellement aider ; une erreur d'API Google dit
maintenant quoi faire, sur tous les outils. La Mémoire se range en la traitant, et
sélectionner une fiche rapproche la vue sur son voisinage.

Côté masquage, la détection s'élargit nettement — environ 15 000 prénoms supplémentaires
— et plusieurs sur-masquages mesurés sur de vrais documents sont corrigés : un horodatage
n'est plus pris pour un numéro de carte, une date de relevé bancaire pour un téléphone, un
pied de facture pour un nom de personne. À l'inverse, trois fuites réelles sont refermées,
dont un nom de fichier accentué qui partait en clair. Les identifiants de remplacement
respectent leur propre clé de contrôle — un faux numéro ressemble à un vrai numéro — et les
règles définies pour une conversation gouvernent enfin aussi ses documents. Le bouton Stop
interrompt un envoi avant même l'appel au modèle, les réglages affichent ce qui est
réellement appliqué, un CSV est correctement surligné, les valeurs masquées ne sont plus
tronquées dans les documents scannés, et l'application est allégée de 346 Mo.

## 0.3.3 — 2026-07-30
> Une mémoire qui se relit, se corrige et se comprend, un masquage honnête sur ses
> limites, et vos dossiers modifiables directement dans l'app.

### Nouveautés
- **La Mémoire, revue de fond en comble** — recherchez vos fiches et parcourez-les en
  liste, relisez d'un geste ce que l'extraction automatique a noté (« Nouveautés »),
  et chaque mise à jour garde l'ancienne version sous la main : un clic sur
  « Rétablir » revient en arrière. Un interrupteur coupe la mémoire pour une
  conversation sensible — dans les deux sens.
- **La recherche en mémoire comprend le sens** — « mon client du secteur audio »
  retrouve la fiche qu'aucun mot ne nomme, calculé entièrement sur votre machine.
  Et quand une fiche attendue ne part pas (prénom trop courant seul, place
  insuffisante), l'application vous le dit avec le geste qui corrige.
- **Honnête sur ce que le masquage peut fausser** — un âge calculé depuis une date
  masquée, une question sur une entreprise au nom d'emprunt : le composeur vous
  prévient avant l'envoi et propose « garder en clair ». Chaque niveau de
  protection affiche désormais sa contrepartie, et la doc dit le reste.
- **La notoriété suit votre niveau** — en Standard et Renforcé, marques et
  personnalités publiques restent lisibles ; en Strict, elles sont masquées aussi.
  Un nouveau réglage à part fait voir au modèle des jetons neutres ([PERSONNE1])
  plutôt que des faux vraisemblables.
- **Vos dossiers, dans l'app** — parcourez et modifiez les dossiers autorisés depuis
  la Bibliothèque, regardez le modèle écrire dans un fichier en direct, ajoutez un
  dossier sans tout ré-autoriser. L'assistant corrige un passage d'un document Word
  sans réécrire le reste.
- **Voyez ce que le modèle a vu** — la vue côte à côte montre votre message et sa
  version masquée telle qu'elle est partie, et démasquer un élément le rend à
  son texte normal au lieu de le barrer.

### Améliorations & corrections
Le masquage gagne sur tous les fronts : les dates d'actes (bail, embauche, mariage)
sont protégées comme les personnes qu'elles rattachent, les BIC entre guillemets ou
parenthèses et les chaînes de connexion ne partent plus en clair, la même ville reçoit
le même lieu d'emprunt partout (les questions « même région ? » restent justes), et
les documents administratifs (scolarité, permis, avis d'imposition) sont mieux
couverts — mesuré sur un banc de corpus rejoué à chaque changement. Les clés de
l'application couvrent désormais 100 % des capacités Google. Côté stabilité : le changement de
modèle ne peut plus faire tomber l'app, le lancement est vérifié par de nouveaux
tests automatiques avant chaque publication, et la page Versions dit simplement
que l'application est à jour.
> Vos prompts réutilisables à portée de « / », un masquage plus fin et plus sûr, et
> un agent qui garde le fil du début à la fin.

### Nouveautés
- **Compétences** — enregistrez vos prompts réutilisables et glissez-en un dans la
  conversation d'un simple « / ». Leur contenu reste sur votre machine.
- **Moins de masquage inutile** — l'application ne masque plus les personnalités, marques
  et lieux publics célèbres cités comme tels : vos échanges restent lisibles.
- **Un faux propre à chaque conversation** — les valeurs de substitution sont désormais
  uniques à chaque discussion, ce qui les rend bien plus difficiles à ré-identifier.
- **Un agent qui garde le fil** — un connecteur qui se coupe est rétabli sans
  interrompre votre demande, et chaque appel d'outil montre sa progression en direct
  (et se relance s'il se bloque).

### Améliorations & corrections
Protection des noms et entreprises active par défaut, choix du moteur de recherche pour
l'agent, catalogue de connecteurs enrichi (nouveaux services, descriptions et logos),
écran des règles de masquage plus lisible avec une couleur par famille, catégories
simplifiées, et l'aperçu d'un document qui indique les catégories laissées de côté. De
nombreux raffinements visuels (onglets, barre du haut, écran de démarrage, états vides
des sections) et des corrections — le bouton de fermeture des fenêtres, le forçage d'un
masquage depuis un message, et l'ouverture de la palette « ⌘K » depuis les Réglages.

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
Modales de masquage refondues, polices embarquées en local (hors-ligne, sans
Google Fonts), déverrouillage des états « vu » bloqués, et un masquage plus
robuste sur les longs messages.
