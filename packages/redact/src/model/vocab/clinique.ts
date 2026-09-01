/**
 * Vocabulary volume: **molecules, pathologies and anatomy** — the half of care that
 * `./sante` deliberately left out. That volume covers the FORM of care ("comprimé",
 * "posologie", "contre-indication"); this one covers WHAT is prescribed and WHAT is
 * treated. FR first, then EN/DE/ES/IT/PT for the terms that actually occur.
 *
 * Why it is safe, and it is the same argument `./sante` makes for "glycémie": **a
 * pathology or a molecule identifies NOBODY.** « diabète de type 2 » designates millions
 * of people; the identification comes from the name, the address and the numbers beside
 * it, which stay redacted. Measured before this volume: an ordonnance shipped
 * « DOLIPRANE » to the vault while « comprimé » and « posologie » stayed in clear — the
 * cost of protection paid, and the prescription unusable.
 *
 * ⚠️ THREE things are deliberately ABSENT, each a permanent leak if added
 * (`../vocabGuards.test.ts` fails the build on any of them):
 *
 * 1. **Every EPONYMOUS disease, syndrome or scale** — `parkinson`, `alzheimer`, `crohn`,
 *    `hodgkin`, `charcot`, `basedow`, `ménière`, `dupuytren`, `sjögren`, `behçet`,
 *    `asperger`, `cushing`, `addison`, `raynaud`, `paget`, `wilson`, `tourette`, `apgar`,
 *    `glasgow`. Those ARE surnames, spelled exactly as the patient's. Sparing them ships
 *    a real person's name in clear forever. They need a CONTEXTUAL gate ("maladie de X",
 *    "syndrome de X") — the sentence disambiguates, never the word.
 * 2. **Every LABORATORY and BRAND** — `roche`, `servier`, `bayer`, `merck`, `sanofi`,
 *    `pfizer`, `doliprane`, `spasfon`, `levothyrox`. A vendor's proper name belongs in
 *    `../notorious.ts`, which is category-SCOPED: it spares the COMPANY and still
 *    redacts the person. The corpus contains `jeanne.cayre@exemple.fr` — the collision is
 *    not hypothetical.
 * 3. **RARE / orphan diseases.** A pathology shared by a few hundred people is a
 *    quasi-identifier: combined with a département it re-identifies. This volume covers
 *    the common, which is what a real conversation is about.
 *
 * And the volume rules from `./index` still apply: no bare 1-2 char Latin token, accented
 * spelling as written, never a word that doubles as a given name (`iris` the anatomy, and
 * `colon`/`rein` bare — Spanish and Dutch surnames — are absent for that reason; `côlon`
 * and `reins` carry the meaning).
 */
