import type { ChatMessage, LlmAttachment } from "@openmasq/llm";
import { NUMBER_TOKEN_INSTRUCTION } from "@openmasq/redact";
import { datePreamble, DOCUMENT_GUIDANCE, SKILL_GUIDANCE, LANGUAGE_GUIDANCE, PRODUCT_GROUNDING } from "../prompt/systemPrompt";
import { generatedFilesNote, pythonScriptNote } from "./generatedFiles";
import type { Message } from "../types";

// The wire/prompt ASSEMBLY of a send, pulled out of `store.ts` `sendMessage`. Pure:
// the actual redaction lives entirely in the injected `toWire`, so this module only
// STRUCTURES the messages and is unit-testable with a fake toWire (e.g. identity).

/** The redaction pass applied to each wire string: replay the conversation vault (the
 *  fakes already chosen for those values). Injected so this module stays pure. */
export type ToWire = (s: string) => { text: string };

/** The leading system message content: the date anchor + document guidance + the user's
 *  (redacted) custom system prompt + the number-token instruction when numbers are
 *  tokenised. Blank-line joined; empty parts dropped.
 *
 *  ⚠️ `skills` (défaut : vrai) retire `SKILL_GUIDANCE` quand l'usage des Compétences est
 *  fermé (`state/featureAccess.ts`). Ce n'est pas cosmétique : c'est CETTE consigne qui
 *  demande au modèle d'émettre un bloc ```competence. La laisser passer laisserait le
 *  modèle proposer des compétences que `SkillCard` affiche avec un bouton d'adoption
 *  menant à une fonctionnalité retirée — la porte fermée par l'avant, rouverte par le
 *  modèle. */
export function buildSystemContent(
  toWire: ToWire,
  systemPrompt: string | undefined,
  numberMode: boolean,
  opts?: { skills?: boolean },
): string {
  return [
    datePreamble(),
    PRODUCT_GROUNDING,
    LANGUAGE_GUIDANCE,
    DOCUMENT_GUIDANCE,
    opts?.skills === false ? "" : SKILL_GUIDANCE,
    systemPrompt ? toWire(systemPrompt).text : "",
    numberMode ? NUMBER_TOKEN_INSTRUCTION : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Assemble the redacted wire history from the stored (original) conversation: the leading
 *  system message, every past turn re-redacted deterministically through the vault (a
 *  document rides in `modelContent`; an assistant-generated non-image FILE is surfaced by
 *  name via `generatedFilesNote` so a follow-up turn REUSES it instead of regenerating it),
 *  then the final user turn (plus any redacted document-page images). Redaction is entirely
 *  in `toWire`; this only structures the payload. */
export function buildWireHistory(
  messages: Message[],
  userWire: { text: string },
  systemContent: string,
  imageAttachments: LlmAttachment[] | undefined,
  toWire: ToWire,
): ChatMessage[] {
  // The working script rides ONLY its LATEST occurrence — replaying every version
  // would pay its token cost N times for N analyses in the conversation.
  const lastScriptIdx = messages.reduce(
    (acc, m, i) => (m.role === "assistant" && m.pythonScript ? i : acc),
    -1,
  );
  return [
    ...(systemContent ? [{ role: "system" as const, content: systemContent }] : []),
    ...messages.map((m, i) => {
      let content = toWire(m.modelContent ?? m.content).text;
      if (m.role === "assistant" && m.attachments?.length) {
        const files = m.attachments.filter((a) => a.kind !== "image");
        content += generatedFilesNote(files.map((a) => toWire(a.name).text));
      }
      if (i === lastScriptIdx && m.pythonScript) content += pythonScriptNote(m.pythonScript);
      return { role: m.role, content };
    }),
    {
      role: "user" as const,
      content: userWire.text,
      ...(imageAttachments?.length ? { attachments: imageAttachments } : {}),
    },
  ];
}
