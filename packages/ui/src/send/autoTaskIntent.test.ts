import { describe, it, expect } from "vitest";
import { hardTaskAsk, isMultiStepAsk, lightTaskAsk } from "./autoTaskIntent";

const hard = (t: string) => expect(hardTaskAsk(t), `LOURD attendu : « ${t} »`).toBe(true);
const notHard = (t: string) => expect(hardTaskAsk(t), `PAS lourd attendu : « ${t} »`).toBe(false);
const light = (t: string) => expect(lightTaskAsk(t), `LÉGER attendu : « ${t} »`).toBe(true);
const notLight = (t: string) => expect(lightTaskAsk(t), `PAS léger attendu : « ${t} »`).toBe(false);

describe("hardTaskAsk — verbes experts, par langue", () => {
  it("français (impératif, infinitif, 2ᵉ pl., accents dégradés)", () => {
    hard("Prouve que cette fonction termine.");
    hard("Démontrer l'inégalité par récurrence");
    hard("Déboguez ce script, il plante au démarrage");
    hard("peux-tu optimiser cette requête SQL ?");
    hard("Refactorise le module de paiement");
    hard("Audite la configuration nginx");
    hard("Conçois une architecture pour la synchro");
    hard("Modélise le schéma de données");
    hard("Implémente la pagination côté serveur");
    hard("Négocie-moi une meilleure clause de sortie");
    hard("Élabore une stratégie de lancement");
    hard("Résous ce système d'équations");
    hard("resous ce probleme"); // sans accents : le clavier mobile
  });
  it("anglais (flexions -ing/-ed/-s comprises)", () => {
    hard("Prove that the algorithm halts");
    hard("Help me debugging this crash");
    hard("I've been troubleshooting this for hours");
    hard("optimize the query plan");
    hard("refactoring the auth module");
    hard("audit our S3 permissions");
    hard("implement rate limiting");
    hard("negotiating the contract terms");
    hard("devise a rollout plan");
    hard("solve this recurrence");
  });
  it("espagnol", () => {
    hard("Demuestra que la serie converge");
    hard("Depura este script de Python");
    hard("Optimizar la consulta");
    hard("Refactoriza el módulo de pagos");
    hard("Audita los permisos");
    hard("Implementa la paginación");
    hard("Negocia mejores condiciones");
    hard("Resuelve esta ecuación");
    hard("Elabora una estrategia");
  });
  it("allemand", () => {
    hard("Beweise, dass die Folge konvergiert");
    hard("Debugge dieses Skript");
    hard("Optimiere die Abfrage");
    hard("Refaktoriere das Modul");
    hard("Implementiere die Paginierung");
    hard("Verhandle bessere Konditionen");
  });
  it("italien", () => {
    hard("Dimostra che la serie converge");
    hard("Ottimizza questa query");
    hard("Implementate la paginazione");
    hard("Negozia condizioni migliori");
    hard("Risolvi questa equazione");
  });
  it("portugais", () => {
    hard("Demonstra que a série converge");
    hard("Depura este script");
    hard("Otimiza a consulta");
    hard("Refatora o módulo de pagamentos");
    hard("Resolve esta equação");
  });
});

describe("hardTaskAsk — vocabulaire de débogage et locutions", () => {
  it("un nom de la famille debug suffit, sans verbe", () => {
    hard("pourquoi ce segfault au démarrage ?");
    hard("il y a un bug dans le calcul de TVA");
    hard("voici la stack trace complète");
    hard("on a un deadlock en prod");
    hard("je soupçonne une memory leak");
    hard("une fuite mémoire dans le worker");
    hard("race condition entre les deux écritures");
  });
  it("« en profondeur » / root cause, dans les six langues", () => {
    hard("analyse ce contrat en profondeur");
    hard("do an in-depth review of this policy");
    hard("analiza el informe en profundidad");
    hard("analizza il testo in profondità");
    hard("analisa o relatório em profundidade");
    hard("find the root cause of the outage");
    hard("trouve la cause racine de la panne");
  });
});