export const CLINIQUE_TERMS: string[] = [
  // ── Molecules (INN) — analgesics, anti-inflammatories, opioids ──────────────
  "paracétamol", "paracetamol", "acétaminophène", "acetaminophene", "ibuprofène",
  "ibuprofen", "aspirine", "acide acétylsalicylique", "kétoprofène", "ketoprofene",
  "diclofénac", "diclofenac", "naproxène", "naproxene", "célécoxib", "celecoxib",
  "tramadol", "codéine", "codeine", "morphine", "oxycodone", "fentanyl", "néfopam",
  "nefopam", "phloroglucinol",

  // ── Molecules — anti-infectives ────────────────────────────────────────────
  "amoxicilline", "pénicilline", "penicilline", "ampicilline", "azithromycine",
  "clarithromycine", "érythromycine", "erythromycine", "ciprofloxacine",
  "ofloxacine", "lévofloxacine", "levofloxacine", "doxycycline", "métronidazole",
  "metronidazole", "céfixime", "cefixime", "ceftriaxone", "gentamicine",
  "vancomycine", "clindamycine", "rifampicine", "fluconazole", "aciclovir",
  "oseltamivir", "antibiotique", "antibiotiques", "antibiothérapie", "antifongique",
  "antiviral", "vaccin", "vaccination", "rappel vaccinal",

  // ── Molecules — cardio, metabolism, endocrinology ──────────────────────────
  "metformine", "gliclazide", "glimépiride", "sitagliptine", "empagliflozine",
  "insuline", "lévothyroxine", "levothyroxine", "atorvastatine", "simvastatine",
  "rosuvastatine", "pravastatine", "ézétimibe", "ezetimibe", "amlodipine",
  "nifédipine", "nifedipine", "ramipril", "périndopril", "perindopril", "énalapril",
  "enalapril", "lisinopril", "losartan", "valsartan", "irbésartan", "irbesartan",
  "candésartan", "candesartan", "bisoprolol", "aténolol", "atenolol", "métoprolol",
  "metoprolol", "propranolol", "furosémide", "furosemide", "hydrochlorothiazide",
  "spironolactone", "digoxine", "amiodarone", "warfarine", "apixaban", "rivaroxaban",
  "clopidogrel", "héparine", "heparine", "statine", "statines", "anticoagulant",
  "anticoagulants", "antiagrégant", "antihypertenseur",

  // ── Molecules — respiratory, allergology, corticosteroids ──────────────────
  "salbutamol", "terbutaline", "budésonide", "budesonide", "fluticasone",
  "béclométasone", "beclometasone", "montélukast", "montelukast", "cétirizine",
  "cetirizine", "loratadine", "desloratadine", "corticoïde", "corticoide",
  "corticoïdes", "corticoides", "prednisone", "prednisolone", "hydrocortisone",
  "dexaméthasone", "dexamethasone", "bétaméthasone", "betamethasone", "bronchodilatateur",

  // ── Molecules — neuro, psychiatry, sleep ───────────────────────────────────
  "diazépam", "diazepam", "lorazépam", "lorazepam", "alprazolam", "bromazépam",
  "bromazepam", "oxazépam", "oxazepam", "zolpidem", "zopiclone", "benzodiazépine",
  "benzodiazepine", "sertraline", "fluoxétine", "fluoxetine", "paroxétine",
  "paroxetine", "citalopram", "escitalopram", "venlafaxine", "duloxétine",
  "duloxetine", "mirtazapine", "amitriptyline", "antidépresseur", "antidepresseur",
  "anxiolytique", "neuroleptique", "lamotrigine", "valproate", "lévétiracétam",
  "levetiracetam", "gabapentine", "prégabaline", "pregabaline", "carbamazépine",
  "carbamazepine", "antiépileptique", "antiepileptique",

  // ── Molecules — miscellaneous ──────────────────────────────────────────────
  "oméprazole", "omeprazole", "ésoméprazole", "esomeprazole", "pantoprazole",
  "lansoprazole", "dompéridone", "domperidone", "métoclopramide", "metoclopramide",
  "lopéramide", "loperamide", "macrogol", "allopurinol", "colchicine",
  "méthotrexate", "methotrexate", "hydroxychloroquine", "tamoxifène", "tamoxifene",
  "anastrozole", "finastéride", "finasteride", "tamsulosine", "sildénafil",
  "sildenafil", "chimiothérapie", "chimiotherapie", "immunothérapie", "radiothérapie",
  "radiotherapie", "anesthésique", "anesthesique", "antalgique", "antalgiques",
  "anti-inflammatoire", "anti-inflammatoires", "vitamine", "vitamines",
  "supplémentation", "supplementation", "générique", "molécule", "molecule",
  "principe actif", "excipient",

  // ── Pathologies — metabolism, endocrinology, nutrition ─────────────────────
  "diabète", "diabete", "diabétique", "diabetique", "prédiabète", "prediabete",
  "hypoglycémie", "hypoglycemie", "hyperglycémie", "hyperglycemie", "cholestérol",
  "cholesterol", "hypercholestérolémie", "hypercholesterolemie", "dyslipidémie",
  "dyslipidemie", "obésité", "obesite", "surpoids", "dénutrition", "denutrition",
  "goutte", "hypothyroïdie", "hypothyroidie", "hyperthyroïdie", "hyperthyroidie",
  "thyroïdite", "thyroidite", "ménopause", "menopause", "ostéoporose", "osteoporose",

  // ── Pathologies — cardiovascular ───────────────────────────────────────────
  "hypertension", "hypertension artérielle", "hypertension arterielle", "hypotension",
  "insuffisance cardiaque", "infarctus", "infarctus du myocarde", "angor",
  "angine de poitrine", "arythmie", "fibrillation", "fibrillation auriculaire",
  "tachycardie", "bradycardie", "palpitations", "souffle cardiaque", "athérosclérose",
  "atherosclerose", "anévrisme", "anevrisme", "embolie", "embolie pulmonaire",
  "phlébite", "phlebite", "thrombose", "varices", "accident vasculaire cérébral",
  "accident vasculaire cerebral", "artériopathie", "arteriopathie",

  // ── Pathologies — respiratory, ENT, infectious ─────────────────────────────
  "asthme", "asthmatique", "bronchite", "bronchiolite", "bronchopneumopathie",
  "emphysème", "emphyseme", "pneumonie", "pneumopathie", "pleurésie", "pleuresie",
  "tuberculose", "apnée du sommeil", "apnee du sommeil", "sinusite", "rhinite",
  "rhinopharyngite", "pharyngite", "laryngite", "angine", "amygdalite", "otite",
  "rhume", "grippe", "bronchiolite", "covid", "varicelle", "rougeole", "oreillons",
  "rubéole", "rubeole", "zona", "herpès", "herpes", "mycose", "candidose",

  // ── Pathologies — digestive, urinary, gynecology ───────────────────────────
  "gastro-entérite", "gastro-enterite", "gastrite", "reflux", "reflux gastro-œsophagien",
  "ulcère", "ulcere", "colite", "colopathie", "syndrome de l'intestin irritable",
  "diverticulite", "hémorroïdes", "hemorroides", "hernie", "hernie discale",
  "hernie inguinale", "appendicite", "cholécystite", "cholecystite", "lithiase",
  "calcul rénal", "calcul renal", "colique néphrétique", "colique nephretique",
  "cystite", "pyélonéphrite", "pyelonephrite", "insuffisance rénale",
  "insuffisance renale", "prostatite", "endométriose", "endometriose", "fibrome",
  "cirrhose", "hépatite", "hepatite", "stéatose", "steatose", "pancréatite",
  "pancreatite", "constipation", "diarrhée", "diarrhee",

  // ── Pathologies — neuro, psychiatry, rheumatology, dermatology ─────────────
  "épilepsie", "epilepsie", "sclérose en plaques", "sclerose en plaques", "migraine",
  "céphalée", "cephalee", "névralgie", "nevralgie", "neuropathie", "polyneuropathie",
  "démence", "demence", "dépression", "depression", "anxiété", "anxiete",
  "trouble bipolaire", "schizophrénie", "schizophrenie", "insomnie", "burn-out",
  "arthrose", "arthrite", "polyarthrite", "polyarthrite rhumatoïde", "tendinite",
  "bursite", "lombalgie", "cervicalgie", "dorsalgie", "sciatique", "cruralgie",
  "scoliose", "fibromyalgie", "eczéma", "eczema", "psoriasis", "urticaire", "acné",
  "acne", "dermatite", "rosacée", "rosacee", "alopécie", "alopecie",

  // ── Pathologies — oncology, hematology, ophthalmology ──────────────────────
  "cancer", "carcinome", "adénocarcinome", "adenocarcinome", "mélanome", "melanome",
  "sarcome", "tumeur", "tumeur bénigne", "tumeur maligne", "métastase", "metastase",
  "leucémie", "leucemie", "lymphome", "myélome", "myelome", "kyste", "polype",
  "nodule", "anémie", "anemie", "thrombopénie", "thrombopenie", "hémophilie",
  "hemophilie", "drépanocytose", "drepanocytose", "cataracte", "glaucome",
  "conjonctivite", "dégénérescence maculaire", "degenerescence maculaire", "myopie",
  "acouphène", "acouphene", "acouphènes", "surdité", "surdite",

  // ── Symptoms, trauma, signs ────────────────────────────────────────────────
  "fièvre", "fievre", "asthénie", "asthenie", "fatigue", "toux", "dyspnée", "dyspnee",
  "essoufflement", "nausée", "nausee", "nausées", "nausees", "vomissement",
  "vomissements", "vertige", "vertiges", "malaise", "syncope", "œdème", "oedeme",
  "inflammation", "infection", "démangeaison", "demangeaison", "prurit", "douleur",
  "douleurs", "fracture", "entorse", "luxation", "contusion", "hématome", "hematome",
  "plaie", "brûlure", "brulure", "escarre", "cicatrice", "traumatisme",

  // ── Anatomy ────────────────────────────────────────────────────────────────
  "genou", "genoux", "épaule", "epaule", "coude", "poignet", "cheville", "hanche",
  "thorax", "abdomen", "rachis", "vertèbre", "vertebre", "vertèbres", "sacrum",
  "bassin", "fémur", "femur", "tibia", "péroné", "perone", "rotule", "clavicule",
  "omoplate", "sternum", "côte", "côtes", "crâne", "crane", "mâchoire", "machoire",
  "cœur", "coeur", "poumon", "poumons", "foie", "reins", "rénal", "renal", "vessie",
  "estomac", "intestin", "côlon", "rectum", "pancréas", "pancreas", "rate",
  "thyroïde", "thyroide", "prostate", "utérus", "uterus", "ovaire", "ovaires",
  "artère", "artere", "artères", "arteres", "veine", "veines", "aorte", "carotide",
  "tendon", "tendons", "ligament", "ligaments", "cartilage", "muscle", "muscles",
  "nerf", "nerfs", "moelle épinière", "moelle epiniere", "cerveau", "peau",

  // ── Other languages — the core that actually occurs ────────────────────────
  // EN
  "diabetes", "hypertension", "asthma", "migraine", "arthritis", "osteoarthritis",
  "pneumonia", "bronchitis", "influenza", "stroke", "heart failure", "cancer",
  "tumour", "tumor", "anaemia", "anemia", "epilepsy", "depression", "anxiety",
  "obesity", "fracture", "sprain", "painkiller", "antibiotic", "antibiotics",
  "paracetamol", "ibuprofen", "aspirin", "insulin", "statin", "steroid", "vaccine",
  // DE
  "diabetes mellitus", "bluthochdruck", "herzinsuffizienz", "schlaganfall",
  "lungenentzündung", "lungenentzundung", "bronchitis", "grippe", "krebs", "tumor",
  "blutarmut", "epilepsie", "depressionen", "arthrose", "bandscheibenvorfall",
  "schmerzmittel", "antibiotikum", "impfung", "blutdruck", "cholesterin",
  // ES
  "diabetes", "hipertensión", "hipertension", "migraña", "migrana",
  "artrosis", "artritis", "neumonía", "neumonia", "bronquitis", "gripe", "cáncer",
  "cancer", "tumor", "anemia", "epilepsia", "depresión", "depresion", "ansiedad",
  "obesidad", "fractura", "esguince", "analgésico", "analgesico", "antibiótico",
  "antibiotico", "vacuna", "insulina", "colesterol",
  // IT
  "diabete", "ipertensione", "emicrania", "artrosi", "artrite", "polmonite",
  "bronchite", "influenza", "cancro", "tumore", "anemia", "epilessia", "depressione",
  "ansia", "obesità", "obesita", "frattura", "distorsione", "antidolorifico",
  "antibiotico", "vaccino", "insulina", "colesterolo",
  // PT
  "diabetes", "hipertensão", "hipertensao", "enxaqueca", "artrose", "artrite",
  "pneumonia", "bronquite", "gripe", "câncer", "cancro", "tumor", "anemia",
  "epilepsia", "depressão", "depressao", "ansiedade", "obesidade", "fratura",
  "entorse", "analgésico", "analgesico", "antibiótico", "vacina", "insulina",
];
