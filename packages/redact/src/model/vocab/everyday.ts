/**
 * Vocabulary volume: **the everyday** — cooking, DIY, garden, sport, the car, the weather,
 * the house, clothes, deliveries. The conversations that are neither a document nor a
 * profession, and which the other volumes therefore never covered.
 *
 * Why it exists, measured rather than assumed: a probe of 136 ordinary sentences carrying
 * NO personal data at all was run through the shipping pipeline. **14 % of them came back
 * with something in the vault** — « moutarde », « levain », « magret », « aneth »,
 * « poncer », « nichoir », « wagon », « kiné », « stivaletti ». A cased NER meets an unknown
 * common noun at the head of a sentence and reads a proper noun; the fake then replaces it,
 * and the user gets an answer about a recipe that no longer mentions mustard.
 *
 * ⚠️ **This is the most dangerous volume to write, and the guard is what makes it possible.**
 * Everyday French is dense with words that are ALSO surnames — the probe itself surfaced
 * four: `poisson`, `gardien`, `chaton`, and `molly` (from « cheville molly »). All four are
 * ABSENT here and named in `../vocabGuards.test.ts`, alongside `brando` (Portuguese « lume
 * brando »). The mechanical check runs every entry against the first-name lexicon AND a
 * curated surname list (`../surnamesGuard.data.ts`); writing that list first is what caught
 * `ward`, which had been spared since the health volume shipped.
 *
 * Two families are deliberately NOT here, and both are tempting:
 *  - **Flowers, fruits and trees** — `rose`, `olive`, `prune`, `cerise`, `capucine`,
 *    `violette`, `marguerite`, `pervenche`, `laurier`, `noisette` are all French given
 *    names or surnames. The garden section below stays on tools and actions.
 *  - **Trades** — `boulanger`, `charpentier`, `berger`, `meunier`, `marchand`, `chevalier`
 *    are the classic French occupational surnames; the roster already refuses them.
 */
