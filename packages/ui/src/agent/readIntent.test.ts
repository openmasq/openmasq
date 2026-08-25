import { describe, it, expect } from "vitest";
import { asksConsultNotAct } from "./readIntent";

describe("asksConsultNotAct — « consulter » n'est pas « agir »", () => {
  it("reconnaît la demande du journal du 27/07/2026 (agenda créé sur une demande de lecture)", () => {
    expect(
      asksConsultNotAct(
        "Prépare ma journée du 27 juillet.\n\n" +
          "1. Mes rendez-vous dans l'ordre, avec les participants et le lieu.\n" +
          "2. Pour chacun : le sujet, et ce que je dois avoir préparé.\n" +
          "3. Ce qui se chevauche ou ne me laisse pas le temps de me déplacer.\n\n" +
          "(Utilise le connecteur : Google Agenda.)",
      ),
    ).toBe(true);
  });

  it.each([
    "Qu'est-ce que j'ai à mon agenda cette semaine ?",
    "Liste les erreurs remontées sur Zorvia depuis lundi.",
    "Résume mes derniers e-mails : qu'est-ce que j'ai raté cette semaine ?",
    "Fais le point sur mes paiements depuis mars.",
    "Quelles pull requests sont ouvertes sur mes dépôts GitHub ?",
    "Montre-moi mes tickets Linear en cours.",
    "What do I have on my calendar tomorrow?",
  ])("consultation : %s", (t) => {
    expect(asksConsultNotAct(t)).toBe(true);
  });

  it.each([
    "Crée dans mon agenda un événement « Revue produit » jeudi de 14h à 14h30.",
    "Envoie un e-mail à contact@exemple.fr avec pour objet « Point hebdo ».",
    "Ajoute un rendez-vous demain à 9h avec Camille.",
    "Déplace ma réunion de 14h à 16h.",
    "Supprime l'événement de vendredi.",
    "Rédige une note de cadrage et enregistre-la dans un Google Doc.",
    "Récupère les comptes récents dans Supabase et dépose le détail dans une Google Sheet.",
    "Regarde mes prospects dans Airtable, choisis celui à relancer, et envoie-lui un créneau.",
    "Identifie l'erreur la plus fréquente sur Sentry et crée un ticket Linear.",
    "Reprends mes notes Notion, fais-en une synthèse dans un Doc, puis poste sur Slack.",
    "Schedule a 30-minute call with Alex on Thursday.",
    // Les deux sur-blocages relevés par les scénarios d'éval : une locution (« mets à
    // jour ») et deux verbes de création qui n'en ont pas l'air (« ouvre une issue »,
    // « préviens le canal »). Un verbe d'action manquant SUR-BLOQUE — c'est le seul
    // sens dans lequel cette liste peut se tromper à l'usage.
    "Vérifie si le paiement est passé, puis mets à jour l'item « Atelier Torbel » en « Payé ».",
    "Regarde s'il y a une erreur fréquente dans Sentry ; si oui, ouvre une issue GitHub, puis préviens le canal Incidents.",
  ])("action demandée — la garde ne bloque pas : %s", (t) => {
    expect(asksConsultNotAct(t)).toBe(false);
  });

  // ⚠️ L'ORDRE des règles : ces phrases CONTIENNENT des verbes d'action et seraient
  // lues comme des ordres d'agir sans le passage préalable sur l'interdiction. C'est le
  // retournement déjà corrigé pour « n'envoie rien » dans `sendIntent.ts` — et nos
  // propres modèles de workflow écrivent exactement ces phrases.
  it.each([
    "Cherche dans mon espace Notion ce qui concerne la facturation.\n\nNe modifie rien : lecture seule.",
    "Fais le point sur mes paiements depuis mars.\n\nConsultation seule : ne crée, ne rembourse et n'annule rien.",
    "Fais le point sur Stripe.\n\nLecture seule : ne crée, ne modifie et n'envoie rien.",
    "Passe en revue mes e-mails reçus depuis hier.\n\nN'envoie rien : montre-moi d'abord.",
    "Croise la liste des utilisateurs Neon avec Supabase — n'écris RIEN en base.",
    "Summarize the open tickets. Do not create or modify anything.",
  ])("interdiction explicite, malgré les verbes d'action : %s", (t) => {
    expect(asksConsultNotAct(t)).toBe(true);
  });

  // ⚠️ RESTRICTION DE PÉRIMÈTRE ≠ RENONCEMENT. Mesuré le 15/08/2026 sur l'écriture Notion :
  // « Crée une page… Ne modifie aucune page existante. » était refusé — la prudence de
  // l'utilisateur retournée contre lui, avec un message l'invitant à « consulter ».
  it.each([
    "Crée une page Notion intitulée « Essai ». Ne modifie aucune page existante.",
    "Crée une page Notion intitulée « Essai ». Ne supprime rien.",
    "Crée une page Notion intitulée « Essai », sans rien modifier d'autre.",
    "Sauvegarde cette synthèse dans Notion. Ne modifie aucune page existante.",
    "Ajoute une ligne au tableau Airtable — n'écris rien ailleurs.",
  ])("l'interdiction BORNE la demande, elle ne l'annule pas : %s", (t) => {
    expect(asksConsultNotAct(t)).toBe(false);
  });

  it("…mais l'interdiction SEULE reste une interdiction", () => {
    expect(asksConsultNotAct("Ne modifie aucune page existante.")).toBe(true);
    expect(asksConsultNotAct("Ne supprime rien.")).toBe(true);
  });

  it("un marqueur GLOBAL gouverne tout le message, même avec un verbe d'action", () => {
    // La tournure qu'écrivent nos propres modèles de workflow : elle doit rester absolue.
    expect(asksConsultNotAct("Lecture seule : crée un récapitulatif dans la conversation.")).toBe(true);
    expect(asksConsultNotAct("Consultation seule : ajoute un commentaire si besoin.")).toBe(true);
    expect(asksConsultNotAct("Read-only: create a summary here.")).toBe(true);
  });

  it("l'inconnu garde le comportement actuel (pas de blocage ajouté)", () => {
    expect(asksConsultNotAct("")).toBe(false);
    expect(asksConsultNotAct(undefined)).toBe(false);
    expect(asksConsultNotAct("bonjour")).toBe(false);
    expect(asksConsultNotAct("go")).toBe(false);
  });

  it("les frontières sont Unicode : un verbe accenté en tête de phrase compte", () => {
    // `\b` est ASCII : sans lookaround Unicode, « Écris » n'ouvre aucune frontière.
    expect(asksConsultNotAct("Écris un compte rendu de la réunion.")).toBe(false);
  });

  it("« me déplacer » décrit un trajet, pas un événement à bouger", () => {
    // Le mot exact qui, dans le journal, faisait lire toute la demande comme un ordre.
    expect(asksConsultNotAct("Montre-moi ce qui ne me laisse pas le temps de me déplacer.")).toBe(true);
    // Mais l'emploi transitif reste une action.
    expect(asksConsultNotAct("Déplace ma réunion de 14h à 16h.")).toBe(false);
  });

  it("ne se déclenche pas sur un mot plus long qui contient un verbe", () => {
    // « listing » contient « list » ; « créature » contient « créa ».
    expect(asksConsultNotAct("Parle-moi du listing des créatures marines.")).toBe(false);
  });
});
