/**
 * The PUBLIC addresses the app offers to open — a single home (rule 9), because a domain
 * moves: the `.io` addresses all switched to `.dev`, and a URL copied into a component is
 * the one forgotten that day.
 *
 * They live in `help/` with the rest of the vocabulary shown to the user: these are not
 * technical endpoints (those are injected by the host), but destinations NAMED in a
 * sentence.
 */
import { brandUrl } from "@openmasq/branding";

/** The extended help centre — the full documentation, outside the app. */
export const HELP_CENTER_URL = brandUrl("help");