describe("isMultiStepAsk — consignes en plusieurs étapes", () => {
  it("une liste numérotée d'au moins 2 items", () => {
    expect(isMultiStepAsk("Fais ceci :\n1. relis le contrat\n2. liste les clauses à risque")).toBe(true);
  });
  it("≥ 3 connecteurs de séquence DISTINCTS", () => {
    hard("D'abord lis le dossier, puis compare les deux offres, ensuite rédige la synthèse");
    expect(isMultiStepAsk("First read the file, then extract the totals, finally build a summary")).toBe(true);
  });
  it("un connecteur isolé ne coûte pas des crédits", () => {
    // « d'abord » d'itinéraire, pas d'étapes de travail.
    notHard("je passe d'abord au bureau, tu peux me rappeler l'adresse ?");
    notHard("et puis voilà, qu'en penses-tu ?");
  });
  it("une tête LÉGÈRE désamorce : les numéros sont le contenu, pas des étapes", () => {
    expect(isMultiStepAsk("Traduis cette liste :\n1. le lundi\n2. le mardi\n3. le mercredi")).toBe(false);
  });
});

describe("lightTaskAsk — transformations de surface, par langue", () => {
  it("français / anglais", () => {
    light("Traduis ce paragraphe en anglais");
    light("Résume ce texte en trois phrases");
    light("Reformule ce mail plus poliment");
    light("Raccourcis ce paragraphe");
    light("tl;dr of this thread please");
    light("translate this into German");
    light("summarize the following notes");
    light("can you rephrase this sentence?");
    light("proofread my paragraph");
  });
  it("espagnol / allemand / italien / portugais", () => {
    light("Resume este artículo en dos frases"); // « resume » gardé par le déterminant
    light("Traducir al inglés, por favor");
    light("Parafrasea este párrafo");
    light("Übersetze diesen Absatz ins Englische");
    light("Fasse diesen Artikel bitte kurz zusammen"); // particule séparée
    light("Schreib eine Zusammenfassung davon");
    light("Riassumi questo testo");
    light("Traduci in francese");
    light("Traduza este parágrafo");
    light("Encurta este texto");
  });
  it("relecture orthographique : verbe + objet d'orthographe, ENSEMBLE", () => {
    light("corrige les fautes d'orthographe de ce mail");
    light("fix the spelling in this paragraph");
    light("Korrigiere die Rechtschreibung");
    light("corrige la ortografía de este texto");
  });
});

describe("les pièges — l'asymétrie est la règle", () => {
  it("« corrige » seul n'est PAS léger (un bug se corrige aussi), et bug est LOURD", () => {
    notLight("corrige ce bug de calcul");
    hard("corrige ce bug de calcul");
    // « formule DE CALCUL » et pas « formule » nue : le garde-fou du lexique de l'argent
    // (help/money.test.ts) réserve « formule » au sens monétaire retiré, et n'exempte que
    // les tournures non ambiguës. Ni « calcul » ni « taux » n'est un déclencheur du lexique
    // d'intention, donc ce que ce cas teste — « corrige » seul n'est pas léger — est intact.
    notLight("corrige la formule de calcul du taux");
  });
  it("le LOURD gagne toujours sur le léger", () => {
    notLight("traduis ce code puis optimise-le");
    notLight("summarize the stack trace and find the root cause");
  });
  it("« resume » anglais (le CV, reprendre) n'est pas l'espagnol « resumir »", () => {
    notLight("update my resume with this job");
    notLight("resume the meeting where we left off");
  });
  it("les ambigus sont SORTIS de la liste lourde — délibérément", () => {
    notHard("développe un peu ce point"); // FR développer = étoffer
    notHard("design a birthday card"); // design ≠ architecture
    notHard("löse mein Abo bitte"); // DE lösen ≠ résoudre ici
    notHard("j'aimerais améliorer mon anglais"); // « improve » ⊄ « prove »
  });
  it("rien de reconnu ⇒ ni lourd ni léger (les signaux structurels décident)", () => {
    notHard("qu'est-ce qu'on mange ce soir ?");
    notLight("qu'est-ce qu'on mange ce soir ?");
    expect(hardTaskAsk("")).toBe(false);
    expect(lightTaskAsk(undefined)).toBe(false);
  });
});
