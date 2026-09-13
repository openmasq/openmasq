import { DESKTOP_EVENTS } from "./desktop";

/**
 * The surfaces the relay ADMITS, each with its vocabulary — an allow-list, never a
 * denylist: a `source` absent here is refused, and so is an event a source does not
 * declare. Adding a surface = adding its vocabulary file and one line here; a surface
 * that lives outside this repository (the extension, the sites) declares its list here
 * all the same, because this is the list the relay reads. The CLI proxy is NOT one: it
 * sends nothing, by decision — a tool whose argument is that nothing leaves the machine.
 */
export const VOCABULARY = {
  desktop: DESKTOP_EVENTS,
} as const satisfies Record<string, Record<string, readonly string[]>>;

export type Source = keyof typeof VOCABULARY;

export const SOURCES = Object.keys(VOCABULARY) as readonly Source[];

export { DESKTOP_EVENTS };
