import { useCallback, useState } from "react";
import type { ChatStore } from "../../../state/store";
import type { ExtractedFile } from "../../../host";
import { useHost } from "../../../host";
import { openTab, useAppDispatch, type Section } from "../../../state/redux";
import { loadReattachFile, type ReattachSource } from "../../../pages/Library";
import type { DeferredFile } from "../../../state/deferredFile";
import type { AskTarget, Competence } from "../../../types";

export type StagedIntents = {
  /** Staged for the composer, consumed once by `ChatView` (see `panes/ChatPane`). */
  pending: {
    /** ⚠️ Carries its TARGET conversation. When the staging CREATES a conversation
     *  (re-attach, first-ever attach), it reaches the screen a commit LATER — a file
     *  staged into "whatever is displayed" landed on the PREVIOUS one and was then wiped
     *  (the reported "opens a conversation but does not attach the document"). Naming the
     *  target makes the hand-off order-independent. This is the HEAD of a queue —
     *  `setAttach(null)` consumes it and reveals the next. */
    attach: { file: ExtractedFile | DeferredFile; convId: string } | null;
    setAttach: (a: { file: ExtractedFile | DeferredFile; convId: string } | null) => void;
    /** ⚠️ UN SEUL emplacement, depuis que les compétences et les workflows n'en font
     *  qu'une : celle qui pilote des connecteurs est une compétence avec `servers`, pas
     *  une autre chose à mettre en scène. Deux emplacements jumeaux, c'était deux façons
     *  de répondre à « qu'est-ce qui part avec ce message ? ». */
    competence: Competence | null;
    setCompetence: (c: Competence | null) => void;
    /** The folder/file the next send is ABOUT (« Demander » in the right rail) —
     *  staged like a compétence: a TAG, never draft text. */
    target: AskTarget | null;
    setTarget: (t: AskTarget | null) => void;
  };
  /** Stage a compétence (the ENTITY — its prompt joins the payload at send) and go chat. */
  stageCompetence: (c: Competence) => void;
  /** Library re-attach: rebuild the file from its ORIGINAL bytes into a fresh chat. */
  reattach: (src: ReattachSource) => Promise<void>;
  /** Stage an already-built attachment into the OPEN conversation (created only when
   *  none exists) and go there — the panel's « Demander »/« Joindre » on a local file.
   *  Successive calls QUEUE: each file joins the same conversation. */
  attachFile: (file: ExtractedFile | DeferredFile) => void;
  /** « Demander » sur une SOURCE de fichiers — un dossier accordé, un dossier ou un
   *  fichier d'un stockage connecté : une conversation neuve portant la cible en TAG
   *  (chip du compositeur, puis tag sur le message envoyé — la mécanique des
   *  compétences). Rien n'est joint — le modèle a les outils du connecteur pour aller
   *  lire, et joindre une arborescence entière serait un envoi que personne n'a
   *  demandé. Un brouillon en prose (« À propos de "patrons" dans Dropbox : ») a déjà
   *  vécu ici : sans dire DOSSIER ni porter de trace visible, le modèle lisait le nom
   *  comme un concept et partait l'expliquer. */
  askAboutTarget: (target: Omit<AskTarget, "prompt">) => void;
};

/**
 * The composer STAGING concerns, peeled off `useShell` (rule 1 — the aggregator sat at
 * the 300-LOC cap; its own doc says each concern is a hook here). A library file rebuilt
 * as an attachment, a compétence, a « Demander » target: each is staged for
 * the composer and consumed once by ChatView (the same handshake for all four).
 */
export function useStagedIntents({ chat, go }: { chat: ChatStore; go: (s: Section) => void }): StagedIntents {
  const dispatch = useAppDispatch();
  const host = useHost();
  // Une FILE, pas un slot : deux « Demander » rapprochés doivent joindre DEUX fichiers.
  // Le slot unique perdait le premier quand le second arrivait avant sa consommation.
  // L'API exposée reste « tête + consommer » (`attach` / `setAttach(null)`), donc le
  // consommateur (ChatPane → ChatView) traite un fichier à la fois, dans l'ordre.
  const [attachQueue, setAttachQueue] = useState<{ file: ExtractedFile | DeferredFile; convId: string }[]>([]);
  const [competence, setCompetence] = useState<Competence | null>(null);
  const [target, setTarget] = useState<AskTarget | null>(null);
  // Using one ALWAYS lands you in the chat — staging a prompt you can't see is a dead end.
  const stageCompetence = useCallback(
    (c: Competence) => {
      setCompetence(c);
      chat.markCompetenceUsed(c.id);
      go("chats");
    },
    [chat, go],
  );
  /* Park one attachment for `convId` and land in the chat. One staging path for the
     panel's « Demander » and the library's re-attach, so both land identically and the
     send redacted them the same way.

     Le fichier peut n'être qu'une PROMESSE (`DeferredFile`) : le chip paraît sur-le-champ,
     le contenu suit. C'est ce que fait déjà le sélecteur natif, et c'est ce qui manquait à
     « Demander » — lecture puis OCR avant que rien ne bouge. */
  const stageAttach = (file: ExtractedFile | DeferredFile, convId: string) => {
    setAttachQueue((q) => [...q, { file, convId }]);
    go("chats");
  };
  /* Le panneau vit À CÔTÉ de la conversation ouverte, donc « Demander » sur un fichier
     AJOUTE à celle-ci — deux gestes successifs joignent deux fichiers au même fil (le
     second « remplaçait » le premier à l'écran quand chaque clic ouvrait sa conversation
     neuve). Une conversation n'est créée que s'il n'y en a aucune — la règle
     d'`askAboutPage`, pour la même raison. */
  const attachFile = (file: ExtractedFile | DeferredFile) => {
    const existing = chat.activeId;
    const convId = existing ?? chat.createConversation();
    if (!existing) dispatch(openTab(convId));
    stageAttach(file, convId);
  };
  const askAboutTarget = (t: Omit<AskTarget, "prompt">) => {
    const convId = chat.createConversation();
    dispatch(openTab(convId));
    // La cible est STAGÉE comme entité (le même bras de mer que les compétences) :
    // ChatView en dérive la chip, et à l'envoi sa ligne de contexte — dossier/fichier,
    // chemin local ou service — monte dans le payload MODÈLE (`send/askTarget.ts`).
    // Le brouillon reste vierge : la question est à l'utilisateur, la cible au tag.
    setTarget(t);
    go("chats");
  };
  /* Le ré-attachement de la Bibliothèque garde sa conversation NEUVE : le geste vient
     d'un écran de FICHIERS, pas d'un panneau posé à côté d'un fil en cours — il n'y a
     pas de « conversation que je regarde » à rejoindre. */
  const reattach = async (src: ReattachSource) => {
    try {
      const file = await loadReattachFile(host, src);
      const convId = chat.createConversation();
      dispatch(openTab(convId));
      // The id, not "the conversation on screen": it is not on screen yet.
      stageAttach(file, convId);
    } catch {
      /* file gone / unreadable → no-op */
    }
  };

  return {
    pending: {
      attach: attachQueue[0] ?? null,
      // `null` = « la tête est consommée » (ChatPane) ; une valeur = un ajout direct.
      setAttach: (a) => setAttachQueue((q) => (a === null ? q.slice(1) : [...q, a])),
      competence,
      setCompetence,
      target,
      setTarget,
    },
    stageCompetence,
    reattach,
    attachFile,
    askAboutTarget,
  };
}
