# Le fichier maître

**Ce que l'app fait, ce que ça apporte, où c'est, et comment on y accède.** Une entrée par
fonctionnalité : ce qu'elle permet, ce qu'elle change pour la personne qui s'en sert, ce
qu'elle vaut — puis la liste exacte des gestes possibles.

> **Règle dure (racine, règle 13).** Ce fichier est synchronisé avec le réel, toujours.
> Une fonctionnalité livrée sans sa ligne ici est une fonctionnalité que personne ne
> retrouve ; une ligne qui survit à son code est pire — elle promet ce qui n'existe plus.
> **Vérifié par `pnpm check:features`** (CI) : il relit les listes que le produit tient
> déjà en source unique (sections, onglets, réglages, écrans, modales), exige que chacune
> soit nommée ici, vérifie que tout chemin cité existe et que les compteurs sont les vrais.
> Ce que le gate ne sait PAS faire : dire qu'une phrase a vieilli. D'où les checklists —
> des gestes qu'on refait à la main, pas des intentions.

**Comment lire une entrée.** `**Accès** :` est le chemin littéral depuis l'app ouverte.
**Ce que ça permet** décrit la capacité, **Ce que ça vous apporte** le changement côté
utilisateur, **Ce que ça vaut** l'arbitrage — y compris ce que ça coûte quand ça coûte.
La checklist énumère les gestes ; une case décochée est une chose que l'app **ne fait pas
encore**, pas un bug.

**Périmètre.** Le produit = l'app desktop (Electron). L'aperçu web monte la même UI avec
moins de capacités — signalé par 🌐 (aperçu) quand ça diffère ; 📱 marque les écrans de la
coquille mobile de `packages/ui` (déclinaison construite hors de ce dépôt).

**Trois accès sont gouvernables à distance** — **Bibliothèque** (§ 4), **Compétences** (§ 5)
et **Mémoire** (§ 6) : un drapeau retire leur écran, leur entrée de navigation, leur résultat
⌘K et leur lien profond. ⚠️ Fermer un accès ferme une PORTE, **pas la fonctionnalité** : la
Mémoire continue d'accompagner les envois et de se noter, la Bibliothèque de recevoir les
fichiers ; seules les Compétences cessent aussi d'être utilisables (palette « / », épingles,
proposition du modèle). Réseau injoignable ⇒ l'app garde les portes telles qu'elle les
connaît, jamais fermées — `packages/ui/src/state/featureAccess.ts`.

**Compteurs vérifiés** (recalculés par le gate à chaque exécution) —
<!-- n:sections -->5 sections · <!-- n:onglets-reglages -->11 onglets de réglages ·
<!-- n:ecrans -->8 écrans · <!-- n:categories-redaction -->17 catégories de redaction.
Le nombre de connecteurs n'est PAS annoncé ici : le catalogue se compose de cinq familles
(`packages/catalog/src/mcp/connectors/`) et un total écrit à la main serait invérifiable —
exactement ce que ce fichier n'a pas le droit de contenir.

---

## 1. La promesse : redaction et restitution

C'est le produit. Tout le reste est au service de ces trois temps : on masque avant
l'envoi, le modèle ne voit que la version masquée, la réponse revient avec vos vraies
valeurs remises à leur place.

### Redaction à l'envoi
**Accès** : automatique, à chaque envoi. Visible dans le bouton d'envoi (« Redaction » →
« Redacted »), les surlignages du composeur, et la pastille « N à redact ».

**Ce que ça permet.** Écrire à un modèle avec vos vraies informations — le nom du client,
son IBAN, l'adresse du chantier, le dossier médical — sans qu'aucune de ces valeurs quitte
la machine. L'app les repère (règles déterministes, sommes de contrôle, détecteurs de
forme, puis un modèle de langue qui tourne **sur votre appareil** pour les noms, sociétés
et lieux que rien ne permet de reconnaître à la forme), les remplace par des substituts de
même nature, envoie la version masquée, et rétablit vos valeurs dans la réponse via le
coffre de la conversation.

**Ce que ça vous apporte.** La question qu'on se pose avant chaque copier-coller — « est-ce
que je peux mettre ça dans un chatbot ? » — disparaît. Vous écrivez comme vous parlez.
C'est aussi ce qui rend utilisables des documents qu'on ne collait simplement pas : un
contrat, une fiche de paie, un compte rendu médical, un export CRM.

**Ce que ça vaut.** Un usage professionnel sans zone grise : les données personnelles ne
sortent pas de l'appareil, donc il n'y a rien à négocier avec la politique interne, rien à
justifier à un DPO, rien à espérer de la politique de rétention du fournisseur. Et la
qualité de la réponse est préservée : un faux nom reste un nom, un faux IBAN passe son
propre mod-97, une fausse ville est une vraie ville — le modèle raisonne juste, sur des
valeurs qui ne sont pas les vôtres.

