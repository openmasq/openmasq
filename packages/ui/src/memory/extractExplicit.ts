/**
 * Detecting an EXPLICIT « remember this » ask — the multilingual phrase lists + the
 * boundary-safe regexes behind `isExplicitMemoryAsk`, split out of `extract.ts` (which
 * consumes and re-exports them). An explicit ask bypasses the char floor and unlocks the
 * fast path (immediate extraction + backward window + note cards).
 */

/** Explicit memory-worthy phrasings — these bypass the char floor, and an EXPLICIT ask
 *  also unlocks the fast path (immediate extraction + backward window + note cards).
 *  MULTILINGUAL: users prompt in their own language, and an ask that silently retained
 *  nothing reads as a dead feature. One list per language, joined below; both
 *  apostrophes (' ’) and common accentless spellings are accepted where they occur. */
const EXPLICIT_PHRASES: string[] = [
  // French
  "retiens?", "souviens[- ]toi", "note (?:que|bien)", "à l['’]avenir", "dorénavant",
  "désormais", "je préfère", "ma préférence", "n['’]oublie pas",
  // …and the DIRECT phrasings, which were missing: the list only knew
  // « retiens / note que », so that « note les en mémoire », « garde ça en mémoire »
  // and even « mémorise ça » — the most literal way to ask — triggered nothing.
  // The object is optional everywhere: people say « mémorise » as often as
  // « mémorise ça ».
  "m[ée]morise[rz]?", "garde[rz]? (?:[çc]a |cela |ceci )?en m[ée]moire",
  "note[- ](?:le|la|les|[çc]a|cela|ceci)", "enregistre[rz]? (?:[çc]a|cela|ceci)",
  "ajoute[rz]? (?:[çc]a |cela |ceci )?(?:à|en|dans) (?:ta |la )?m[ée]moire",
  "conserve[rz]? (?:[çc]a|cela|ceci)",
  // English
  "remember", "keep in mind", "don['’]t forget", "note that", "from now on",
  "going forward", "i prefer", "my preference",
  "memori[sz]e", "save (?:this|that|it)", "note (?:this|that|it) down",
  "add (?:this|that|it) to (?:your )?memory", "store (?:this|that|it)",
  // Español
  "recuerda", "acu[ée]rdate", "ten en cuenta", "no olvides", "a partir de ahora",
  "de ahora en adelante", "prefiero",
  "memoriza", "guarda (?:esto|eso)", "an[óo]ta(?:lo)?", "gu[áa]rdalo",
  // Deutsch
  "merke? dir", "denke? daran", "vergiss nicht", "ab jetzt", "von nun an", "ich bevorzuge",
  "speicher(?:e|n)?", "notiere?", "behalte? (?:das|es)",
  // Italiano
  "ricorda(?:ti)?", "tieni a mente", "non dimenticare", "d['’]ora in poi", "preferisco",
  "memorizza", "salva (?:questo|ci[òo])", "annota(?:lo)?",
  // Português
  "lembre[- ]se", "lembra que", "tenha em mente", "n[ãa]o esque[çc]a",
  "a partir de agora", "de agora em diante", "prefiro",
  "memorize", "guarde? (?:isso|isto)", "anote?(?: isso)?",
  // Nederlands
  "onthoud", "vergeet niet", "houd in gedachten", "vanaf nu",
  "bewaar (?:dit|dat)", "noteer (?:dit|dat)",
  // Русский
  "запомни", "не забывай", "не забудь", "имей в виду", "отныне", "с этого момента",
  "я предпочитаю", "сохрани", "запиши",
  // العربية
  "تذكر", "لا تنس", "ضع في اعتبارك", "من الآن فصاعدا", "احفظ", "سجل",
];

/** CJK phrasings — matched WITHOUT word boundaries: those scripts have no spaces, so a
 *  boundary assertion around a han/kana/hangul phrase would simply never hold. */
const EXPLICIT_CJK: string[] = [
  // 中文 (simplified + traditional)
  "记住", "記住", "别忘了", "別忘了", "从现在开始", "從現在開始", "我更喜欢", "我更喜歡",
  // 日本語
  "覚えて", "覚えておいて", "忘れないで",
  // 한국어
  "기억해", "잊지 마", "명심해", "앞으로는",
];

// `\b` is ASCII-only in JS (it can't bound Cyrillic/Arabic at all), so the boundary is
// spelled with Unicode classes instead: start-of-string or a non-alphanumeric before,
// and no letter/digit running on after. No lookbehind (older WebKit compatibility).
const EXPLICIT_RE = new RegExp(
  `(?:^|[^\\p{L}\\p{N}])(?:${EXPLICIT_PHRASES.join("|")})(?![\\p{L}\\p{N}])`,
  "iu",
);
const EXPLICIT_CJK_RE = new RegExp(`(?:${EXPLICIT_CJK.join("|")})`, "u");

/** Did this text EXPLICITLY ask to remember? (The fast path's trigger.) */
export function isExplicitMemoryAsk(text: string): boolean {
  return EXPLICIT_RE.test(text) || EXPLICIT_CJK_RE.test(text);
}

/** How many messages BELOW the watermark an explicit ask may re-read: « retiens ça »
 *  points at something said BEFORE, possibly in an already-extracted slice — without
 *  the lookback the referent is gone and the ask silently retains nothing. Re-reading
 *  is safe: the merge dedups, and the watermark only ever advances. */
export const EXPLICIT_LOOKBACK = 6;
