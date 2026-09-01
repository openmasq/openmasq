import { demoPlatform } from "./demo.js";
import { gmailPlatform } from "./gmail.js";
import { slackPlatform } from "./slack.js";
import { githubPlatform } from "./github.js";
import { isAvailable, type Platform } from "./types.js";

export type { Platform, ToolCtx, OAuthUpstream } from "./types.js";
export { isAvailable } from "./types.js";

const ALL: Platform[] = [demoPlatform, gmailPlatform, slackPlatform, githubPlatform];

const BY_ID = new Map(ALL.map((p) => [p.id, p]));

export function getPlatform(id: string): Platform | undefined {
  return BY_ID.get(id);
}

/** Platforms that are usable right now (demo + any with configured creds). */
export function availablePlatforms(): Platform[] {
  return ALL.filter(isAvailable);
}
