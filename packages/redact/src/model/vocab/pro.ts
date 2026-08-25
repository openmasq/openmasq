/**
 * Vocabulary volume: **working life** — meetings and governance, sales & marketing,
 * customer service, and business travel / mobility — FR/EN/DE/ES/IT/PT. Discipline:
 * `./index`.
 *
 * Why it exists: three separate families measured 1/8 (transport), 2/8 (meetings) and
 * 2/9 (marketing) — the vocabulary of the most ordinary document a user pastes in, a
 * meeting note or a sales report. "compte rendu", "taux de conversion", "note de frais"
 * and "RER" were each faked into an invented organisation.
 *
 * ⚠️ Deliberately ABSENT: `berger`, `marchand`, `meunier` (already excluded by the admin
 * volume as surnames), `chauffeur` is kept (a role, not a French surname) but `voiturier`
 * and `messager` are not. A transport BRAND (SNCF, RATP, Uber) belongs in `notorious.ts`,
 * category-scoped — only the kind-of-service acronyms (`RER`, `TGV`, `TER`) are here.
 */
export const PRO_TERMS: string[] = [
  // ── Réunions & gouvernance — français ──────────────────────────────────────
  "réunion", "reunion", "réunions", "reunions", "ordre du jour", "compte rendu",
  "comptes rendus", "relevé de décisions", "releve de decisions", "verbatim",
  "visioconférence", "visioconference", "visio", "audioconférence",
  "audioconference", "webinaire", "séminaire", "seminaire", "atelier",
  "ateliers", "table ronde", "plénière", "pleniere", "groupe de travail",
  "point hebdomadaire", "point d'étape", "point d'etape", "débriefing",
  "debriefing", "restitution", "comité", "comite", "comité de pilotage",
  "comite de pilotage", "comité de direction", "comite de direction",
  "conseil d'administration", "assemblée générale", "assemblee generale",
  "instance", "convocation", "feuille de présence", "feuille de presence",
  "émargement", "emargement", "participants", "intervenant", "animateur",
  "animatrice", "rapporteur", "secrétaire de séance", "secretaire de seance",
  "entretien annuel", "entretien professionnel", "entretien individuel",
  "objectifs", "plan d'action", "prochaines étapes", "prochaines etapes",
  "arbitrage", "décision", "decision", "validation", "relance",

  // ── Verbes de mise en relation — français ─────────────────────────────────
  // Ils ouvrent la phrase JUSTE avant un téléphone ou un e-mail, donc ils arrivent
  // capitalisés et le NER les lit comme un prénom : « Appelle le 06 12 34 56 78 » →
  // « Appelle » remplacé par un prénom, et la phrase reçue par le modèle devient
  // absurde. Un over-redaction coûte à CHAQUE message, un manque seulement quand la
  // donnée est là. Aucun n'est un patronyme.
  "appelle", "appelez", "appeler", "rappelle", "rappelez", "rappeler", "joignable",
  "joindre", "contacte", "contactez", "contacter", "écris", "ecris", "écrivez",
  "ecrivez", "envoie", "envoyez", "réponds", "reponds", "répondez", "repondez",
  "demande", "demandez", "préviens", "previens", "prévenez", "prevenez",

  // ── Commerce & marketing — français ────────────────────────────────────────
  "prospect", "prospects", "prospection", "client", "cliente", "clientèle",
  "clientele", "fournisseur", "fournisseurs", "partenaire", "distributeur",
  "revendeur", "grossiste", "détaillant", "detaillant", "apporteur d'affaires",
  "canal", "canaux", "entonnoir", "tunnel de conversion", "taux de conversion",
  "taux d'ouverture", "taux de clic", "panier moyen", "chiffre",
  "campagne", "campagne publicitaire", "publicité", "publicite", "annonce",
  "encart", "référencement", "referencement", "mots-clés", "mots-cles",
  "notoriété", "notoriete", "image de marque", "positionnement", "segmentation",
  "cible", "ciblage", "audience", "portée", "portee", "engagement",
  "fidélisation", "fidelisation", "parrainage", "promotion", "remise",
  "ristourne", "rabais", "soldes", "offre", "offre commerciale", "catalogue",
  "gamme", "référence", "reference", "produit", "produits", "prestation",
  "abonnement", "renouvellement d'abonnement", "résiliation d'abonnement",
  "resiliation d'abonnement", "rétention", "retention", "satisfaction",
  "enquête de satisfaction", "enquete de satisfaction", "réclamation",
  "reclamation", "service client", "service après-vente", "service apres-vente",
  "support", "ticket", "commande", "bon de commande", "bon de livraison",
  "livraison", "expédition", "expedition", "colis", "retour", "remboursement",
  "avoir commercial", "conditions générales de vente",
  "conditions generales de vente", "délai de livraison", "delai de livraison",

  // ── Déplacements & mobilité — français ─────────────────────────────────────
  "déplacement", "deplacement", "déplacements", "deplacements", "trajet",
  "mission", "note de frais", "frais de déplacement", "frais de deplacement",
  "indemnité kilométrique", "indemnite kilometrique", "barème kilométrique",
  "bareme kilometrique", "péage", "peage", "carburant", "covoiturage",
  "autopartage", "location de véhicule", "location de vehicule",
  "véhicule de service", "vehicule de service", "immatriculation",
  "carte grise", "permis de conduire", "contrôle technique",
  "controle technique", "constat amiable", "malus", "bonus", "vétusté",
  "vetuste", "garantie décennale", "garantie decennale", "tous risques",
  // Acronymes de TYPE de service (jamais une marque : SNCF/RATP sont dans
  // `notorious.ts`, catégorie-scopés).
  "rer", "tgv", "ter", "métro", "metro", "tramway", "autocar", "navette",
  "correspondance",
  "billet", "titre de transport", "réservation", "reservation", "embarquement",
  "escale", "aéroport", "aeroport", "gare", "quai", "voie", "horaire",
  "horaires", "retard", "grève", "greve", "hébergement", "hebergement",
  "nuitée", "nuitee", "per diem", "ordre de mission",

  // ── English ────────────────────────────────────────────────────────────────
  "meeting", "minutes", "action items", "follow-up", "standup", "stand-up",
  "kickoff", "kick-off", "workshop", "webinar", "seminar", "offsite",
  "steering committee", "board meeting", "one-on-one", "performance review",
  "attendees", "facilitator", "chair", "note taker", "decision log",
  "next steps", "owner", "deadline", "prospect", "lead", "customer", "client",
  "supplier", "vendor", "reseller", "distributor", "wholesaler", "retailer",
  "channel", "funnel", "conversion rate", "open rate", "click-through rate",
  "average order value", "campaign", "advertising", "branding",
  "brand awareness", "positioning", "segmentation", "targeting", "persona",
  "reach", "engagement", "loyalty", "referral", "discount", "rebate",
  "promotion", "offer", "catalogue", "catalog", "product", "service",
  "subscription", "churn", "retention", "satisfaction survey", "complaint",
  "customer support", "customer success", "helpdesk", "service desk",
  "warranty claim", "purchase order", "delivery note", "shipping", "delivery",
  "parcel", "return", "refund", "terms and conditions", "lead time",
  // « business » nu : membre d'un libellé bancaire (« Frais Revolut Business ») lu comme
  // un NOM, il recevait un alias mot-à-mot qui réécrivait ensuite chaque « business ».
  "business",
  "business trip", "expense report", "mileage", "toll", "fuel", "carpooling",
  "car rental", "driving licence", "driving license", "license plate",
  "vehicle registration", "shuttle", "connection", "boarding", "layover",
  "flight", "airport", "station", "platform", "timetable", "delay", "strike",
  "accommodation", "per diem",

  // ── Deutsch ────────────────────────────────────────────────────────────────
  "besprechung", "sitzung", "protokoll", "tagesordnung", "teilnehmer",
  "videokonferenz", "webinar", "seminar", "workshop", "klausurtagung",
  "lenkungsausschuss", "vorstandssitzung", "jahresgespräch", "jahresgesprach",
  "mitarbeitergespräch", "mitarbeitergesprach", "beschluss", "maßnahme",
  "massnahme", "frist", "kunde", "kundin", "kunden", "interessent",
  "lieferant", "händler", "handler", "großhändler", "grosshandler",
  "einzelhändler", "einzelhandler", "vertrieb", "marketing", "werbung",
  "kampagne", "zielgruppe", "positionierung", "markenbekanntheit",
  "conversion-rate", "rabatt", "angebot", "katalog", "sortiment", "produkt",
  "dienstleistung", "abonnement", "kündigungsquote", "kundigungsquote",
  "kundenzufriedenheit", "reklamation", "kundendienst", "bestellung",
  "lieferung", "versand", "paket", "rücksendung", "rucksendung", "erstattung",
  "lieferzeit", "dienstreise", "reisekosten", "fahrtkosten", "kilometergeld",
  "maut", "kraftstoff", "fahrgemeinschaft", "mietwagen", "führerschein",
  "fuhrerschein", "kennzeichen", "fahrzeugschein", "bahnhof", "flughafen",
  "abflug", "umstieg", "fahrplan", "verspätung", "verspatung", "streik",
  "übernachtung", "ubernachtung", "tagegeld",

  // ── Español ────────────────────────────────────────────────────────────────
  "reunión", "reunion", "acta", "orden del día", "orden del dia", "asistentes",
  "videoconferencia", "seminario", "taller", "comité de dirección",
  "comite de direccion", "consejo de administración",
  "consejo de administracion", "junta", "evaluación anual", "evaluacion anual",
  "acuerdos", "próximos pasos", "proximos pasos", "responsable", "plazo",
  "cliente", "clienta", "proveedor", "distribuidor", "mayorista", "minorista",
  "canal", "embudo", "tasa de conversión", "tasa de conversion",
  "ticket medio", "campaña", "campana publicitaria", "publicidad", "marca",
  "posicionamiento", "segmentación", "segmentacion", "público objetivo",
  "publico objetivo", "alcance", "fidelización", "fidelizacion", "descuento",
  "promoción", "promocion", "oferta", "catálogo", "catalogo", "gama",
  "producto", "servicio", "suscripción", "suscripcion", "rotación de clientes",
  "rotacion de clientes", "satisfacción", "satisfaccion", "reclamación",
  "reclamacion", "atención al cliente", "atencion al cliente", "soporte",
  "pedido", "albarán", "albaran", "entrega", "envío", "envio", "paquete",
  "devolución", "devolucion", "reembolso", "plazo de entrega",
  "viaje de negocios", "dietas", "kilometraje", "peaje", "combustible",
  "vehículo", "vehiculo", "permiso de conducir", "matrícula", "matricula",
  "estación", "estacion", "aeropuerto", "andén", "anden", "horario", "retraso",
  "huelga", "alojamiento",

  // ── Italiano ───────────────────────────────────────────────────────────────
  "riunione", "verbale", "ordine del giorno", "partecipanti",
  "videoconferenza", "seminario", "laboratorio", "comitato direttivo",
  "consiglio di amministrazione", "assemblea", "colloquio annuale",
  "prossimi passi", "responsabile", "scadenza", "cliente", "fornitore",
  "distributore", "grossista", "dettagliante", "canale", "imbuto",
  "tasso di conversione", "scontrino medio", "campagna", "pubblicità",
  "pubblicita", "marchio", "posizionamento", "segmentazione",
  "pubblico di riferimento", "copertura", "fidelizzazione", "sconto",
  "promozione", "offerta", "catalogo", "gamma", "prodotto", "servizio",
  "abbonamento", "tasso di abbandono", "soddisfazione", "reclamo",
  "assistenza clienti", "ordine", "bolla di consegna", "consegna",
  "spedizione", "pacco", "reso", "rimborso", "tempi di consegna", "trasferta",
  "rimborso spese", "chilometraggio", "pedaggio", "carburante", "veicolo",
  "patente", "targa", "stazione", "aeroporto", "binario", "orario", "ritardo",
  "sciopero", "alloggio", "diaria",

  // ── Português ──────────────────────────────────────────────────────────────
  "reunião", "reuniao", "ata", "ordem do dia", "participantes",
  "videoconferência", "videoconferencia", "seminário", "seminario", "oficina",
  "comité de direção", "comite de direcao", "conselho de administração",
  "conselho de administracao", "assembleia", "avaliação anual",
  "avaliacao anual", "próximos passos", "proximos passos", "responsável",
  "responsavel", "prazo", "cliente", "fornecedor", "distribuidor", "grossista",
  "retalhista", "varejista", "canal", "funil", "taxa de conversão",
  "taxa de conversao", "ticket médio", "ticket medio", "campanha",
  "publicidade", "marca", "posicionamento", "segmentação", "segmentacao",
  "público-alvo", "publico-alvo", "alcance", "fidelização", "fidelizacao",
  "desconto", "promoção", "promocao", "oferta", "catálogo", "catalogo",
  "gama", "produto", "serviço", "servico", "assinatura", "taxa de abandono",
  "satisfação", "satisfacao", "reclamação", "reclamacao",
  "atendimento ao cliente", "suporte", "encomenda", "guia de remessa",
  "entrega", "envio", "encomenda expedida", "devolução", "devolucao",
  "reembolso", "prazo de entrega", "viagem de negócios", "viagem de negocios",
  "ajudas de custo", "quilometragem", "portagem", "pedágio", "pedagio",
  "combustível", "combustivel", "veículo", "veiculo", "carta de condução",
  "carta de conducao", "carteira de motorista", "estação", "estacao",
  "aeroporto", "cais", "horário", "horario", "atraso", "greve", "alojamento",
];
