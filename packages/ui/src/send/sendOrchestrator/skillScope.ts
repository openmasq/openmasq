import { activeSkillScope } from "../../skills/launch";
import type { Conversation } from "../../types";
import type { SendOptions } from "./types";

/**
 * The connectors a compétence NAMES widen the turn's tool offer (guidance in the prompt
 * alone let the router drop them); absent, the last scope used in the history applies.
 */
export function skillLaunchScopeOf(opts: SendOptions, conv: Conversation): string[] | undefined {
  return opts.competence?.servers?.length ? opts.competence.servers : activeSkillScope(conv.messages);
}
