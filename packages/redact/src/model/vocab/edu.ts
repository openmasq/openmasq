/**
 * Vocabulary volume: **education and research** — schooling, higher education, degrees,
 * assessment, student life and academic work — FR/EN/DE/ES/IT/PT. Discipline: `./index`.
 *
 * Why it exists: this was the WORST-covered family measured, 2/11. A school report, a
 * transcript, a CV or a cover letter is built almost entirely out of these words, so
 * "baccalauréat", "licence", "master" and "relevé de notes" were each faked into an
 * invented company — the one document type where the useful content IS the vocabulary.
 *
 * ⚠️ Deliberately ABSENT because they are surnames spelled identically: `doyen`, `dean`,
 * `bachelier`, `meister`, and bare `maestro` / `maître` (kept: `maestra`, `maîtresse`,
 * which are not surname forms). A degree that is also a given name (`bachelor` is not,
 * but `master` is a rank and a surname in EN) is listed only in the spellings a document
 * actually uses — `master's degree`, `mastère` — never as a bare English `master`.
 */
export const EDU_TERMS: string[] = [
  // ── Institutions & levels — French ─────────────────────────────────────────
  "école", "ecole", "écoles", "ecoles", "école primaire", "ecole primaire",
  "école maternelle", "ecole maternelle", "élémentaire", "elementaire", "collège",
  "college", "lycée", "lycee", "lycée professionnel", "lycee professionnel",
  "université", "universite", "faculté", "faculte", "campus", "établissement",
  "etablissement", "grande école", "grande ecole", "classe préparatoire",
  "classe preparatoire", "prépa", "prepa", "institut", "conservatoire",
  "internat", "externat", "cantine", "restauration scolaire", "périscolaire",
  "periscolaire", "rentrée", "rentree", "année scolaire", "annee scolaire",
  "année universitaire", "annee universitaire", "cycle", "niveau", "classe",
  "section", "filière", "filiere", "spécialité", "specialite",
  "spécialités", "specialites", "option",
  "tronc commun", "enseignement supérieur", "enseignement superieur",

  // ── Degrees & certification — French ───────────────────────────────────────
  "diplôme", "diplome", "baccalauréat", "baccalaureat", "bac", "brevet",
  "licence", "licence professionnelle", "mastère", "mastere", "master 1",
  "master 2", "doctorat", "thèse", "these", "mémoire", "memoire", "soutenance",
  "habilitation", "certification", "attestation de réussite",
  "attestation de reussite", "relevé de notes", "releve de notes",
  "livret scolaire", "bulletin scolaire", "carnet de correspondance",
  "crédits", "credits", "ects", "ufr", "unité d'enseignement",
  "unite d'enseignement",
  "module", "matière", "matiere", "matières", "matieres", "discipline",
  "programme", "référentiel", "referentiel", "équivalence", "equivalence",
  "validation des acquis", "formation", "formation continue", "formation initiale",
  "alternance", "apprentissage", "stage", "stage de fin d'études",
  "stage de fin d'etudes", "césure", "cesure", "mobilité", "mobilite",

  // ── Assessment & school life — French ──────────────────────────────────────
  "cours", "cours magistral", "travaux dirigés", "travaux diriges",
  "travaux pratiques", "amphithéâtre", "amphitheatre", "amphi", "emploi du temps",
  "examen", "examens", "partiel", "partiels", "contrôle continu",
  "controle continu", "devoir", "devoirs", "devoir surveillé", "devoir surveille",
  "interrogation", "épreuve", "epreuve", "oral", "écrit", "ecrit", "session",
  "rattrapage", "note", "notes", "moyenne", "moyenne générale",
  "moyenne generale", "barème", "bareme", "appréciation", "appreciation",
  "mention", "mention bien", "mention très bien", "mention tres bien", "admis",
  "admise", "ajourné", "ajourne", "recalé", "recale", "redoublement",
  "passage", "conseil de classe", "absence", "absences", "retard", "retards",
  "assiduité", "assiduite", "discipline scolaire", "exclusion",

  // ── People, enrolment & research — French ──────────────────────────────────
  "élève", "eleve", "élèves", "eleves", "étudiant", "etudiant", "étudiante",
  "etudiante", "collégien", "collegien", "lycéen", "lyceen", "doctorant",
  "doctorante", "enseignant", "enseignante", "professeur", "professeure",
  "instituteur", "institutrice", "maîtresse", "maitresse", "surveillant",
  "proviseur", "principal", "recteur", "rectorat", "académie", "academie",
  "inspection", "inspecteur d'académie", "conseiller d'orientation",
  "psychologue scolaire", "délégué de classe", "delegue de classe",
  "association de parents", "inscription", "réinscription", "reinscription",
  "scolarité", "scolarite", "frais de scolarité", "frais de scolarite",
  "bourse", "boursier", "boursière", "boursiere", "logement étudiant",
  "logement etudiant", "chercheur", "chercheuse", "enseignant-chercheur",
  "laboratoire de recherche", "unité de recherche", "unite de recherche",
  "encadrant", "directeur de thèse", "directeur de these", "jury", "rapporteur",
  "publication scientifique", "article scientifique", "colloque", "revue",
  "bibliographie", "citation", "plagiat", "peer review", "relecture",

  // ── English ────────────────────────────────────────────────────────────────
  "school", "primary school", "secondary school", "high school", "middle school",
  "college", "university", "faculty", "department", "campus", "term", "semester",
  "academic year", "undergraduate", "graduate", "postgraduate", "freshman",
  "sophomore", "bachelor", "bachelor's degree", "master's degree", "doctorate",
  "phd", "thesis", "dissertation", "degree", "transcript", "report card",
  "credits", "coursework", "assignment", "homework", "syllabus", "curriculum",
  "module", "elective", "major", "minor", "lecture", "tutorial", "lab session",
  "exam", "midterm", "final exam", "resit", "grade", "grades", "grading",
  "marks", "average", "honours", "honors", "with distinction", "pass",
  "fail", "retake", "attendance", "enrolment", "enrollment", "admission",
  "application", "tuition", "tuition fees", "scholarship", "student",
  "pupil", "teacher", "lecturer", "professor", "headteacher", "principal",
  "supervisor", "advisor", "researcher", "research group", "peer review",
  "internship", "apprenticeship", "placement", "alumni", "alumnus",

  // ── German ─────────────────────────────────────────────────────────────────
  "schule", "grundschule", "hauptschule", "realschule", "gesamtschule",
  "gymnasium", "berufsschule", "hochschule", "fachhochschule", "universität",
  "universitat", "fakultät", "fakultat", "fachbereich", "studiengang",
  "studium", "semester", "vorlesung", "seminar", "übung", "ubung", "praktikum",
  "prüfung", "prufung", "klausur", "abitur", "abschluss", "abschlussarbeit",
  "bachelorarbeit", "masterarbeit", "doktorarbeit", "promotion", "diplom",
  "zeugnis", "note", "noten", "notendurchschnitt", "leistungsnachweis",
  "immatrikulation", "einschreibung", "versetzung", "unterricht", "studiengebühren", "studiengebuhren",
  "stipendium", "schüler", "schuler", "schülerin", "student", "studentin",
  "studierende", "lehrer", "lehrerin", "dozent", "dozentin", "professor",
  "professorin", "betreuer", "betreuerin", "ausbildung", "lehre", "fortbildung",
  "weiterbildung", "forschung", "lehrstuhl", "fachrichtung",

  // ── Spanish ────────────────────────────────────────────────────────────────
  "escuela", "colegio", "instituto", "universidad", "facultad", "departamento",
  "curso", "asignatura", "materia", "semestre", "cuatrimestre", "créditos",
  "creditos", "grado", "licenciatura", "máster", "master universitario",
  "maestría", "maestria", "doctorado", "tesis", "trabajo fin de grado",
  "título", "titulo", "expediente académico", "expediente academico",
  "matrícula", "matricula", "matriculación", "matriculacion", "examen",
  "convocatoria", "prueba", "nota", "notas", "calificación", "calificacion",
  // « media » alone is left out (ambiguous brand: « Media » as an ORG would never
  // be redacted again — `orgAffixes.test.ts`). The compound forms, however, are safe.
  "aprobado", "suspenso", "notable", "sobresaliente", "beca",
  "nota media", "educación media", "educacion media", "enseñanza media",
  "ensenanza media",
  "becario", "becaria", "tasas académicas", "tasas academicas", "alumno",
  "alumna", "alumnado", "estudiante", "profesor", "profesora", "maestra",
  "catedrático", "catedratico", "tutor", "tutora", "prácticas", "practicas", "prácticas externas",
  "practicas externas",
  "formación profesional", "formacion profesional", "bachillerato",
  "selectividad", "investigación", "investigacion", "investigador",

  // ── Italian ────────────────────────────────────────────────────────────────
  "scuola", "scuola elementare", "scuola media", "liceo", "istituto tecnico",
  "università", "universita", "facoltà", "facolta", "dipartimento",
  "corso di laurea", "laurea", "laurea magistrale", "dottorato", "tesi",
  "diploma di maturità", "diploma di maturita", "maturità", "maturita",
  "pagella", "libretto universitario", "iscrizione", "matricola", "materia",
  "semestre", "crediti formativi", "lezione", "esercitazione", "esame",
  "appello", "prova scritta", "prova orale", "voto", "voti", "media dei voti",
  "promosso", "bocciato", "scrutinio", "borsa di studio", "tasse universitarie", "studente",
  "studentessa", "alunno", "alunna", "insegnante", "docente", "professore",
  "professoressa", "relatore", "tirocinio", "formazione", "ricerca",
  "ricercatore", "ateneo",

  // ── Portuguese ─────────────────────────────────────────────────────────────
  "escola", "colégio", "colegio", "ensino básico", "ensino basico",
  "ensino fundamental", "ensino médio", "ensino medio", "ensino superior",
  "faculdade", "universidade", "departamento", "licenciatura", "mestrado",
  "doutoramento", "doutorado", "tese", "dissertação", "dissertacao", "diploma",
  "histórico escolar", "historico escolar", "boletim", "matrícula", "matricula",
  "inscrição", "inscricao", "disciplina", "semestre", "créditos", "creditos",
  "aula", "exame", "prova", "avaliação", "avaliacao", "nota", "notas", "média",
  // same here: the unaccented fallback « media » is an ambiguous brand, its compounds are not.
  "nota média", "nota media", "ensino médio", "ensino medio",
  "aprovado", "reprovado", "bolsa de estudo", "bolseiro", "bolsista",
  "propinas", "mensalidade", "aluno", "aluna", "estudante", "professor",
  "professora", "orientador", "orientadora", "estágio", "estagio", "formação",
  "formacao", "vestibular", "investigação", "investigacao", "pesquisa",
];