export const EVERYDAY_TERMS: string[] = [
  // ── Cooking: actions, cooking methods, utensils ────────────────────────────────
  "émincer", "eminacer", "emincer", "ciseler", "hacher", "râper", "raper", "peler",
  "éplucher", "eplucher", "trancher", "découper", "decouper", "fouetter", "battre",
  "pétrir", "petrir", "pétrissage", "petrissage", "malaxer", "incorporer", "mélanger", "melanger", "remuer",
  "verser", "napper", "arroser", "assaisonner", "saler", "poivrer", "sucrer",
  "mariner", "paner", "farcir", "dresser", "déglacer", "deglacer", "réduire",
  "reduire", "mijoter", "frémir", "fremir", "bouillir", "blanchir", "revenir",
  "rissoler", "saisir", "griller", "rôtir", "rotir", "braiser", "pocher", "gratiner",
  "flamber", "égoutter", "egoutter", "essorer", "refroidir", "reposer", "lever",
  "cuisson", "à couvert", "a couvert", "couvert", "à feu doux", "a feu doux",
  "bain-marie", "four", "poêle", "poele", "casserole", "cocotte", "marmite", "faitout",
  "sauteuse", "passoire", "saladier", "spatule", "fouet", "louche", "moule", "plat",
  "plaque", "papier cuisson", "cuillère à soupe", "cuillere a soupe",
  "cuillère à café", "cuillere a cafe", "pincée", "pincee", "sachet", "levure",
  "levain", "pâte", "pate", "pâte brisée", "pate brisee", "pâte feuilletée",
  "pate feuilletee", "garniture", "assaisonnement", "marinade", "recette",
  "ingrédient", "ingredient", "ingrédients", "ingredients",

  // ── Cooking: foods and preparations. ⚠️ See the header: no fruits, no
  //    flowers, no trades — those are French given names and surnames.
  "moutarde", "mayonnaise", "vinaigrette", "béchamel", "bechamel", "persillade",
  "bouillon", "fond de veau", "court-bouillon", "coulis", "purée", "puree",
  "gratin", "quiche", "tarte", "clafoutis", "crumble", "compote", "confiture",
  "sirop", "caramel", "chantilly", "meringue", "sorbet", "magret", "entrecôte",
  "entrecote", "escalope", "filet mignon", "rôti", "roti", "gigot", "côtelette",
  "cotelette", "saucisse", "lardons", "jambon", "charcuterie", "volaille",
  "farine", "semoule", "féculent", "feculent", "légumineuse", "legumineuse",
  "flageolet", "flageolets", "lentille", "lentilles", "pois chiche", "pois chiches",
  "courgette", "courgettes", "aubergine", "poireau", "poireaux", "navet", "panais",
  "épinard", "epinard", "épinards", "epinards", "haricot vert", "haricots verts",
  "chou-fleur", "brocoli", "betterave", "céleri", "celeri", "fenouil", "artichaut",
  "basilic", "aneth", "estragon", "cerfeuil", "coriandre", "curcuma", "paprika", "cumin",
  "muscade", "cannelle", "vanille", "gingembre", "piment", "herbes de provence",
  "huile d'olive", "vinaigre balsamique", "sauce soja", "crème fraîche",
  "creme fraiche", "beurre demi-sel", "gruyère râpé", "gruyere rape",

  // ── DIY: tools, materials, actions ─────────────────────────────────
  "poncer", "ponçage", "poncage", "dégraisser", "degraisser", "décaper", "decaper",
  "lessiver", "spatuler", "enduire", "spackler", "rebouchage", "rebouchez",
  "sous-couche", "primaire d'accrochage", "peinture acrylique", "peinture glycéro",
  "peinture glycero", "rouleau", "pinceau", "spatule à enduire", "enduit",
  "mastic", "silicone", "joint", "colle", "colle à bois", "vernis",
  "lasure", "cheville", "chevilles", "vis à bois", "vis a bois", "boulon", "écrou",
  "ecrou", "rondelle", "équerre", "equerre", "tasseau", "tourillon", "perceuse",
  "visseuse", "mèche", "meche", "scie sauteuse", "scie circulaire",
  "ponceuse", "meuleuse", "niveau à bulle", "niveau a bulle", "mètre ruban",
  "metre ruban", "fil à plomb", "fil a plomb", "serre-joint", "établi", "etabli",
  "béton", "beton", "ciment", "mortier", "plâtre", "platre", "placo", "cloison",
  "mur porteur", "carrelage", "faïence", "faience", "parquet", "parquet flottant",
  "lambris", "plinthe", "moquette", "isolant", "laine de roche", "laine de verre",
  "pare-vapeur", "gouttière", "gouttiere", "chéneau", "cheneau", "chaudière",
  "chaudiere", "radiateur", "purger", "disjoncteur", "tableau électrique",
  "tableau electrique", "prise de courant", "interrupteur", "gaine", "goulotte",

  // ── Garden, animals ───────────────────────────────────────────────────────
  "semer", "repiquer", "bouturer", "tailler", "élaguer", "elaguer", "désherber",
  "desherber", "biner", "pailler", "arroser", "rempoter", "greffer", "récolte",
  "recolte", "floraison", "potager", "jardinière", "jardiniere", "compost",
  "terreau", "engrais", "puceron", "pucerons", "limace", "limaces", "savon noir",
  "tondeuse", "sécateur", "secateur", "arrosoir", "râteau", "rateau", "bêche",
  "beche", "binette", "brouette", "haie", "pelouse", "gazon", "massif", "nichoir",
  "mangeoire", "gamelle", "litière", "litiere", "laisse", "vermifuge", "vermifugé", "croquettes", "toilettage", "portée",

  "kiné", "kine", "kinés", "kines",

  // ── Sport ─────────────────────────────────────────────────────────────────
  "échauffement", "echauffement", "étirement", "etirement", "étirements",
  "etirements", "gainage", "renforcement", "fractionné", "fractionne", "endurance",
  "récupération", "recuperation", "courbature", "courbatures", "foulée", "foulee",
  "allure", "chrono", "dossard", "peloton", "danseuse", "col", "dénivelé",
  "denivele", "tapis de course", "vélo elliptique", "velo elliptique", "haltère",
  "haltere", "haltères", "halteres", "squat", "squats", "fente", "fentes",
  "traction", "tractions", "pompes", "abdominaux", "cardio", "musculation",
  "échauffer", "echauffer", "contre-attaque", "passe en profondeur", "tir au but",
  "penalty", "corner", "hors-jeu", "mi-temps", "prolongation", "arbitre",
  "championnat", "tournoi", "poule", "poules", "élimination directe",
  "elimination directe", "classement", "vestiaire", "licence sportive",

  // ── Car, transport ─────────────────────────────────────────────────
  "embrayage", "boîte de vitesses", "boite de vitesses", "courroie",
  "courroie de distribution", "plaquette de frein", "plaquettes de frein",
  "disque de frein", "amortisseur", "amortisseurs", "suspension", "géométrie",
  "geometrie", "parallélisme", "parallelisme", "pare-brise", "rétroviseur",
  "retroviseur", "essuie-glace", "carrosserie", "pot d'échappement",
  "pot d'echappement", "bougie", "alternateur", "démarreur", "demarreur",
  "batterie", "gazole", "sans plomb", "liquide de refroidissement", "vidange",
  "révision", "revision", "contrôle technique", "controle technique", "garagiste",
  "concession", "immatriculation", "covoiturage", "péage", "peage", "embouteillage", "rocade", "périphérique", "peripherique", "bretelle", "aire de repos",
  "correspondance", "rame", "wagon", "voiture-bar", "quai", "composter", "navette",
  "créneau de décollage", "creneau de decollage", "embarquement", "escale",
  "soute", "bagage à main", "bagage a main",

  // ── Weather, seasons ────────────────────────────────────────────────────────
  "averse", "averses", "éclaircie", "eclaircie", "accalmie", "redoux", "verglas",
  "grésil", "gresil", "giboulée", "giboulee", "bruine", "crachin", "rafale",
  "rafales", "bourrasque", "canicule", "caniculaire", "sécheresse", "secheresse",
  "nappe phréatique", "nappe phreatique", "rosée", "rosee", "gelée", "gelee",
  "brouillard", "orage", "grêle", "grele", "houle", "marée", "maree", "ciel couvert",

  // ── House, furniture, housekeeping ──────────────────────────────────────────────
  "canapé", "canape", "fauteuil", "commode", "étagère", "etagere", "penderie",
  "matelas", "sommier", "couette", "oreiller", "traversin", "housse", "rideau",
  "rideaux", "store", "volet", "volets", "luminaire", "applique", "abat-jour",
  "aspirateur", "serpillière", "serpilliere", "balai", "éponge", "eponge",
  "lessive", "adoucissant", "détartrant", "detartrant", "poubelle", "tri sélectif",
  "tri selectif", "encombrant", "déchetterie", "dechetterie", "gravats",

  // ── Clothing ─────────────────────────────────────────────────────────────
  "manteau", "doudoune", "parka", "imperméable", "impermeable", "pull", "maille",
  "côtelée", "cotelee", "chemisier", "pantalon", "velours", "jean brut", "bottine",
  "bottines", "basket", "baskets", "mocassin", "escarpin", "écharpe", "echarpe",
  "ourlet", "retouche", "fermeture éclair", "fermeture eclair", "doublure",
  "encolure", "taille", "pointure", "essayage", "cabine",

  // ── Shopping, delivery, customer service ─────────────────────────────────────
  "centre de tri", "colis", "suivi de commande", "remise en main propre",
  "point relais", "bon de commande", "avoir", "remboursement", "réclamation",
  "reclamation", "garantie", "main-d'œuvre", "main-d'oeuvre", "pièce détachée",
  "piece detachee", "devis", "pose", "dépose", "depose", "livraison", "expédition",
  "expedition", "retour", "échange", "echange", "remise", "solde", "soldes",

  // ── Other languages — the everyday core ────────────────────────────────
  // EN
  "preheat", "whisk", "simmer", "sauté", "saute", "knead", "sift", "baking tray",
  "frying pan", "saucepan", "gearbox", "clutch", "brake pads", "windscreen",
  "spark plug", "sanding", "primer", "emulsion", "skirting board", "plasterboard",
  "sorting centre", "tracking number", "warranty", "refund", "spare part",
  "counter-attack", "through ball", "warm-up", "cool-down",
  // DE
  "anbraten", "ablöschen", "abloschen", "köcheln", "kocheln", "backblech",
  "bremsbeläge", "bremsbelage", "keilriemen", "kupplung", "windschutzscheibe",
  "spachteln", "grundieren", "sockelleiste", "gipskarton", "paketzentrum",
  "sendungsverfolgung", "garantie", "erstattung", "ersatzteil",
  // ES
  "sofreír", "sofreir", "rehogar", "pimentón", "pimenton", "caldo", "sartén",
  "sarten", "pastillas de freno", "embrague", "parabrisas", "lijar", "imprimación",
  "imprimacion", "rodapié", "rodapie", "centro de clasificación",
  "centro de clasificacion", "seguimiento", "garantía", "garantia", "reembolso",
  // IT
  "soffriggere", "sfumare", "brodo", "padella", "pentola", "pastiglie dei freni",
  "frizione", "parabrezza", "stuccare", "carteggiare", "battiscopa",
  "centro di smistamento", "tracciamento", "garanzia", "rimborso", "stivaletti",
  // PT
  "refogar", "lume brando", "caldo", "frigideira", "tacho", "pastilhas dos travões",
  "pastilhas dos travoes", "embraiagem", "para-brisas", "lixar", "primário",
  "primario", "rodapé", "rodape", "centro de triagem", "garantia", "reembolso",
];
