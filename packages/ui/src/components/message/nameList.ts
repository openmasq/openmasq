import type { Messages } from "@openmasq/i18n";

/** File names as a sentence reads them: « a, b et c », past `max` « a, b, c et 2 autres ».
 *  The words come from the locale (`Intl.ListFormat` + the catalogue's « autres »). */
export function nameList(names: readonly string[], t: Messages, max = 3): string {
  const shown = names.length > max ? [...names.slice(0, max), t.conversation.docs.others(names.length - max)] : [...names];
  return new Intl.ListFormat(t.common.intlTag, { style: "long", type: "conjunction" }).format(shown);
}
