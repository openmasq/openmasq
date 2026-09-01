/**
 * Vocabulary volume: **health and care** — professions, care settings, exams and acts,
 * biology, treatment, and the care pathway — FR/EN/DE/ES/IT/PT. Discipline in `./index`.
 *
 * Why it exists: a prescription, a lab report or a specialist's letter is exactly the
 * document a user hesitates to hand to a model, and today "cardiologue", "échographie"
 * and "glycémie" go to the vault while the patient's name is (correctly) protected next
 * to them — so the cost of protection is paid and the document is unusable anyway.
 * Measured before this volume: 5/15 of the most common care words covered.
 *
 * ⚠️ Sparing the LABEL exposes no health data. "glycémie" is the name of a measurement;
 * the value beside it is a number and is caught by its own rule — the same split as
 * "IBAN" in clear with the account number vaulted. What is NOT here: every eponymous
 * disease or scale (`parkinson`, `alzheimer`, `crohn`, `hodgkin`, `apgar`, `glasgow`),
 * because those ARE surnames spelled exactly as the person's, and `pasteur`, `curie`,
 * `vidal` for the same reason.
 */
export const SANTE_TERMS: string[] = [
  // ── Professions & services — French ────────────────────────────────────────
  "médecin", "medecin", "médecins", "généraliste", "generaliste", "spécialiste",
  "specialiste", "praticien", "praticienne", "cardiologue", "dermatologue",
  "pédiatre", "pediatre", "gynécologue", "gynecologue", "ophtalmologue",
  "ophtalmologiste", "otorhinolaryngologiste", "radiologue", "anesthésiste",
  "anesthesiste", "chirurgien", "chirurgienne", "psychiatre", "psychologue",
  "neurologue", "pneumologue", "néphrologue", "nephrologue", "endocrinologue",
  "rhumatologue", "gastro-entérologue", "gastro-enterologue", "oncologue",
  "urologue", "urgentiste", "réanimateur", "reanimateur", "biologiste",
  "kinésithérapeute", "kinesitherapeute", "orthophoniste", "ergothérapeute",
  "ergotherapeute", "psychomotricien", "podologue", "pédicure", "pedicure",
  "diététicien", "dieteticien", "nutritionniste", "ostéopathe", "osteopathe",
  "infirmier", "infirmière", "infirmiere", "aide-soignant", "aide-soignante",
  "auxiliaire de vie", "brancardier", "sage-femme", "puéricultrice", "puericultrice",
  "pharmacien", "pharmacienne", "préparateur", "preparateur", "dentiste",
  "chirurgien-dentiste", "orthodontiste", "vétérinaire", "veterinaire",
  "manipulateur radio", "secrétaire médicale", "secretaire medicale",

  // ── Structures & pathway — French ──────────────────────────────────────────
  "hôpital", "hopital", "hôpitaux", "hopitaux", "clinique", "polyclinique",
  "centre hospitalier", "cabinet médical", "cabinet medical", "maison de santé",
  "maison de sante", "centre de santé", "centre de sante", "dispensaire",
  "laboratoire d'analyses", "officine", "urgences", "réanimation", "reanimation",
  "soins intensifs", "bloc opératoire", "bloc operatoire", "salle de réveil",
  "salle de reveil", "maternité", "maternite", "consultation", "consultations",
  "hospitalisation", "ambulatoire", "externe", "admission", "sortie",
  "compte rendu d'hospitalisation", "lettre de liaison", "orientation",
  "adressé par", "adresse par", "médecin traitant", "medecin traitant",
  "parcours de soins", "protocole de soins", "soins", "soin", "suivi",
  "télémédecine", "telemedecine", "téléconsultation", "teleconsultation",
  "permanence des soins", "astreinte médicale", "astreinte medicale",

  // ── Exams & procedures — French ────────────────────────────────────────────
  "examen", "examens", "imagerie", "irm", "radiographie", "radio", "échographie",
  "echographie", "doppler", "scanner", "tomodensitométrie", "tomodensitometrie",
  "mammographie", "scintigraphie", "coloscopie", "endoscopie", "fibroscopie",
  "coronarographie", "angiographie", "biopsie", "ponction", "prélèvement",
  "prelevement", "prise de sang", "bilan sanguin", "bilan biologique", "analyse",
  "analyses", "électrocardiogramme", "electrocardiogramme", "électroencéphalogramme",
  "electroencephalogramme", "spirométrie", "spirometrie", "audiogramme",
  "dépistage", "depistage", "vaccination", "vaccin", "rappel", "injection",
  "perfusion", "transfusion", "greffe", "transplantation", "dialyse",
  "chimiothérapie", "chimiotherapie", "radiothérapie", "radiotherapie",
  "immunothérapie", "immunotherapie", "kinésithérapie", "kinesitherapie",
  "rééducation", "reeducation", "anesthésie", "anesthesie", "intervention",
  "opération", "operation", "suture", "pansement", "plâtre", "platre", "attelle",
  "prothèse", "prothese", "orthèse", "orthese", "appareillage",

  // ── Biology & vital signs — French ─────────────────────────────────────────
  "hémoglobine", "hemoglobine", "glycémie", "glycemie", "cholestérol",
  "cholesterol", "triglycérides", "triglycerides", "créatinine", "creatinine",
  "plaquettes", "leucocytes", "globules blancs", "globules rouges", "hématocrite",
  "hematocrite", "ferritine", "transaminases", "urée", "uree", "potassium",
  "sodium", "calcium", "vitamine", "sérologie", "serologie", "antigène",
  "antigene", "anticorps", "groupe sanguin", "rhésus", "rhesus", "numération",
  "numeration", "tension artérielle", "tension arterielle", "pouls",
  "fréquence cardiaque", "frequence cardiaque", "saturation", "température",
  "temperature", "poids", "taille", "indice de masse corporelle",

  // ── Clinical & treatment — French ──────────────────────────────────────────
  "diagnostic", "pronostic", "symptôme", "symptome", "symptômes", "symptomes",
  "antécédents", "antecedents", "allergie", "allergies", "intolérance",
  "intolerance", "traitement", "traitements", "prescription", "posologie",
  "renouvellement", "générique", "generique", "princeps", "comprimé", "comprime",
  "gélule", "gelule", "sirop", "pommade", "collyre", "suppositoire", "ampoule",
  "dose", "doses", "matin", "midi", "soir", "effet indésirable",
  "effet indesirable", "contre-indication", "observance", "sevrage", "rechute",
  "rémission", "remission", "guérison", "guerison", "chronique", "aigu", "aiguë",
  "aigue", "bénin", "benin", "stade", "grade",

  // ── Rights, social & disability — French ───────────────────────────────────
  "affection de longue durée", "arrêt de travail", "arret de travail",
  "arrêt maladie", "arret maladie", "invalidité", "invalidite", "incapacité",
  "incapacite", "handicap", "aidant", "aidant familial", "dépendance",
  "dependance", "autonomie", "tiers payant", "feuille de soins", "carte vitale",
  "dossier médical", "dossier medical", "secret médical", "secret medical",
  "consentement éclairé", "consentement eclaire", "directives anticipées",
  "directives anticipees", "personne de confiance", "patient", "patiente",
  "assuré social", "assure social", "ayant droit",

  // ── English ────────────────────────────────────────────────────────────────
  "physician", "general practitioner", "specialist", "consultant", "surgeon",
  "anesthetist", "anaesthetist", "psychiatrist", "physiotherapist", "nurse",
  "midwife", "paramedic", "pharmacist", "dentist", "pediatrician", "paediatrician",
  "cardiologist", "dermatologist", "radiologist", "oncologist", "neurologist",
  "hospital", "clinic", "emergency room", "emergency department",
  "intensive care", "operating theatre", "outpatient", "inpatient", "admission",
  "discharge", "discharge summary", "referral", "follow-up", "appointment",
  "medical record", "informed consent", "telemedicine", "care pathway",
  "diagnosis", "prognosis", "symptom", "symptoms", "medical history", "allergy",
  "allergies", "treatment", "therapy", "prescription", "dosage", "tablet",
  "capsule", "injection", "infusion", "transfusion", "dialysis", "chemotherapy",
  "radiotherapy", "immunotherapy", "rehabilitation", "surgery", "anaesthesia",
  "anesthesia", "biopsy", "blood test", "blood count", "x-ray", "ultrasound",
  "scan", "screening", "vaccination", "vaccine", "booster", "blood pressure",
  "heart rate", "temperature", "glucose", "cholesterol", "hemoglobin",
  "haemoglobin", "platelets", "white blood cells", "red blood cells",
  "side effect", "contraindication", "remission", "relapse", "chronic", "acute",

  // ── German ─────────────────────────────────────────────────────────────────
  "arzt", "ärztin", "arztin", "hausarzt", "hausärztin", "facharzt", "fachärztin",
  "kinderarzt", "zahnarzt", "frauenarzt", "augenarzt", "chirurg", "chirurgin",
  "anästhesist", "anasthesist", "psychiater", "psychologe", "physiotherapeut",
  "krankenschwester", "krankenpfleger", "pflegekraft", "hebamme", "apotheker",
  "apotheke", "krankenhaus", "klinik", "praxis", "station", "notaufnahme",
  "intensivstation", "operationssaal", "arztbrief", "befund", "befunde",
  "diagnose", "anamnese", "therapie", "behandlung", "rezept", "dosierung",
  "nebenwirkung", "nebenwirkungen", "impfung", "impfstoff", "blutbild", "blutdruck", "blutwerte",
  "röntgen", "rontgen", "ultraschall", "überweisung", "uberweisung",
  "einweisung", "entlassung", "krankschreibung", "patient", "patientin",
  "vorsorge", "nachsorge", "pflege", "pflegegrad", "schweigepflicht",

  // ── Spanish ────────────────────────────────────────────────────────────────
  "médico", "medico", "médica", "medica", "facultativo", "enfermero", "enfermera",
  "matrona", "farmacéutico", "farmaceutico", "farmacia", "cirujano", "cirujana",
  "pediatra", "cardiólogo", "cardiologo", "ginecólogo", "ginecologo",
  "oftalmólogo", "oftalmologo", "dentista", "fisioterapeuta", "psicólogo",
  "psicologo", "hospital", "clínica", "clinica", "ambulatorio", "consulta",
  "urgencias", "quirófano", "quirofano", "planta", "ingreso", "alta médica",
  "alta medica", "informe médico", "informe medico", "historia clínica",
  "historia clinica", "receta", "dosis", "posología", "posologia", "diagnóstico",
  "diagnostico", "pronóstico", "pronostico", "tratamiento", "síntoma", "sintoma",
  "síntomas", "sintomas", "antecedentes", "alergia", "alergias", "análisis",
  "analisis", "analítica", "analitica", "radiografía", "radiografia", "ecografía",
  "ecografia", "biopsia", "vacuna", "vacunación", "vacunacion", "quimioterapia",
  "radioterapia", "rehabilitación", "rehabilitacion", "cirugía", "cirugia",
  "anestesia", "tensión arterial", "tension arterial", "efecto secundario",
  "efectos secundarios",

  // ── Italian ────────────────────────────────────────────────────────────────
  "medico di base", "medico curante", "infermiere", "infermiera", "ostetrica",
  "farmacista", "chirurgo", "cardiologo", "ginecologo", "oculista", "dentista",
  "fisioterapista", "psicologo", "ospedale", "ambulatorio", "pronto soccorso",
  "reparto", "sala operatoria", "ricovero", "dimissione", "visita",
  "visita specialistica", "cartella clinica", "referto", "ricetta", "dosaggio",
  "posologia", "diagnosi", "prognosi", "terapia", "sintomo", "sintomi",
  "anamnesi", "allergia", "allergie", "analisi", "esami", "radiografia",
  "ecografia", "risonanza magnetica", "biopsia", "vaccino", "vaccinazione",
  "chemioterapia", "radioterapia", "riabilitazione", "chirurgia", "anestesia",
  "pressione arteriosa", "effetto collaterale", "paziente",

  // ── Portuguese ─────────────────────────────────────────────────────────────
  "médico de família", "medico de familia", "enfermeiro", "enfermeira",
  "parteira", "farmacêutico", "farmaceutico", "farmácia", "farmacia", "cirurgião",
  "cirurgiao", "cardiologista", "ginecologista", "oftalmologista", "pediatra",
  "fisioterapeuta", "psicólogo", "psicologo", "hospital", "clínica", "clinica",
  "urgência", "urgencia", "pronto-socorro", "enfermaria", "bloco operatório",
  "bloco operatorio", "internamento", "internação", "internacao", "alta",
  "consulta", "prontuário", "prontuario", "relatório médico", "relatorio medico",
  "receita", "dosagem", "posologia", "diagnóstico", "diagnostico", "prognóstico",
  "prognostico", "tratamento", "sintoma", "sintomas", "antecedentes", "alergia",
  "alergias", "análise", "analise", "exames", "radiografia", "ecografia",
  "biópsia", "biopsia", "vacina", "vacinação", "vacinacao", "quimioterapia",
  "radioterapia", "reabilitação", "reabilitacao", "cirurgia", "anestesia",
  "pressão arterial", "pressao arterial", "efeito secundário", "efeito colateral",
];
