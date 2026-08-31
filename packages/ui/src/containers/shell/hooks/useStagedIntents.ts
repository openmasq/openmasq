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
    /** ⚠️ A SINGLE slot, since compétences and workflows now make just one:
     *  the one that drives connectors is a compétence with `servers`, not
     *  another thing to stage. Two twin slots was two ways
     *  of answering "what goes out with this message?". */
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
  /** « Demander » on a file SOURCE — a granted folder, a folder, or a
   *  file of a connected storage: a new conversation carrying the target as a TAG
   *  (composer chip, then a tag on the sent message — the compétences
   *  mechanism). Nothing is attached — the model has the connector's tools to go
   *  read it, and attaching a whole tree would be a send nobody
   *  asked for. Draft prose (« À propos de "patrons" dans Dropbox : ») has already
   *  lived here: with no DOSSIER wording and no visible trace, the model read the name
   *  as a concept and went off to explain it. */
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
  // A QUEUE, not a slot: two close-together « Demander » must attach TWO files.
  // The single slot used to lose the first one when the second arrived before it was consumed.
  // The exposed API stays "head + consume" (`attach` / `setAttach(null)`), so the
  // consumer (ChatPane → ChatView) handles one file at a time, in order.
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

     The file may be only a PROMISE (`DeferredFile`): the chip appears right away,
     the content follows. That's what the native picker already does, and it's what was
     missing from « Demander » — reading then OCR before anything moved. */
  const stageAttach = (file: ExtractedFile | DeferredFile, convId: string) => {
    setAttachQueue((q) => [...q, { file, convId }]);
    go("chats");
  };
  /* The panel lives BESIDE the open conversation, so « Demander » on a file
     ADDS to it — two successive gestures attach two files to the same thread (the
     second used to "replace" the first on screen when each click opened its own
     new conversation). A conversation is created only if there is none — the rule
     from `askAboutPage`, for the same reason. */
  const attachFile = (file: ExtractedFile | DeferredFile) => {
    const existing = chat.activeId;
    const convId = existing ?? chat.createConversation();
    if (!existing) dispatch(openTab(convId));
    stageAttach(file, convId);
  };
  const askAboutTarget = (t: Omit<AskTarget, "prompt">) => {
    const convId = chat.createConversation();
    dispatch(openTab(convId));
    // The target is STAGED as an entity (the same channel as the compétences):
    // ChatView derives the chip from it, and on send its context line — folder/file,
    // local path or service — goes up into the MODEL payload (`send/askTarget.ts`).
    // The draft stays blank: the question is for the user, the target for the tag.
    setTarget(t);
    go("chats");
  };
  /* The Bibliothèque re-attach keeps its NEW conversation: the gesture comes
     from a FILES screen, not from a panel sitting beside an ongoing thread — there is
     no "conversation I'm looking at" to join. */
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
      // `null` = "the head is consumed" (ChatPane); a value = a direct addition.
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