- [x] Détection déterministe (règles, sommes de contrôle, formes) — `packages/redact/src/engine/`
- [x] Détection sémantique NER **sur l'appareil**, sans réseau — `packages/redact/src/local/`
- [x] Détection par modèle distant (moteur « cloud »), pour qui n'a pas la puissance locale — `packages/redact/src/remote/`
- [x] Substituts **vraisemblables** de même nature (défaut) — `packages/redact/src/model/pseudonymize/`
- [x] Substituts **marqueurs** `[PERSON1]` (mode sobre, opt-in) — `packages/redact/src/model/pseudonymize/allocateTokens.ts`
- [x] Restitution de la réponse par le coffre de la conversation — `packages/redact/src/engine/vault.ts`
- [x] **Échec = envoi bloqué**, jamais un repli silencieux sur moins de protection
- [x] Un seul substitut par valeur, sur toute la conversation (casses, fragments, échos d'outils)
- [x] Sel secret par conversation : le même nom ne donne pas le même faux ailleurs
- [x] Les personnalités publiques et les pays ne sont pas masqués (sinon le modèle répond à propos de personne)
- [ ] Restitution d'un marqueur que le modèle a traduit (« [PERSONNE1] ») — non couvert

### Les 17 catégories, et le niveau de protection
**Accès** : Réglages → **Confidentialité** → « **Niveau de protection** » (Standard /
Strict / Sur mesure), puis la matrice dépliable.
Aussi par conversation : ⋯ dans l'en-tête du chat → « Redaction · N protégés ».
Et **depuis la barre de saisie** : le bouton « niveau » de la rangée d'action ouvre les trois
mêmes niveaux, à l'endroit où l'on constate qu'un envoi masque trop — ou pas assez. Son glyphe
garde trois traits et en met en gras autant que le niveau en cours (1 · 2 · 3) ; chaque carte le sien. Un clic
pose le niveau sur LA CONVERSATION — le défaut global se change là où on le pèse (Réglages,
ou l'onglet « Par défaut » du menu ⋯) ; sans conversation encore créée, c'est le défaut qui
reçoit — `packages/ui/src/pages/ChatWorkspace/ComposerRedactMenu.tsx`

**Ce que ça permet.** Décider *ce qui* est protégé, par catégorie : noms, dates de
naissance, e-mails, téléphones, adresses, lieux, sociétés, cartes, IBAN, identifiants
nationaux et d'entreprise, IP, nombres, chemins de fichiers, santé, pseudos, URL, clés et
secrets. Trois niveaux nommés font le choix pour vous ; « Sur mesure » est le réglage à la
main. La portée est globale, ou **propre à une conversation**.

**Ce que ça vous apporte.** Le curseur entre discrétion et confort de réponse est le vôtre,
et il se déplace là où il faut : on peut travailler strictement sur un dossier RH et
laisser les noms de villes en clair sur une question de logistique, sans changer de réglage
global ni de compte.

**Ce que ça vaut.** La protection reste crédible parce qu'aucun préréglage ne la baisse —
il n'existe pas de « mode rapide » qui désactive discrètement des catégories. Et dans une
organisation, une catégorie imposée par l'admin ne peut être ni désactivée ni révélée par
un membre : la politique tient réellement, elle n'est pas qu'affichée.

- [x] Trois niveaux nommés, dont « Sur mesure » = un réglage à la main — `packages/ui/src/privacy/privacyLevel.ts`
- [x] Portée **globale** (Réglages) ou **par conversation** (modale du chat)
- [x] Aucun préréglage ne BAISSE la protection
- [x] Une catégorie imposée par l'organisation ne peut être ni désactivée ni révélée
- [x] L'aperçu du composeur obéit aux mêmes règles que l'envoi
- [x] Révéler ponctuellement une valeur détectée (et la re-masquer)
- [x] Une détection incertaine est marquée « **à vérifier** » (pointillé) dans l'aperçu — masquée par défaut, à garder en clair d'un clic si c'est un faux positif — `packages/ui/src/pages/ChatWorkspace/composerDetection.ts`
- [x] Notoriété suit le niveau : Standard/Renforcé épargnent grandes marques, intégrations MCP et personnalités publiques ; **Strict** les masque aussi — `packages/ui/src/privacy/privacyLevel.ts`
- [x] Chaque catégorie et chaque niveau disent aussi ce que le masquage peut FAUSSER (pas seulement ce qu'il couvre) — `packages/ui/src/components/PrivacyLevelPicker.tsx`

### Voir ce que le modèle a vu
**Accès** : sous une réponse → « Voir ce que le modèle a vu » (`TransparencyModal`), ou
Réglages → Confidentialité → « **Transparence · journal technique** ».

**Ce que ça permet.** Comparer, message par message, ce que vous avez écrit et ce qui est
réellement parti. Le comparatif n'est pas une copie prise à part : il rejoue la même
substitution que l'envoi, sur les mêmes données — il ne peut donc pas flatter le résultat.
À côté, un journal d'audit global filtrable, et un journal de débogage technique, tenu en
permanence sur l'appareil et conservé d'une session à l'autre (le réglage n'en gouverne
que la visibilité dans le menu ⋯ et la trace console).

**Ce que ça vous apporte.** La possibilité de **vérifier** au lieu de croire. C'est
particulièrement utile la première semaine, quand on teste le produit avec un œil sceptique
— et le jour où quelqu'un demande des comptes sur ce qui est sorti de la machine.

**Ce que ça vaut.** Une promesse de confidentialité invérifiable n'a pas de valeur. Celle-ci
s'ouvre en un clic depuis n'importe quelle réponse.

- [x] Comparatif message par message, votre texte ⇄ le texte parti — `packages/ui/src/privacy/transparency.ts`
- [x] Recalculé à la demande depuis le coffre (aucune copie séparée qui pourrait mentir)
- [x] **« Comprendre mon redaction »** — un petit conteneur sous les premières réponses ouvre le chapitre redaction du guide (personnalités laissées en clair, compteur à zéro d'une conversation sans donnée personnelle, Coffre pour les noms de code) ; « Fermer pour toujours » (`Settings.redactionIntroSeen`), le chapitre restant dans l'Aide ; jamais empilé avec l'encart de transparence — `packages/ui/src/privacy/redactionIntro.ts`, `packages/ui/src/pages/ChatWorkspace/RedactionIntroCard.tsx`
- [x] Journal d'audit global, filtrable et recherchable — Réglages → **Journal** (le journal par conversation, vue appauvrie du même coffre, a été retiré)
- [x] **Journal de débogage** technique, tour par tour, **persistant** (⋯ → « Journal de débogage », visible quand « Journal technique détaillé » est activé) — `packages/ui/src/containers/modals/DebugLogModal/`
- [x] Copier un échange **sans** la table de correspondance (le texte parti, seul)
- [x] **Envoyer le journal aux développeurs** — le journal de débogage ouvre « Votre avis » prérempli, l'export sans mapping joint et relisible avant l'envoi — `packages/ui/src/avis/avis.ts` (`debugJournalDraft`)
- [x] **Signaler depuis la réponse elle-même** — une icône d'avis dans la barre d'actions (à côté de Copier / Régénérer / Forker) ouvre « Votre avis » avec le journal de cette conversation déjà joint ; elle attire l'œil une fois par réponse, puis se tait — `packages/ui/src/avis/avis.ts` (`messageFeedbackDraft`)
- [x] Sur un rapport qui **emporte le journal**, l'humeur devient **facultative** — les logs sont le signal, et exiger une note avant d'envoyer coûtait le rapport qu'on veut le plus (le libellé le dit, le serveur applique la même règle) — `packages/ui/src/avis/avis.ts` (`canSendFeedback`)

### Affichage des valeurs protégées
**Accès** : Réglages → Confidentialité → deux réglages voisins :
« **Afficher des jetons plutôt que des pseudonymes** » et « **Le modèle ne voit que des jetons** ».

**Ce que ça permet.** Choisir la FORME du masquage, sur deux plans distincts. À l'écran :
lire « [PERSON1] » plutôt qu'un faux nom, pour distinguer d'un coup d'œil ce qui est
protégé. Sur le fil : n'envoyer au modèle que des marqueurs, pour qu'il ne reste rien de la
personne — pas même la vraisemblance.

**Ce que ça vous apporte.** Le premier réglage supprime le doute de lecture (« ce nom, il
est vrai ou pas ? »). Le second répond à un besoin plus dur : un faux nom reste un nom, donc
un genre et une origine plausibles ; un faux code postal reste une région. Pour qui veut
que **rien** ne transite, c'est le seul mode qui tient.

**Ce que ça vaut.** Le premier est gratuit. Le second se paie, et c'est mesuré :
les faux préservent 6 signaux sur 10 dont dépendent des réponses courantes (civilité
et accords, ville pour une formule de clôture, pays d'un IBAN, classe d'un numéro), les
marqueurs 2 sur 10. Le mode est donc un choix éclairé, pas un défaut caché — et il est
épinglé sur la conversation pour qu'un basculement ne mélange pas les deux vocabulaires.

- [x] Le premier change ce que **vous** voyez (vues « Redacted » des documents)
- [x] Le second change ce qui **part** — et se paie en qualité de réponse (mesuré)
- [x] Le mode d'envoi est épinglé sur la conversation, pas relu en cours de route
- [ ] Basculer une conversation déjà commencée dans l'autre mode — volontairement impossible

---

## 2. Conversations

Le cœur d'usage : c'est l'écran où l'on passe ses journées.

### Écrire, envoyer, recevoir
**Accès** : section **Conversations** (rail de gauche, ou ⌘K).

**Ce que ça permet.** Une conversation multi-modèles classique — flux de réponse, arrêt en
cours, édition, régénération — avec deux différences : le composeur **montre** ce qui sera
masqué pendant que vous tapez, et plusieurs conversations tournent en parallèle, chacune
avec son propre tour, ses propres règles et son propre coffre.

**Ce que ça vous apporte.** Rien à apprendre par rapport à un chatbot ordinaire, sauf que
vous voyez la protection travailler avant d'envoyer. Le travail en parallèle change le
rythme : on lance une recherche longue dans un onglet et on continue à écrire dans un autre,
au lieu d'attendre.

**Ce que ça vaut.** L'espace de travail divisible (deux conversations côte à côte, ou une
conversation et un document) évite l'aller-retour permanent entre fenêtres — c'est ce qui
rend tenable un usage documentaire réel. Les brouillons ne sont jamais écrits sur le disque :
un message à moitié rédigé, forcément le plus sensible, reste en mémoire vive.

- [x] Composeur avec surlignage vivant de ce qui sera redacted — `packages/ui/src/pages/ChatWorkspace/Composer.tsx`
- [x] « Nouvelle conversation » ne **crée** rien : elle montre l'écran d'accueil, et la
      conversation naît au **premier envoi** — plus de lignes « Nouvelle conversation »
      vides dans la liste après un clic sans suite — `packages/ui/src/workspace/layout/ops.ts` (`showWelcome`)
- [x] Envoi bloqué tant que l'analyse tourne (le bouton le dit)
- [x] Réponse en flux, arrêtable (« Stop »)
- [x] Réflexion du modèle affichée pendant l'attente, quand le modèle en produit une (DeepSeek, Qwen, Nemotron, Claude, Gemini, OpenRouter…) — un-redacted comme la réponse ; sinon le chargeur seul, rien d'inventé — `packages/ui/src/state/reasoningRelay.ts`
- [x] …et **conservée** une fois la réponse arrivée : une ligne « Réflexion » repliée au-dessus de la réponse, dépliable, qui survit au rechargement (base chiffrée seule) — `packages/ui/src/components/message/ReasoningPanel.tsx`
- [x] Amorces sur une conversation vide, en **deux rangées de quatre** : « Sans rien
      configurer » (rédaction, recherche, mémoire, analyse — rien à régler) et « Avec vos
      services » (trier sa boîte mail, retrouver un document, préparer sa journée,
      rattraper ses canaux), chaque carte portant la marque du service —
      `packages/ui/src/pages/ChatWorkspace/starters.ts`
- [x] Un service NON connecté se replie en **puce** sur une seule ligne (« Ou connectez :
      Gmail · Drive · Agenda ») qui ouvre la modale du connecteur par-dessus l'écran ; il
      ne propose jamais une question que rien ne pourrait honorer
- [x] « **Voir les autres** » au bout de cette ligne ouvre le catalogue complet
      (Réglages → Connecteurs) : les puces ne portent que les services des amorces —
      `packages/ui/src/pages/ChatWorkspace/EmptyPromptSuggestions.tsx`
- [x] « **Ne plus proposer** » masque les amorces, et « Voir des exemples » les rétablit
      au même endroit (`Settings.startersOff`)
- [x] Plusieurs conversations en parallèle, chacune avec son tour
- [x] Onglets de conversation + espace de travail divisible — `packages/ui/src/workspace/`
- [x] Brouillons conservés par conversation, **en mémoire seulement**
- [x] Éditeur plein écran pour un brouillon long, avec onglet Aperçu
- [x] Supprimer une conversation ; en ouvrir plusieurs dans des onglets
- [x] Renommer ou supprimer une conversation depuis sa ligne dans la liste (⋯ au survol) :
      renommage **sur place**, suppression confirmée — `packages/ui/src/containers/shell/ConvRow.tsx`
- [x] Un tour d'outils interrompu (fermeture, plantage, mise à jour) **reprend** au lieu de
      tout refaire, et une action dont on ignore l'issue est signalée comme telle au modèle
      plutôt que rejouée à l'aveugle — `packages/ui/src/agent/turnCheckpoint.ts`
- [x] Une conversation trop longue pour le modèle garde un **résumé de son début** au lieu de
      le perdre en silence — `packages/ui/src/send/contextSummary.ts`
- [x] Avertissement d'utilité : une pastille dit quand la réponse dépendra d'une donnée redacted (âge calculé, distance, entreprise inconnue) — « garder en clair » ou ignorer — `packages/ui/src/pages/ChatWorkspace/utilityRisk.ts`
- [ ] File d'attente d'un envoi lancé pendant l'analyse (la touche Entrée est ignorée)

### Choisir et changer de modèle
**Accès** : le nom du modèle sous la zone de saisie · Réglages → **Modèles** (« Liste de
modèles ») pour le défaut et vos accès.

**Ce que ça permet.** Changer de modèle à tout moment, y compris au milieu d'une
conversation. Le sélecteur ne liste que ce que **vous** pouvez envoyer : les modèles
gratuits, ceux couverts par votre abonnement (Scaleway en France + une sélection
OpenRouter) et ceux dont vous avez renseigné la clé (OpenAI, Anthropic, Google, Mistral,
DeepSeek, OpenRouter) — plus **le modèle qui tourne sur votre propre machine**. Chaque
carte porte son prix, sa fenêtre de contexte, ses forces et ses faiblesses, et le drapeau
du pays où l'inférence est hébergée.

**Ce que ça vous apporte.** Le bon modèle pour la tâche, sans changer d'outil ni
d'abonnement : un modèle gratuit pour brouillonner, un modèle de raisonnement pour un
dossier difficile, un modèle français quand la juridiction compte, un modèle local quand
rien ne doit sortir du tout.

**Ce que ça vaut.** Le catalogue OpenRouter est récupéré en direct plutôt que maintenu à la
main, donc les identifiants ne rouillent pas. Le modèle qui a répondu reste inscrit sur sa
réponse : relire une vieille conversation, c'est savoir qui a écrit quoi.

- [x] Liste filtrable (recherche + famille + prix) — `packages/ui/src/pages/Settings/models/`
- [x] **Seuls les modèles utilisables sont proposés** : abonnement, clés renseignées,
      gratuits. Un modèle local non configuré reste visible mais grisé (il se répare sur
      votre machine), et le modèle en cours ne disparaît jamais de sa propre liste —
      `packages/ui/src/send/modelAvailability.test.ts`
- [x] En tête de la liste, **vos accès** : une petite carte cliquable par fournisseur,
      avec son état (clé enregistrée / inclus / à ajouter) ; un clic ouvre sa clé — et
      pour OpenRouter, la même fenêtre propose « **Obtenir une clé gratuitement** »
      (autorisation dans le navigateur, la clé naît sur VOTRE compte). L'abonnement est
      proposé une seule fois, sous la grille : c'est un fait de compte, pas de
      fournisseur — `packages/ui/src/pages/Settings/models/ProviderAccess.test.tsx`
- [x] **Ni abonnement ni clé ⇒ une pastille discrète** le dit une fois, dans le coin bas
      de l'app (dépliée au clic), et
      mène à « Vos accès ». Elle annonce ce qui MANQUE, jamais un blocage (les modèles
      gratuits marchent sans rien), se tait pour un membre d'organisation — ses accès ne
      sont pas à lui d'acheter — et tant que la facturation n'est pas chargée —
      `packages/ui/src/state/accessNotice.test.ts`
- [x] La fenêtre de clé DIT qu'une clé est déjà enregistrée (sans jamais la relire :
      elle vit chiffrée côté privilégié), propose de la **remplacer**, et de la **retirer**
      — `packages/ui/src/containers/modals/ApiKeyModal.tsx`
- [x] Drapeau de **juridiction d'hébergement** par modèle
- [x] Modèle par défaut des nouvelles conversations
- [x] « **Modèle sur votre ordinateur** » (Ollama / LM Studio) — Réglages → Modèles
- [x] « **Votre abonnement Claude** » (opt-in, OFF par défaut) — Réglages → Modèles : si la
      CLI Claude Code est installée et connectée, un groupe « Claude Code » s'ajoute au
      sélecteur, sans clé API — le défaut de l'abonnement plus les familles Sonnet /
      Opus / Haiku (Opus selon l'offre), servis par la CLI en local, redaction
      inchangé. **Les connecteurs de l'app y fonctionnent comme sur un modèle à clé** :
      c'est la boucle de l'app qui pilote, un pont MCP local capturant l'appel d'outil
      pour qu'il passe par le coffre et la porte d'écriture (l'appel sort un-redacted,
      le résultat rentre re-redacted) — `apps/desktop/src/main/subscription/`
- [x] Catalogue OpenRouter récupéré en direct
- [x] Le modèle qui a répondu reste inscrit sur la réponse
- [ ] **Mode « Auto »** — RETIRÉ du sélecteur le 11/08 : plus aucune des deux vues ne le
      propose. Le routeur reste en place et sert les conversations déjà posées dessus
      (choix du modèle à chaque envoi selon la tâche, uniquement parmi ce que le compte
      peut réellement envoyer ; légende « choisi automatiquement · via votre abonnement »
      sur chaque réponse routée) — `packages/ui/src/send/autoRoute.test.ts`,
      `packages/ui/src/send/autoTaskIntent.test.ts`
- [x] Un modèle inaccessible explique ce qu'il faut pour y accéder — `packages/ui/src/containers/modals/ModelAccessModal.tsx`
- [x] **Deux vues du sélecteur** : **simplifiée par défaut** (une courte liste de favoris,
      sans prix ni drapeau) ou complète (tous les fournisseurs, colonnes + recherche) —
      bascule dans le menu, dans les deux sens, et retenue —
      `packages/ui/src/components/ModelSelector/simpleList.test.ts`
- [x] **La liste courte est PERSONNALISABLE** (réglage « Modèles favoris ») : une étoile sur
      chaque modèle (dans le sélecteur complet comme dans Réglages → Modèles) l'épingle ; ses favoris
      REMPLACENT alors la liste par défaut. Vide = la liste gouvernable d'usine ; des
      favoris tous devenus inatteignables retombent dessus pour que le menu ne soit jamais
      vide. Local à l'appareil — `packages/ui/src/components/ModelSelector/simpleList.test.ts`
- [x] **Le modèle par défaut se désigne DEPUIS le menu** : un marqueur maison sur chaque
      ligne, plein sur le défaut actuel, cliquable ailleurs pour le devenir — le même
      réglage que Réglages → Modèles, désormais à portée du chat —
      `packages/ui/src/components/ModelSelector/ModelRow.test.ts`
- [x] La liste par défaut n'est faite que de modèles utilisables **sans abonnement**, et
      le modèle en cours y figure toujours, même hors favoris
- [x] Un fournisseur n'apparaît que s'il est **atteignable** : Scaleway par l'abonnement,
      OpenRouter par l'abonnement OU votre clé, les cinq autres par votre clé seulement

### Fichiers dans une conversation
**Accès** : trombone du composeur, ou **glisser-déposer** un fichier ou un dossier sur la
conversation.

**Ce que ça permet.** Déposer un PDF, un scan, une image, un document Office, un CSV — et
l'envoyer **déjà masqué**. Le texte est extrait, un scan passe par l'OCR avec sa couche
texte réconciliée, et le redaction a lieu **au dépôt**, avant tout envoi. Un aperçu montre
trois vues : le document, sa version redacted, la couche OCR.

**Ce que ça vous apporte.** Les documents, c'est là que la donnée sensible est réellement
concentrée — et c'est précisément ce qu'on n'osait pas déposer. Ici on voit, avant d'envoyer,
exactement ce qui est masqué et ce qui ne l'est pas ; et on peut masquer un mot de plus à la
main, par sélection ou par clic sur un mot de la page.

**Ce que ça vaut.** Le redaction au dépôt, avec aperçu, transforme un acte risqué en acte
vérifiable. Et une carte de correspondance devenue périmée (les règles ont changé depuis)
est **signalée** plutôt que réutilisée en silence : c'est ce qui empêche une protection
d'hier de passer pour la protection d'aujourd'hui.

- [x] PDF, images, Office (docx/pptx/xlsx), CSV, texte
- [x] **Glisser-déposer** : un fichier est joint au message — `packages/ui/src/pages/ChatWorkspace/dropIntake.ts`
- [x] Déposer un **dossier** propose de l'ajouter aux dossiers autorisés ; la confirmation
      se fait dans la fenêtre du système, jamais dans l'app — `packages/ui/src/pages/ChatWorkspace/grantDroppedFolder.ts`
- [x] OCR sur un scan, avec couche texte réconciliée — `packages/redact/src/ocr/`
- [x] **Le plafond d'OCR se VOIT et se lève** — par défaut, 10 pages (plusieurs secondes chacune : un dossier de 300 pages est un choix, pas une attente subie) ; au-delà, le chip dit « 10/32 pages lues » et offre « Lire tout » (ré-extraction sans plafond, même chorégraphie que la première : progression, re-redaction) — `packages/ui/src/pages/ChatWorkspace/ocrShortfall.ts`
- [x] Dans l'aperçu, un **halo** (teinte du thème, lavis léger) marque le texte qui, redacted, part au modèle ; la légende de la première page est un **bouton** qui masque/réaffiche le halo (préférence retenue) — `packages/ui/src/containers/modals/viewers/pdf/textHalo.ts`
- [x] Redaction du document **au dépôt**, avant tout envoi
- [x] Aperçu avant envoi : le document (Pages redacted / Feuille / Image…) · Original · Redacted (« ce qui quittera la machine », coupé à la limite d'envoi) · Texte de l'image — avec l'état du redaction (en cours / échec / compte) dans l'en-tête — `packages/ui/src/containers/modals/viewers/AttachmentPreviewModal.tsx`
- [x] Redact un mot à la main dans l'aperçu (sélection ou clic sur un mot)
- [x] Envoi d'un document en **images redacted** vers un modèle multimodal
- [x] Une carte qui a vieilli (règles changées) est signalée + reredactable
- [x] Un document non terminé ou en échec bloque l'envoi

### Gestes sur le texte
**Accès** : sélection dans le composeur ou dans un message → menu contextuel.

**Ce que ça permet.** Reprendre la main sur la détection, dans les deux sens : masquer une
valeur que rien n'a repérée (en choisissant son type), ou garder en clair une valeur
détectée à tort. Plus les gestes de conversation habituels — copier, régénérer, éditer — et
« Préciser », qui cite un passage de la réponse dans le composeur.

**Ce que ça vous apporte.** Aucun détecteur n'est parfait ; ce qui compte, c'est que la
correction prenne deux secondes et **persiste**. Une valeur masquée à la main le reste dans
tous les messages suivants de la conversation.

**Ce que ça vaut.** C'est la soupape qui rend le système utilisable au quotidien : sans
elle, une seule fausse détection sur un mot fréquent rendrait la conversation illisible, et
un seul oubli obligerait à tout réécrire ailleurs.

- [x] « Redact » une valeur choisie, avec son type — `packages/ui/src/components/SelectionMenu.tsx`
- [x] « Garder en clair » une valeur détectée (clic sur le surlignage, ou la puce)
- [x] « Préciser » : citer un passage de la réponse dans le composeur
- [x] Copier / régénérer / éditer un message
- [x] `/` ouvre la palette : compétences (routines comprises), « **Retenir en mémoire** » — `packages/ui/src/pages/ChatWorkspace/slashPalette.ts`

### Artéfacts et code
**Accès** : automatique quand le modèle produit un document ou du code long.

**Ce que ça permet.** Sortir le résultat du fil : un document ou un long code s'ouvre dans
un panneau à côté de la conversation. Le code Python s'exécute dans un bac à sable au
niveau du système d'exploitation, un document généré s'exporte en PDF.

**Ce que ça vous apporte.** Le passage de « le modèle a écrit quelque chose » à « j'ai un
fichier utilisable » se fait sans quitter l'app ni recoller le texte ailleurs.

**Ce que ça vaut.** Le code produit par un modèle s'exécute sur des données **un-redacted**
— donc réelles. C'est pour ça qu'il tourne sous une jail OS, dans son propre processus, et
pas dans l'application : la commodité ne se paie pas en surface d'attaque.

- [x] Panneau latéral d'artéfact — `packages/ui/src/pages/ChatWorkspace/ArtifactPanel/`
- [x] Exécution de code Python dans un bac à sable OS — `apps/desktop/src/main/python/`
- [x] Export d'un document généré en PDF — `apps/desktop/src/main/pdf/`
- [x] **Conçu comme un document, pas comme une réponse** : le modèle reçoit une consigne
      de design (structure par type — lettre/rapport/note —, tableaux pour les
      comparaisons, interdits de rendu), et l'export applique la **micro-typographie
      française** (insécables avant « : ; ! ? », dans « », milliers et unités soudés —
      jamais dans le code) — `packages/ui/src/components/export/microTypography.ts`
- [x] **Édition en place** d'un document généré : on clique le texte et on écrit, mise en forme conservée, raccourcis `# `/`- `/`1. `/`> ` et ⌘B/⌘I/⌘E — `packages/ui/src/components/markdown/blocks/DocumentCard/editor/DocumentEditor.tsx`
- [x] Aperçu tableur (CSV/XLSX), lecture seule — `packages/ui/src/containers/modals/SpreadsheetViewer/`
- [x] Un chemin unique pour ouvrir ce qu'une réponse produit (livrable) — `packages/ui/src/containers/shell/hooks/useOpenDeliverable.ts`
- [ ] Exécution d'un autre langage que Python

---

## 3. Outils, connecteurs, navigateur

Le moment où l'assistant cesse de répondre pour **agir** — et où les garde-fous cessent
d'être théoriques.

### Connecteurs
**Accès** : Réglages → **Connecteurs**. Une carte par service ; la carte ouvre sa modale.
La même modale s'ouvre **là où on est** partout où un connecteur est nommé : panneau
« Dossiers » → Stockage connecté, pastille « Reconnexion nécessaire », intégration proposée
en conversation.

**Ce que ça permet.** Brancher vos services (messagerie, agenda, documents, CRM, tickets,
paiement, code…) pour que le modèle les lise et agisse dedans. Quatre familles cohabitent :
les distants (OAuth), les directs sur l'appareil, les locaux, et ceux que vous ajoutez
vous-même. Plusieurs comptes par connecteur.

**Ce que ça vous apporte.** Les tâches qui valent vraiment quelque chose ne sont pas
« résume ce texte » mais « regarde mes e-mails de la semaine et prépare la relance ». Ça
suppose l'accès aux données réelles — ce que le redaction rendait justement impossible
ailleurs.

**Ce que ça vaut.** L'invariant qui rend la combinaison possible : **chaque appel sort en
clair et revient redacted**. Le service reçoit la vraie valeur (sinon la recherche ne trouve
personne), le modèle n'en voit jamais que le substitut. Les connecteurs ajoutés par vous
restent dans une section séparée, marquée non vérifiée — l'app ne fait pas semblant de les
avoir audités.

- [x] Distants (OAuth/DCR), directs sur l'appareil, locaux, ajoutés par vous
- [x] Connexion OAuth dans le navigateur système (le seul endroit où un SSO fonctionne)
- [x] Plusieurs comptes par connecteur, étiquetés
- [x] « Ajouter un connecteur » non vérifié, dans sa propre section
- [x] Voir les outils exposés par un connecteur — `packages/ui/src/containers/modals/McpToolsModal.tsx`
- [x] Choix du mode d'accès quand le serveur en propose deux — `packages/ui/src/containers/modals/McpAuthChoiceModal.tsx`
- [x] Les connecteurs de vos autres appareils sont proposés à la connexion
- [x] Connecter sans quitter l'écran : la modale s'ouvre par-dessus, depuis n'importe quelle
      mention d'un connecteur — `packages/ui/src/pages/Settings/mcp/ConnectorModalHost.test.tsx`
- [x] **Chaque appel sort en clair et revient redacted**
- [x] Saisir une clé d'API quand le service en demande une — `packages/ui/src/containers/modals/ApiKeyModal.tsx`

### Dossiers locaux (connecteur Filesystem)
**Accès** : Réglages → Connecteurs → Filesystem. Une fois connecté, la carte liste les
dossiers autorisés.

**Ce que ça permet.** Donner au modèle l'accès à des dossiers **que vous désignez**, et à
eux seuls. Plusieurs dossiers, ajoutés ou retirés à tout moment sans déconnecter le
connecteur. Les mêmes dossiers se parcourent depuis la barre de droite, pendant qu'on
écrit.

**Ce que ça vous apporte.** Travailler sur ses fichiers réels — un dossier projet, une
arborescence de contrats — sans les téléverser nulle part, et sans ouvrir toute la machine.

**Ce que ça vaut.** Le périmètre est un vrai périmètre : un dossier ne peut venir que du
sélecteur natif (l'application ne peut pas se l'attribuer elle-même), les liens symboliques
sont résolus et refusés s'ils sortent, et les magasins de secrets (`~/.ssh`, trousseaux,
cookies de navigateur, historiques de shell) restent interdits **même à l'intérieur** d'un
dossier accordé — parce que le sélecteur invite à accorder son dossier personnel. Un retrait
prend effet immédiatement, pas au prochain lancement.

- [x] Plusieurs dossiers, ajoutés/retirés **sans déconnecter** — `apps/desktop/src/main/mcp/stdioDirs.test.ts`
- [x] Un dossier ne peut venir que du sélecteur natif (aucune auto-attribution) — un
      dossier déposé ne fait qu'**ouvrir ce sélecteur dessus**, il ne s'autorise pas seul
- [x] Sous-dossiers inclus, liens symboliques résolus et refusés s'ils sortent
- [x] Les magasins de secrets restent interdits même dans un dossier accordé
- [x] Les parcourir **sans quitter la conversation** : barre de droite → « Dossiers », une
      arborescence dépliable ; un fichier s'ouvre dans le panneau latéral partagé —
      `packages/ui/src/containers/shell/folders/FolderTreePanel.tsx`
- [x] **Ajouter un dossier** depuis cette même barre (sélecteur natif ; les autorisations
      déjà en place sont conservées)
- [x] **« Demander »** au survol d'un dossier (ou clic sur une entrée cloud) : une
      conversation neuve portant la cible en **tag** — dossier/fichier et son service ou
      chemin, chip sur le compositeur puis sur le message — que le modèle lit avec les
      outils du connecteur ; rien n'est joint d'office
- [x] Le **stockage connecté** (Drive, OneDrive, Dropbox) est listé au même endroit, avec son
      état — `packages/catalog/src/mcp/registry.ts`
- [x] **Google Drive, OneDrive et Dropbox se parcourent en arborescence**, comme les
      dossiers de la machine — lecture seule, le jeton ne quitte pas le processus privilégié —
      `apps/desktop/src/main/cloudfs/`
- [x] Le modèle sait **lister un dossier** Drive/OneDrive, pas seulement chercher —
      `packages/connectors/src/files.ts`
- [x] Dropbox passe par le **listage de son propre serveur MCP**, nom d'outil en allow-list
      et réponse relue fermé — un serveur qui ne rend pas de liste exploitable garde sa
      ligne d'état plutôt qu'un chevron mort — `apps/desktop/src/main/cloudfs/mcpBrowse/`
- [x] Lire, écrire (outils du modèle), renommer, créer, mettre à la corbeille (jamais de suppression définitive) — l'aperçu côté app est en lecture seule, sans édition de contenu
- [x] Retrouver un fichier **par le sens** (« les documents fiscaux »), l'appariement se
      faisant sur l'appareil et non dans le modèle — `apps/desktop/src/main/fs/findRank.test.ts`
- [x] Sans le moteur sémantique local, l'appariement par mots reste entier **et le dit** —
      `apps/desktop/src/main/fs/findFiles.test.ts`
- [x] Un fichier cité dans une réponse (chemin complet, ou nom seul si la conversation
      connaît son unique chemin) porte une **icône « ouvrir »** à sa gauche qui affiche le
      document réel dans le panneau latéral — seulement dans un dossier accordé —
      `packages/ui/src/components/markdown/blocks/MarkdownMark.test.tsx`

### Confirmation avant d'agir
**Accès** : automatique · le mode se règle dans Réglages → Connecteurs, réglage
« **Confirmation des actions** ».

**Ce que ça permet.** Voir et approuver ce que le modèle s'apprête à faire **avant** qu'il
le fasse, avec les valeurs réelles concernées — pas un vague « il veut écrire quelque
part ». Deux modes : standard (une carte par conversation après une exposition à du contenu
web, plus des planchers non plafonnés pour l'exfiltration, les pièces jointes et tout ce
qui part) et renforcé (chaque écriture confirme ; les risquées sur une fenêtre système).

**Ce que ça vous apporte.** La confiance nécessaire pour lâcher la bride : on peut laisser
un agent lire des pages web et agir, parce que le moment où il sortirait du cadre est
précisément celui qui demande un clic.

**Ce que ça vaut.** Le dosage est le sujet. Une confirmation par appel apprend à cliquer
sans lire — ce qui est pire que pas de confirmation. D'où un plafond par conversation sur
le cas ordinaire, et des planchers **jamais** plafonnés sur ce qui ne s'annule pas : un
envoi part une fois. Le passage renforcé → standard se confirme lui-même sur la fenêtre
système, pour qu'un affaiblissement ne puisse pas venir d'ailleurs que de vous.

- [x] Mode **standard** : une carte par conversation après une recherche web, plus les planchers non plafonnés
- [x] Mode **renforcé** : chaque écriture confirme, les risquées sur une fenêtre système
- [x] La carte dit **quelles valeurs réelles** partent, pas seulement « une écriture »
- [x] « Autoriser » mémorise par outil et par conversation
- [x] Le passage renforcé → standard se confirme lui-même sur la fenêtre système
- [x] La carte reste attachée à SA conversation (les tours tournent en parallèle)

### Navigateur piloté
**Accès** : le globe du rail droit dans une conversation · Réglages → **Navigateur**.

**Ce que ça permet.** Donner au modèle un vrai navigateur — pages, formulaires, sessions
connectées — dans une fenêtre isolée, à côté de la conversation, que vous voyez travailler
et dont vous pouvez reprendre la main.

**Ce que ça vous apporte.** Les tâches qui butaient sur « le modèle n'a pas accès au web »
deviennent faisables : vérifier une information, remplir un formulaire, suivre un dossier
en ligne. Et vous **voyez** ce qu'il fait au lieu de lire un compte rendu.

**Ce que ça vaut.** C'est la surface la plus exposée du produit (une page web est du
contenu hostile par défaut), donc c'est celle qui a le plus de garde-fous : les outils sont
en **liste d'autorisation** — un ajout côté fournisseur est refusé par défaut, pas
autorisé —, le navigateur tourne dans son propre processus loin du reste de l'app, et une
recherche part avec la **vraie** valeur, sinon elle chercherait quelqu'un qui n'existe pas.

- [x] Chromium isolé, dans son propre processus, en vis-à-vis du chat — `apps/desktop/src/main/mcp/browser/`
- [x] Outils en **liste d'autorisation** (tout le reste est refusé par défaut)
- [x] Une recherche part avec la **vraie** valeur, et la page revient redacted
- [x] « **Demander à propos de cette page** » sous la vue : amorce la question dans la
      conversation courante, avec l'adresse — `packages/ui/src/pages/ChatWorkspace/BrowserPanel/browserTarget.ts`
- [x] Choix du moteur de recherche
- [x] Reprise de la main, onglets visibles
- [ ] Ajouter un signet — l'étoile a cédé la place ; les signets déjà enregistrés
      restent affichés et cliquables, aucun nouveau ne s'ajoute
- [ ] Naviguer sans que le modèle voie la page (le contenu lu rentre dans le tour)

---

## 4. Bibliothèque

### Vos fichiers, déjà masqués
**Accès** : section **Bibliothèque**.

**Ce que ça permet.** Retrouver tout fichier passé par une conversation — image, PDF,
document — déjà masqué, filtrable par type, avec sa version redacted et la liste des
conversations qui l'utilisent. Le ré-attacher ailleurs en un clic. Et, si le connecteur
Filesystem est branché, parcourir les dossiers accordés directement ici.

**Ce que ça vous apporte.** On ne cherche plus « dans quelle conversation j'avais mis ce
contrat ». Et un fichier ré-attaché repart de son extraction déjà faite : pas de nouvel OCR,
donc pas d'attente.

**Ce que ça vaut.** C'est le seul endroit qui répond à « où est passée cette donnée ? » —
utile au quotidien, indispensable le jour d'un contrôle. La version redacted conservée à
côté de l'originale permet de partager un document sans le retravailler.

- [x] Tout fichier d'une conversation y atterrit automatiquement — `packages/ui/src/pages/Library/`
- [x] Filtres par type ; recherche
- [x] Affichage **grille ou liste**, retenu par écran — `packages/ui/src/components/ViewModeToggle.tsx`
- [x] Ouverture dans le panneau latéral partagé — **une seule vue, la redacted** (+ « Conversations »)
- [x] « Quelles conversations utilisent ce fichier »
- [x] Ré-attacher un fichier à une nouvelle conversation (sans re-OCR)
- [ ] Téléverser un fichier directement dans la Bibliothèque (il passe par une conversation)

---

## 5. Compétences

Arrêter de réécrire la même chose. **Une seule liste** : une compétence est une instruction
réutilisable, et celle qui nomme des connecteurs les met au travail — c'est la catégorie
« Routines », ce que l'app appelait un « workflow » quand c'était un second écran.

### Compétences
**Accès** : section **Compétences** · `/` dans le composeur.

**Ce que ça permet.** Enregistrer une bonne instruction — une réponse type, un format de
compte rendu, une consigne de traduction, un style de relecture — la ranger par catégorie,
et l'insérer dans n'importe quelle conversation en un clic ou par `/`.

**Ce que ça vous apporte.** La qualité d'une réponse tient surtout à la qualité de la
demande. Une instruction affinée trois fois puis enregistrée est réutilisée telle quelle,
sans la réécrire ni la retrouver dans un vieux fil.

**Ce que ça vaut.** L'écart entre un bon et un mauvais usage d'un modèle vient de là, et il
se capitalise : votre bibliothèque d'instructions devient votre façon de travailler. Le
prompt part redacted comme le reste — un modèle enregistré contient souvent l'exemple réel
collé pendant qu'on le rédigeait.

- [x] Créer, éditer, ranger par catégorie — écran `packages/ui/src/pages/Competences/`, logique `packages/ui/src/competences/`
- [x] **Compétences partagées dans l'organisation** — la grille se groupe par portée (sections **Organisation** et **Équipe** au-dessus de vos cartes, badgées Perso) : les compétences partagées avec vous s'utilisent d'un clic. Chaque carte personnelle porte **« Partager »** au survol → la même modale « Avec qui ? », avec un **aperçu redacted** du texte partagé (« exactement ce que verront les autres ») ; demandes et décisions sur la **cloche « Demandes »**, un partage-personne accepté **adopte une copie** — sections `packages/ui/src/pages/Competences/parts/OrgCompetencesBlock.tsx`, modale + cloche `packages/ui/src/containers/orgShares/`, canal `packages/sync/src/orgScope/`
- [x] **Demander à l'assistant de l'écrire** : « crée-moi une compétence pour… » et il
      répond par une carte — nom, catégorie, prompt dépliable — qu'un bouton **Ajouter**
      range dans la liste. Elle est classée en **Routine** quand elle pilote des
      connecteurs (ceux-ci s'affichent sur la carte). Rien n'est ajouté sans le clic,
      et un bloc encore en cours d'écriture n'offre pas le bouton —
      `packages/ui/src/components/markdown/blocks/SkillCard.tsx`, lecture du bloc
      `packages/ui/src/suggestions/proposedSkill.ts`
- [ ] **Importer depuis Claude** — DÉSACTIVÉ : le slot `claudeSkills` n'est pas branché
      (`apps/desktop/src/renderer/src/main.tsx`), donc aucun bouton ne s'affiche et rien ne
      lit le disque. Le code reste, une ligne le rallume. Ce que ça ferait, une fois rendu :
      l'app lit les compétences que Claude Code
      garde sur cet appareil (`~/.claude/skills`, et le `.claude/skills` des dossiers déjà
      autorisés au connecteur Fichiers) — **ou on DÉPOSE** un dossier, un `SKILL.md` ou le
      `.zip` de claude.ai, ce qui n'accorde aucun chemin (le dépôt donne les octets),
      `packages/ui/src/import/dropSkills.test.ts`. L'écran montre ce qu'il a trouvé, laisse ranger chacune
      en compétence ou en routine, et signale celles qui s'appuient sur des fichiers
      annexes — qui ne seront pas importés. Un nom déjà pris n'écrase jamais : « (2) ».
      `packages/ui/src/containers/modals/ImportSkillsModal.tsx`,
      `packages/ui/src/import/claudeSkills.test.ts`
- [x] Modèles de départ proposés (rien n'est installé sans vous)
- [x] Affichage **grille ou liste**, retenu par écran — `packages/ui/src/components/ViewModeToggle.tsx`
- [x] Insertion en un clic ; la puce montre le prompt au survol
- [x] Le prompt part redacted comme le reste
- [x] Annuler une suppression

#### Les Routines — une compétence qui met vos connecteurs au travail

**Ce que ça permet.** « Rassemble mes e-mails importants de la semaine, croise avec
l'agenda, prépare un résumé. » Écrite une fois, rejouée quand vous voulez. C'est une
compétence comme les autres : on choisit ses connecteurs dans un **dépliant** de la même
fenêtre de création, et elle se range d'elle-même en « Routines ».

**Ce que ça vous apporte.** Les routines qu'on refait chaque lundi cessent d'être refaites.
Et il n'y a plus deux endroits ni deux fenêtres à connaître pour la même chose.

**Ce que ça vaut.** Les connecteurs attachés **guident** le modèle sans lui **accorder**
quoi que ce soit : les droits restent ceux que vous avez donnés dans Réglages. Une routine
ne peut donc pas élargir un accès en douce.

- [x] Connecteurs choisis dans la fenêtre de création (guidage, pas un droit d'accès) —
      `packages/ui/src/competences/launch.ts`, `packages/ui/src/pages/Competences/parts/ServerPicker.tsx`
- [x] La portée SURVIT au tour suivant : une routine qui pose une question de clarification
      garde ses connecteurs pour la réponse — `packages/ui/src/competences/launch.test.ts`
- [x] Une seule intention par envoi
- [x] Modèles de départ, classés par ce qui est déjà connecté
- [x] **Vos anciens workflows sont repris automatiquement**, avec leurs connecteurs et
      leur historique — `packages/ui/src/competences/migrate.test.ts`

---

## 6. Mémoire

### Ce que l'app retient d'une fois sur l'autre
**Accès** : section **Mémoire** · « retiens que… » (12 langues) dans une conversation ·
sélection de texte → **Retenir** · `/` → « Retenir en mémoire ».

**Ce que ça permet.** Constituer, au fil des conversations, des fiches par entité (ce
client, ce projet, cette contrainte) et un profil de préférences. Deux voies : l'extraction
silencieuse (désactivable) et la demande explicite, qui marche toujours. Sur ordinateur,
un graphe regroupe et fusionne de lui-même les fiches proches, calculé sur l'appareil ; une
vue liste avec recherche fait retrouver ce que le graphe fait comprendre.

**Ce que ça vous apporte.** Ne plus réexpliquer le contexte à chaque nouvelle conversation.
C'est la différence entre un outil qu'on réamorce sans cesse et un outil qui vous connaît —
et qui dit honnêtement quand il n'a PAS reconnu quelqu'un, au lieu de laisser croire qu'il
sait tout.

**Ce que ça vaut.** C'est aussi la fonctionnalité la plus délicate du produit sur le plan
de la confidentialité, et elle est traitée comme telle : la mémoire est stockée **en clair
localement** — parce que les substituts ne sont plus stables d'une conversation à l'autre —
et **re-redacted à chaque injection**, avec le coffre de la conversation en cours. Deux
entités aux noms disjoints ne fusionnent jamais (une fusion proposée reste à confirmer), et
un échec réel est dit (« réessayez ») au lieu d'être avalé : une mémoire qui prétend avoir
retenu sans l'avoir fait est pire qu'une mémoire absente. Rien ne s'efface en silence non
plus : une mise à jour garde l'ancienne version, restaurable.

- [x] Fiches par entité + profil de préférences — écran `packages/ui/src/pages/Memory/`, CRUD `packages/ui/src/state/useMemory.ts`
- [x] Extraction **silencieuse** (désactivable, `MemorySection.tsx`) et **explicite** (toujours active, 12 langues) — `packages/ui/src/memory/extractExplicit.ts`
- [x] Graphe (glisser/zoomer/recadrer) et vue liste avec recherche, au choix — `packages/ui/src/pages/Memory/MemoryGraph.tsx`, `MemoryList.tsx`
- [x] Sélectionner un nœud **rapproche** la vue sur son voisinage — libellés lisibles — et désélectionner la ré-élargit — `packages/ui/src/pages/Memory/graphFrame.test.ts`
- [x] Regroupement + suggestion de fusion entre fiches proches, calculés sur l'appareil — `packages/ui/src/memory/cluster.ts`, `dedupe.ts`
- [x] « Mémoire utilisée » sous un message envoyé, et le non-rappel expliqué quand il peut surprendre — `packages/ui/src/components/message/MemoryCaptions.tsx`
- [x] Une fiche se **met à jour** (jamais ne s'empile) ; les versions remplacées restent visibles et **restaurables** — `packages/ui/src/memory/compaction.ts`
- [x] Boîte « À revoir · N » : fiches auto + doublons proposés, avec **Confirmer**/Supprimer en ligne — traiter la vide — `packages/ui/src/pages/Memory/useMemoryReview.ts`
- [x] « Rappelée dans N conversations » + non-rappel surprenant expliqué, sur la fiche — `packages/ui/src/memory/usage.ts`
- [x] Supprimer une fiche s'annule quelques secondes (toast « Annuler », restauration à l'identique)
- [x] La légende des catégories filtre la page ; liste groupable par catégorie ; profil modifiable d'un clic sur son texte
- [x] Couper la mémoire pour une conversation (les deux sens) — ⋯ → Redaction → interrupteur — `packages/ui/src/containers/modals/redaction/RedactionRulesModal.tsx`
- [x] `memory_search` comme outil du modèle, avec un tier **sémantique** sur ordinateur — `packages/ui/src/memory/select.ts`
- [x] Stockée en clair **localement**, re-redacted à chaque injection
- [x] Un échec réel est dit (« réessayez »), jamais masqué
- [x] Deux entités aux noms disjoints ne fusionnent jamais
- [x] Point discret sur l'icône Mémoire quand quelque chose a été noté ailleurs
- [x] Éditer ou supprimer une fiche à la main

---

## 7. Coffre

### Vos termes toujours masqués
**Accès** : section **Coffre**.

**Ce que ça permet.** Déclarer une fois pour toutes les termes qui doivent être masqués
dans **tous** les échanges : le nom de code d'un projet, un numéro de compte, un
identifiant interne, le nom d'un client — tout ce qu'aucun détecteur générique ne peut
deviner sensible.

**Ce que ça vous apporte.** La certitude sur ce qui vous inquiète vraiment. La détection
automatique couvre les formes connues ; le Coffre couvre **votre** vocabulaire, celui qui
n'a de sens que chez vous.

**Ce que ça vaut.** Le contrat est « toujours masqué », donc il vaut aussi dans un résultat
d'outil — un terme du Coffre qui apparaît dans un e-mail rapatrié par un connecteur est
masqué comme s'il venait de vous. Sans ça, la promesse aurait un trou exactement là où on
ne regarde pas.

- [x] Dictionnaire de valeurs masquées à **chaque** envoi, quelle que soit la conversation — écran `packages/ui/src/pages/Vault/`, logique `packages/ui/src/send/coffre.ts`
- [x] Compte d'occurrences calculé sur les coffres réels
- [x] Vaut aussi dans un résultat d'outil (pas seulement dans ce que vous tapez)
- [x] Ajouter un terme depuis une sélection dans une conversation
- [x] **Termes partagés dans l'organisation** — la liste du Coffre reste UNE, badgée par portée (Perso / Équipe / Orga) : les termes partagés avec vous s'y replient en lecture, masqués comme les vôtres. Chaque ligne personnelle porte **« Partager »** → la modale « Avec qui ? » (toute l'organisation, votre équipe, ou une personne — chaque cible dit **qui approuve** : un administrateur pour org/équipe, le destinataire lui-même pour une personne) ; les demandes arrivent sur la **cloche « Demandes »** du panneau droit, et accepter un partage-personne **adopte une copie** dans votre liste ; chiffré de bout en bout vers l'audience seulement (bureau) — badge/portées `packages/ui/src/orgShares/scopes.ts`, modale + cloche `packages/ui/src/containers/orgShares/`, fusion à l'envoi `combinedCoffre` (`packages/ui/src/send/coffre.ts`), canal `packages/sync/src/orgScope/`
- [ ] Import en masse d'une liste de termes

---

## 8. Réglages

**Accès** : la roue dentée du rail · ⌘K, qui indexe les réglages eux-mêmes.
Quatre onglets visibles, le reste derrière « Avancé » — parce qu'un réglage qu'on cherche
se trouve par la recherche, pas par une liste de onze entrées.

### Compte
**Accès** : Réglages → **Compte**.

**Ce que ça permet.** L'identité de l'appareil — et la carte **Organisation** : sur un
compte d'entreprise elle montre la vôtre (nom, rôle, effectif) et mène à l'onglet
Organisation ; sur un compte solo elle propose d'en **créer une**, dans l'app web —
l'apparence (clair ou sombre), l'import de vos conversations existantes, le choix du mode
de facturation, le consentement aux statistiques anonymes, et les aperçus de liens.

**Ce que ça vous apporte.** L'import est le geste qui rend le changement d'outil possible :
votre historique ChatGPT ou Claude arrive **redacted à l'import**, donc réutilisable ici
sans repartir de zéro. La facturation vous laisse le choix entre votre propre clé (vous
payez le fournisseur directement — la seule voie pour OpenAI, Anthropic, Google, Mistral
et DeepSeek) et les crédits inclus (rien à configurer : Scaleway + une sélection
OpenRouter).

**Ce que ça vaut.** Les deux réglages « discrets » sont traités comme des décisions, pas
comme des cases : les statistiques sont un consentement explicite et ne transportent que
des compteurs, jamais de contenu ; les aperçus de liens sont **désactivés par défaut**
parce que prévisualiser un lien, c'est faire une requête sortante — donc révéler qu'on l'a
reçu.

- [x] Identité de l'appareil, déconnexion
- [x] « **Mode sombre** » (le fond ; l'accent indigo n'est plus une option — un thème vert hérité est traduit au chargement, `packages/ui/src/state/storePersistence.ts`)
- [x] « **Importer des conversations** » (exports officiels ChatGPT / Claude, redacted à l'import)
- [x] « **Facturation des messages** » : votre clé, ou les crédits inclus
- [x] « **Prévenir quand une réponse arrive** » : une notification système, **seulement**
      si le fil n'est pas sous vos yeux (autre fenêtre, ou autre conversation) ; le clic
      ramène la fenêtre au premier plan et ouvre le bon fil. La bannière ne porte **ni le
      message ni le titre** de la conversation — elle s'affiche par-dessus tout, parfois
      sur un écran verrouillé. Activé par défaut, désactivable ici —
      `packages/ui/src/state/replyNotice.test.ts`
- [x] « **Statistiques d'usage anonymes** » (consentement explicite, compteurs seulement)
- [x] « **Aperçus de liens** » (opt-in, une requête sortante par lien)

### Confidentialité, Modèles, Connecteurs, Navigateur
**Accès** : Réglages → onglet correspondant. Le détail de chacun est en sections 1 à 3.

**Ce que ça permet.** Les quatre onglets qui gouvernent ce que l'app protège, avec quoi
elle répond, à quoi elle accède, et ce qu'elle peut faire seule.

**Ce que ça vous apporte.** Chaque onglet est titré, décrit et **cherchable par
construction** : la même source unique alimente l'étiquette du rail, l'en-tête de la page
et la ligne de la palette ⌘K. Un réglage ne peut donc pas exister sans être trouvable.

**Ce que ça vaut.** C'est ce qui rend acceptable de replier sept onglets derrière
« Avancé » : rien ne devient inaccessible, seulement moins encombrant.

- [x] Chaque onglet est titré et cherchable par construction — `packages/ui/src/pages/Settings/settingsIndex.ts`
- [x] Les réglages eux-mêmes sont indexés dans ⌘K, pas seulement les onglets

### Journal, Usage
**Accès** : Réglages → **Journal** (audit du redaction, puis « **Ce qui est sorti de la
machine** ») · Réglages → **Usage**.

**Ce que ça permet.** Reprendre l'historique de ce qui a été masqué, filtrable et
recherchable ; voir la liste des **adresses que l'app a réellement contactées** et de celles
qu'elle a refusées ; et lire sa consommation, par modèle et par conversation, avec un coût
estimé.

**Ce que ça vous apporte.** Répondre à « qu'est-ce qui est sorti d'ici, et combien ça m'a
coûté » sans ouvrir un tableur — et, désormais, à « avec qui cette app a-t-elle parlé »,
la question qu'on pose le jour d'un contrôle et à laquelle un journal de redaction seul
ne répondait pas.

**Ce que ça vaut.** Les chiffres sont qualifiés au lieu d'être assénés : ce qui est
**estimé** (parce que le fournisseur n'a pas renvoyé les compteurs, ou parce qu'on a
interrompu la réponse) est signalé comme tel, et « ma clé » est séparé de « abonnement ».
Un total unique et lisse aurait invité à une précision qu'il n'a pas. Le journal réseau
n'enregistre **que le nom du site** — jamais la page ni ce qui a été demandé, parce qu'une
adresse complète transporte souvent un jeton — et il est en lecture seule : l'app l'écrit,
l'interface ne peut ni l'inventer ni l'effacer.

- [x] Historique du redaction, filtrable et recherchable, **groupé par conversation** :
      une carte par fil, avec son titre, son nombre de valeurs et sa date. C'est la forme
      du coffre lui-même — le sel étant propre à chaque conversation, une même valeur
      réelle y porte un remplaçant différent, ce qu'une liste à plat donnait à lire comme
      une incohérence — `packages/ui/src/pages/Settings/privacy/auditRows.ts`
- [x] La **date vit sur l'en-tête du groupe**, jamais sur la ligne : le coffre n'horodate
      pas ses entrées, et une date par valeur promettait une précision qu'aucune donnée ne
      porte
- [x] **Journal réseau** : adresses contactées et refusées, par origine (navigateur,
      connecteur, aperçu de lien…), recherchable — `packages/ui/src/pages/Settings/privacy/egressJournal.ts`
- [x] Les deux moitiés sont **deux vues d'un sélecteur**, pas une pile : la table de
      redaction se charge par pages sans fin, donc le journal réseau placé dessous était
      hors d'atteinte au défilement — `packages/ui/src/pages/Settings/privacy/AuditLogTab.tsx`
- [x] Le journal réseau garde le **nom du site seulement** (jamais la page ni la requête)
- [x] Écrit par le processus privilégié, en lecture seule pour l'interface — `apps/desktop/src/main/net/egressJournal.ts`
- [x] Consommation par modèle et par conversation, coût estimé
- [x] Séparation « ma clé » / « abonnement », et ce qui est estimé plutôt que mesuré
- [x] Les histogrammes n'ont pas d'axe des ordonnées : le **maximum est écrit** sous le
      titre, et **survoler une colonne** (ou l'atteindre au clavier) donne le jour et sa
      valeur, modèle par modèle — `packages/ui/src/pages/Settings/billing/ModelTimeline.tsx`

### Vos appareils
**Accès** : Réglages → **Vos appareils** → « **Appareils connectés** ».

**Ce que ça permet.** Retrouver ses conversations, compétences et mémoire sur un
autre appareil, via une synchronisation chiffrée de bout en bout par une phrase secrète que
vous seul détenez. Un appareil se révoque.

**Ce que ça vous apporte.** Le produit cesse d'être lié à une machine, sans que ça implique
de confier son contenu à un serveur.

**Ce que ça vaut.** C'est le point où beaucoup d'outils échangent la confidentialité contre
le confort. Ici le serveur ne transporte que du chiffré : la synchronisation ne peut pas
devenir la porte que le redaction a fermée.

- [x] Synchronisation chiffrée de bout en bout entre vos appareils — `packages/sync/`
- [x] Phrase secrète ; révocation d'un appareil
- [x] Portée : conversations, compétences (routines comprises), mémoire
- [x] Les identifiants de connecteurs ne se synchronisent PAS (chaque appareil refait son OAuth)
- [x] **Le témoin d'état** — Réglages → Synchronisation affiche l'environnement RÉSOLU (staging/production, jamais déduit du canal) et le dernier échange (réussi il y a X min / échec + raison) : la synchro est best-effort, ce témoin est ce qui empêche une panne d'être invisible — `packages/ui/src/pages/Settings/syncStatusLine.ts`, `apps/desktop/src/renderer/src/sync/status.ts`

### Organisation
**Accès** : Réglages → **Organisation** (si le compte appartient à une organisation).

**Ce que ça permet.** Rattacher des comptes à une organisation, avec des rôles, un pool de
crédits partagé, un journal d'audit, et surtout un **cadre imposé** que le membre ne peut
pas desserrer : des catégories de redaction qu'il ne peut ni désactiver ni révéler, et une
**liste des modèles et connecteurs autorisés qui part de zéro** — tout est fermé tant que
l'administration n'ouvre pas. Sur un compte géré, les **clés d'API personnelles sont
désactivées** : l'organisation fournit les modèles, donc il n'existe aucune sortie qu'elle
ne gouverne pas. Une console d'administration séparée gère tout ça.

**Ce que ça vous apporte.** Côté admin : la garantie que la politique s'applique vraiment,
sur chaque poste. Côté membre : rien à configurer pour être conforme.

**Ce que ça vaut.** C'est ce qui permet de déployer l'outil sans le transformer en risque —
une politique qui dépend de la bonne volonté de chacun n'est pas une politique.

- [x] Rôles, membres, catégories de redaction imposées
- [x] **Modèles et connecteurs en liste d'AUTORISATION** : une organisation neuve démarre
      tout fermé, et un modèle ajouté au catalogue plus tard n'est PAS ouvert d'office
- [x] **Clés d'API personnelles désactivées sur un compte géré** — refusées à l'écriture ET
      à l'injection par le processus privilégié — `apps/desktop/src/main/store/keysPolicy.ts`
- [x] Le refus d'un modèle non autorisé est **revérifié côté serveur** par la passerelle,
      seul point qui ne dépende d'aucun poste — `apps/gateway/src/features/inference/shared/orgModelPolicy.ts`
- [x] Connecteurs bloqués **et** niveau de confirmation imposé comme plancher — appliqués
      par le processus privilégié, pas seulement par l'interface
- [x] Console d'administration séparée — `apps/web/`
- [x] Journal d'audit côté organisation — `apps/backend/`
- [x] Pool de crédits partagé
- [x] **Gestionnaire d'abonnement** dans la console (offre, montant réellement prélevé,
      résiliation) — `apps/web/components/admin/subscription/`
- [x] **L'abonnement suit l'effectif** : une invitation ACCEPTÉE ajoute un siège facturé au
      prorata, un départ le retire ; une invitation en attente ne coûte rien
- [x] Le montant affiché est celui que le prestataire prélève, jamais un prix reconstitué
      depuis le catalogue — `apps/backend/src/features/subscriptions/seatBilling.test.ts`
- [x] Un écart entre membres actifs et sièges facturés est **montré** avec un geste pour le
      refermer, jamais avalé en silence

### Paiement
**Accès** : Réglages → **Paiement**.

**Ce que ça permet.** Un abonnement avec des crédits inclus, l'historique de consommation,
et la possibilité de ne rien payer du tout — en branchant vos propres clés ou en restant
sur les modèles gratuits.

**Ce que ça vous apporte.** L'accès aux grands modèles sans ouvrir un compte chez chaque
fournisseur, ni gérer cinq facturations.

**Ce que ça vaut.** Un envoi que les crédits ne peuvent pas financer est refusé **avant**
de partir : on ne sert jamais une réponse pour la facturer ensuite. La règle protège
autant l'utilisateur que l'éditeur.

- [x] Abonnement, crédits inclus, historique — `packages/credits/`
- [x] Un modèle gratuit reste utilisable sans abonnement
- [x] Un envoi non finançable est refusé **avant** de partir
- [x] Le refus « Crédits épuisés » propose toujours un **geste** : abonnement + clé pour un
      compte gratuit, « Renseigner la clé » pour un membre d'organisation ou un compte sans
      facturation — `packages/ui/src/send/preflight.test.ts`

### Versions
**Accès** : Réglages → **Versions**.

**Ce que ça permet.** Choisir son canal de version, lire les notes de mise à jour — et
revenir en arrière. La mise à jour, elle, ne se règle pas : elle est **toujours**
automatique.

**Ce que ça vous apporte.** Savoir ce qui a changé dans un outil qui touche à vos données,
et ne pas être coincé par une version qui casse votre usage.

**Ce que ça vaut.** Le retour arrière est ce qui rend la mise à jour automatique
acceptable : sans lui, « toujours à jour » est une prise de risque imposée.

- [x] Canal de version, notes de mise à jour — `apps/desktop/src/main/updates/`
- [x] **Une version téléchargée s'annonce DANS l'app**, avec ce qu'elle apporte (la note
      publiée) et un « Redémarrer maintenant » — plus de boîte de dialogue du système, en
      anglais et muette sur le contenu. Une fois par version, jamais avant que la version
      soit là, jamais par-dessus la connexion ; refermée, un bouton en pied du rail droit
      la rouvre tant que la mise à jour attend — `UpdateReadyModal`,
      `packages/ui/src/containers/shell/hooks/useUpdateReady.test.tsx`
- [x] **La mise à jour est toujours automatique — aucun réglage ne l'éteint.** Vérification
      et téléchargement se font seuls ; l'installation attend un clic « Installer et
      redémarrer », la prochaine fermeture de l'app — ou un moment d'inattention (puce
      suivante). L'interrupteur qui existait ne servait qu'à rester sur une version
      ancienne, donc à garder des défauts déjà corrigés —
      `apps/desktop/src/main/updates/poll.test.ts`
- [x] **Une version prête s'installe TOUTE SEULE quand personne ne regarde** : app en
      arrière-plan prolongé (≥ 30 min) ou utilisateur parti (≥ 10 min d'inactivité), et
      seulement si rien n'est en vol — aucun envoi en cours, aucun brouillon non envoyé
      (le renderer répond à une sonde ; son silence vaut « occupé », donc jamais de
      redémarrage au hasard) — `apps/desktop/src/main/updates/autoInstall.test.ts`,
      `packages/ui/src/state/effects/useUpdateQuiescence.test.ts`
- [x] **La liste des versions publiées et ce que chacune a apporté** (le même contenu que
      l'onglet « Nouveautés » de l'aide), y compris là où il n'y a aucune build à installer —
      l'historique des builds, lui, ne s'affiche que sur une version préliminaire ou un
      appareil autorisé — `packages/ui/src/pages/Settings/updates/parts/PublishedNotes.tsx`,
      `packages/ui/src/pages/Settings/updates/UpdatesSection.test.tsx`
- [x] Vérification au lancement **et toutes les 15 min** tant que l'app reste ouverte, pour
      qu'un retrait de version côté serveur n'attende pas un redémarrage —
      `apps/desktop/src/main/updates/poll.test.ts`
- [x] Retour à une version précédente
- [x] **Environnement** — la carte dit si l'app parle à la production ou au staging, et
      propose la bascule aux comptes autorisés (accès bêta accordé par l'équipe) ou aux
      appareils privilégiés ; depuis staging, le retour en production est toujours offert.
      La décision est revérifiée hors de l'UI à chaque demande, et un refus s'affiche tel
      quel — `packages/ui/src/pages/Settings/updates/parts/EnvCard.tsx`,
      `packages/ui/src/pages/Settings/updates/parts/envView.test.ts`

---

## 9. Cadre de l'app

### Navigation
**Accès** : rail de gauche · ⌘K partout.

**Ce que ça permet.** Six sections plus les Réglages, un panneau latéral partagé qui
survit au changement de section, et une palette ⌘K qui atteint les conversations, les
sections **et** les réglages.

**Ce que ça vous apporte.** Un document ouvert reste ouvert quand on passe du chat à la
Bibliothèque. Et on rejoint n'importe quoi au clavier, sans apprendre où c'est rangé.

**Ce que ça vaut.** Le vocabulaire des cinq sections vient d'une source unique : l'étiquette
du rail, l'infobulle, le sous-titre de la page et le paragraphe du guide sont les mêmes
chaînes. L'app ne peut pas se décrire de deux façons — ce qui, sur un produit dont quatre
noms sur cinq sont les siens (Coffre, Compétences, Mémoire), fait la différence
entre un vocabulaire et un jargon.

- [x] Six sections + Réglages — `packages/ui/src/help/sections.ts`
- [x] Palette ⌘K : conversations, sections, réglages — `packages/ui/src/containers/modals/SearchModal/`
- [x] Panneau latéral partagé, conservé d'une section à l'autre
- [x] Le replier : recliquer l'onglet **actif** ; le fermer : la croix de son élément. La
      barre de droite ne porte aucune commande de panneau, et rien ne masque la conversation
- [x] Barre de droite : onglets du navigateur, **« Dossiers »** (dossiers autorisés en
      arborescence + stockage connecté, seulement s'il y a quelque chose à parcourir),
      Aide et Avis — `packages/ui/src/containers/shell/RightRail.tsx`
- [x] 📱 Le mobile remplace certains écrans par les siens — `packages/ui/src/containers/shell/mobile/`

### Première ouverture
**Accès** : au premier lancement, après connexion — sur le **premier** appareil du compte
seulement : un compte déjà établi (abonnement payant, ou membre d'une organisation) qui se
connecte sur une nouvelle machine n'y repasse pas — `packages/ui/src/state/establishedAccount.ts`.

**Ce que ça permet.** Se connecter par lien magique ou compte Google, puis voir une
démonstration du redaction, choisir comment accéder aux modèles — l'abonnement intégré ou
sa propre clé (OpenRouter, OpenAI, Anthropic…) — et régler finement les catégories tout de
suite, sans y être obligé.

**Ce que ça vous apporte.** Comprendre le produit en trente secondes, sur un exemple qui
tourne pour de vrai plutôt que sur une capture d'écran — et brancher sa clé dès la première
minute si on en a une.

**Ce que ça vaut.** L'onboarding **montre**, et ne configure que ce qu'on lui demande : le
seul choix proposé (abonnement ou clé) est optionnel — « Passer » laisse le modèle gratuit
déjà actif. Il désamorce aussi les deux réflexes qui
pousseraient à baisser la protection (« ça va masquer les personnalités publiques » — non ;
« une recherche web va chercher un faux nom » — non, elle propose de révéler d'abord).

- [x] Connexion par lien magique ou Google — `packages/ui/src/pages/Login/`
- [x] Démonstration du redaction, rejouable ensuite depuis **Aide** — `packages/ui/src/components/RedactionDemo/`
- [x] Choix abonnement intégré ⇄ sa propre clé (OpenRouter ou autre), optionnel — `packages/ui/src/pages/Onboarding/KeyChoice.tsx`
- [x] Marche à suivre cochable pour obtenir la clé du fournisseur choisi + alerte au collage si la clé n'a pas la forme de ce fournisseur — `packages/ui/src/pages/Onboarding/KeySteps.tsx`
- [x] « Obtenir une clé gratuitement » (OpenRouter) — OAuth, sans copier-coller ; la clé naît et reste dans le processus principal — `apps/desktop/src/main/store/openrouterPkce.ts`
- [x] Réglage fin des catégories dès l'accueil, sans y être obligé
- [x] Au clavier : le focus entre dans la carte et y reste, le reste de l'app est inerte — `packages/ui/src/hooks/useDialogFocus.ts`

### Aide et retours
**Accès** : pied du rail droit → « Aide » et « Envoyer un avis ».

**Ce que ça permet.** Un guide qui explique les cinq sections, un formulaire d'avis, et le
détail copiable d'une erreur.

**Ce que ça vous apporte.** L'aide dit ce que l'app fait vraiment : elle **rend** les
chaînes de l'app plutôt que d'en décrire une seconde version. Un guide qui décrit une
version antérieure est pire qu'une absence de guide.

**Ce que ça vaut.** Le détail d'erreur copiable transforme « ça n'a pas marché » en un
signalement exploitable — et l'avis part avec ce que **vous** choisissez d'y joindre, pas
avec ce que l'app aurait décidé de ramasser.

- [x] Guide qui **rend** les vraies chaînes de l'app — `packages/ui/src/containers/modals/GuideModal.tsx`
- [x] **Lien vers le centre d'aide étendu** (`help.<domain>`, branding.json) dans l'en-tête de l'Aide, donc
      visible depuis tous les chapitres, sortant par le navigateur du système —
      `packages/ui/src/help/links.ts`, `packages/ui/src/containers/modals/GuideModal.test.tsx`
- [x] Onglet **« Nouveautés »** de l'Aide : l'historique des versions publiées (celui envoyé
      par mail), lu dans l'app, la plus récente en tête — une note par version, et l'onglet
      n'existe pas là où cette source n'existe pas —
      `packages/ui/src/containers/modals/GuideReleases.tsx`,
      `packages/ui/src/containers/modals/GuideModal.test.tsx`
- [x] « Votre avis » : un retour, avec ce que vous choisissez d'y joindre — `packages/ui/src/containers/modals/AvisModal.tsx`
- [x] **Contexte technique** joignable en un interrupteur : version, canal, écran, système,
      modèle, niveau de protection — six valeurs machine, jamais une ligne de vos
      conversations — `packages/ui/src/containers/shell/hooks/useAvis.ts`
- [x] Sur un **signalement de bug**, le journal de débogage est **joint d'office** — aperçu
      verbatim à l'écran, un geste le retire (décision 13/08 : la collecte est permanente,
      un rapport sans journal coûtait un aller-retour) — `packages/ui/src/containers/modals/AvisModal.test.tsx`
- [x] **Une icône d'avis sous chaque réponse** (barre Copier / Régénérer / Forker) : le
      journal de la conversation arrive déjà joint, l'humeur n'est plus exigée — signaler
      ne demande plus de quitter la réponse — `packages/ui/src/components/message/MessageBubble.tsx`
- [x] Détail d'une erreur, copiable — `packages/ui/src/containers/modals/ErrorDetailModal.tsx`
- [x] Un envoi qui échoue le dit **sous le message**, en français naturel — un message,
      un geste, les issues en BOUTONS : clé manquante ou refusée → saisir la clé ;
      **compte fournisseur à sec** (« Votre compte OpenAI n'a plus de crédits ») →
      recharger, sans un seul retry gaspillé ; quota épuisé (« gratuites » seulement si
      c'en est un) → l'heure de reprise ; simple rafale → attendre, la durée citée quand
      elle est connue. `packages/ui/src/state/errors.test.ts`

---

## 10. Ce qui protège, sous le capot

### Les garanties qu'on ne clique pas
**Accès** : rien à cliquer — c'est ce qui tient pendant que vous cliquez ailleurs.

**Ce que ça permet.** Que les promesses des sections précédentes restent vraies même quand
quelque chose tourne mal : une page web hostile, un connecteur compromis, un modèle qui
invente un appel d'outil, une faille dans l'interface.

**Ce que ça vous apporte.** Rien de visible — et c'est le but. La différence se voit le
jour où elle compte.

**Ce que ça vaut.** Quatre principes portent l'essentiel. **Ce qui rentre est une donnée,
jamais un ordre** : une page ou un e-mail arrive étiqueté, et ce qui ressemble à une consigne
adressée au modèle est signalé plutôt qu'obéi — signalé, pas supprimé, parce qu'un filtre qui
ampute une réponse légitime finit désactivé. **Tout se rejoue côté
privilégié** : chaque barrière de l'interface est un confort, la vraie décision est reprise
là où l'interface ne peut pas mentir. **On autorise, on n'interdit pas** : les listes sont
des listes d'autorisation, donc une nouveauté côté fournisseur est refusée par défaut au
lieu d'être ouverte en silence. **On échoue fermé** : sur une erreur, un timeout ou un
inconnu, l'issue par défaut est celle qui protège — l'envoi est bloqué, le résultat masqué,
l'outil refusé.

- [x] Clés de fournisseur chiffrées, **jamais** relues par l'interface
- [x] Base locale chiffrée, par compte (deux comptes sur une machine ne se voient pas)
- [x] Cinq processus hors du processus privilégié (navigateur, jail Python, fichiers, NER, embeddings)
- [x] Modèles et binaires embarqués, épinglés par empreinte, jamais téléchargés au vol
- [x] Garde anti-SSRF sur toute sortie réseau, **et journalisée** (Réglages → Journal)
- [x] Le contenu rapatrié (page web, e-mail, document) arrive **étiqueté comme une donnée**,
      et un contenu qui tente de donner des consignes au modèle est signalé comme tel —
      `packages/ui/src/send/inboundScreen.ts`
- [x] Toute barrière de l'interface est **rejouée** côté privilégié
- [x] Aucun secret ni PII réelle dans les journaux
- [x] **Politique MCP d'organisation appliquée côté privilégié** : un connecteur non
      autorisé est refusé à l'appel, à la connexion, et même s'il est ré-ajouté à la main
      par son adresse — `apps/desktop/src/main/mcp/orgPolicy.ts`
- [x] Une politique **absente** (pas encore reçue) et une politique **vide** (rien d'ouvert)
      ne se confondent pas : la première laisse passer, la seconde ferme
- [x] Le **niveau de confirmation imposé par l'organisation** est un plancher : un membre
      peut le renforcer, jamais l'assouplir — `packages/catalog/src/mcp/confirmationPolicy.ts`

---

## 11. Plateformes

Le même produit, avec ce que la plateforme permet. Une capacité absente **dégrade en
silence** — l'écran ne s'affiche pas, l'app ne casse pas.

| | Desktop | 🌐 Aperçu web |
|---|---|---|
| Redaction complet | ✅ | ✅ |
| NER sur l'appareil | ✅ | ❌ (moteur distant) |
| Connecteurs | ✅ | ❌ |
| Navigateur piloté | ✅ | ❌ |
| Python, PDF, OCR | ✅ | ❌ |
| Dossiers locaux | ✅ | ❌ |
| Synchronisation | ✅ | ❌ |

---

## 12. Hors app

Ce qui entoure le produit, et à quoi ça sert.

- **Documentation utilisateur** (français, destinée au public), **en ligne sur
  `help.<domain>`** — maintenue hors de ce dépôt
- **Console d'administration** d'organisation (rôles, politique, audit) — `apps/web/`
- **Passerelle d'inférence** : proxy, comptage des crédits, et redaction serveur pour qui n'a pas la puissance locale — `apps/gateway/`
- **API distante** : comptes, facturation, synchronisation, administration — `apps/backend/`
