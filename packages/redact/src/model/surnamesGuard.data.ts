/**
 * PATRONYMES COURANTS — **données de TEST uniquement**, jamais lues par le moteur.
 *
 * Elles servent le garde-fou de `vocabGuards.test.ts` : un terme de vocabulaire ne doit
 * jamais être atteignable comme nom de famille réel. Le lexique de prénoms
 * (`engine/names/firstNames.data.ts`) ne couvre pas cet axe, et les corpus n'apportent
 * qu'une centaine de patronymes — trop peu dès qu'on ajoute du vocabulaire COURANT, où le
 * piège est dense : « poisson », « berger », « meunier », « boulanger », « chevalier »,
 * « molly », « brando » sont tous des noms de famille portés par des gens réels.
 *
 * ⚠️ Ne JAMAIS importer ce fichier depuis `src/` hors des tests. Ce n'est pas une liste de
 * détection : s'en servir pour reconnaître un nom transformerait un outil de sécurité en
 * heuristique, et un patronyme absent y deviendrait un nom « non reconnu ».
 *
 * Les formes sont écrites SANS accent quand l'usage administratif les écrit ainsi, et
 * accentuées sinon — la comparaison du test reproduit la portée exacte du moteur, qui
 * conserve les accents.
 */
export const COMMON_SURNAMES: string[] = [
  // France — les plus portés
  "martin", "bernard", "thomas", "petit", "robert", "richard", "durand", "dubois",
  "moreau", "laurent", "simon", "michel", "lefebvre", "lefèvre", "leroy", "roux",
  "david", "bertrand", "morel", "fournier", "girard", "bonnet", "dupont", "lambert",
  "fontaine", "rousseau", "vincent", "muller", "faure", "andré", "mercier", "blanc",
  "guerin", "guérin", "boyer", "garnier", "chevalier", "françois", "legrand",
  "gauthier", "garcia", "perrin", "robin", "clement", "clément", "morin", "nicolas",
  "henry", "roussel", "mathieu", "gautier", "masson", "marchand", "duval", "denis",
  "dumont", "marie", "lemaire", "noel", "noël", "meyer", "dufour", "meunier", "brun",
  "blanchard", "giraud", "joly", "riviere", "rivière", "lucas", "brunet", "gaillard",
  "barbier", "arnaud", "martinez", "gerard", "gérard", "roche", "renard", "schmitt",
  "roy", "leroux", "colin", "vidal", "caron", "picard", "roger", "fabre", "aubert",
  "lemoine", "renaud", "dumas", "lacroix", "olivier", "philippe", "bourgeois",
  "pierre", "benoit", "benoît", "rey", "leclerc", "payet", "rolland", "leclercq",
  "guillaume", "lecomte", "lopez", "jean", "dupuy", "guillot", "hubert", "berger",
  "carpentier", "sanchez", "dupuis", "moulin", "louis", "deschamps", "huet",
  "vasseur", "perez", "boucher", "fleury", "royer", "klein", "jacquet", "adam",
  "paris", "poirier", "marty", "aubry", "guyot", "carre", "carré", "charles",
  "renault", "charpentier", "menard", "ménard", "maillard", "baron", "bertin",
  "bailly", "hervé", "schneider", "fernandez", "collet", "leger", "léger", "bouvier",
  "julien", "prevost", "prévost", "millet", "perrot", "daniel", "cousin", "germain",
  "breton", "besson", "langlois", "remy", "rémy", "pelletier", "leveque", "lévêque",
  "perrier", "leblanc", "barre", "barré", "lebrun", "marchal", "weber", "mallet",
  "hamon", "boulanger", "jacob", "monnier", "michaud", "rodriguez", "guichard",
  "gillet", "etienne", "étienne", "grondin", "poulain", "tessier", "chevallier",
  "collin", "chauvin", "bouchet", "gay", "lemaitre", "lemaître", "benard", "bénard",
  "marechal", "maréchal", "humbert", "reynaud", "antoine", "hoarau", "perret",
  "barthelemy", "barthélemy", "cordier", "pichon", "lejeune", "gilbert", "lamy",
  "delaunay", "pasquier", "carlier", "laporte", "poisson", "chaton", "gardien",
  "bonnet", "foret", "serre", "collier", "cordon", "panier", "bouchon",
  "berthier", "boulay", "colas", "cornu", "delattre", "delorme", "dubourg", "ferrand",
  "gosselin", "hebert", "hébert", "jourdan", "lecoq", "lefort", "maillet", "marion",
  "maurice", "navarro", "pons", "pottier", "poulet", "raynaud", "regnier", "régnier",
  "ribeiro", "salmon", "seguin", "tanguy", "torres", "verdier", "vernet", "vallet",
  // Hors France — les plus fréquents dans les corpus multilingues du produit
  "smith", "jones", "brown", "wilson", "taylor", "davies", "evans", "walker",
  "young", "king", "wright", "baker", "green", "hall", "cook", "ward", "bell",
  "carter", "turner", "parker", "collins", "murphy", "kelly", "ryan", "brando",
  "molly", "schmidt", "fischer", "wagner", "becker", "hoffmann", "koch", "richter",
  "bauer", "wolf", "zimmermann", "braun", "krüger", "kruger", "hartmann", "lange",
  "werner", "krause", "meier", "lehmann", "schulze", "maier", "köhler", "kohler",
  "herrmann", "walter", "könig", "konig", "mayer", "huber", "kaiser", "fuchs",
  "peters", "lang", "scholz", "möller", "moller", "vogel", "jung", "hahn", "keller",
  "gonzalez", "gonzález", "hernandez", "hernández", "ramirez", "ramírez", "flores",
  "rivera", "gomez", "gómez", "diaz", "díaz", "cruz", "morales", "ortiz", "gutierrez",
  "gutiérrez", "castillo", "romero", "vargas", "ruiz", "alvarez", "álvarez", "moreno",
  "jimenez", "jiménez", "navarro", "serrano", "molina", "delgado", "castro", "ortega",
  "rossi", "russo", "ferrari", "esposito", "bianchi", "romano", "colombo", "ricci",
  "marino", "greco", "bruno", "gallo", "conti", "mancini", "costa", "giordano",
  "rizzo", "lombardi", "barbieri", "fontana", "santoro", "mariani", "rinaldi",
  "caruso", "ferrara", "galli", "martini", "leone", "longo", "gentile", "martinelli",
  "silva", "santos", "ferreira", "pereira", "oliveira", "carvalho", "almeida",
  "lima", "gomes", "araujo", "araújo", "melo", "barbosa", "rocha", "dias", "nunes",
  "soares", "vieira", "monteiro", "cardoso", "correia", "mendes", "pinto",
];
