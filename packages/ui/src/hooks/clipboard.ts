/**
 * Copy text to the clipboard, with a fallback for non-secure contexts: the
 * Electron renderer's custom protocol isn't always a "secure context", so
 * `navigator.clipboard` can be undefined — then we fall back to a hidden
 * textarea + execCommand, which works regardless.
 */
export async function copyText(text: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    /* fall through to the execCommand path */
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.top = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
  } catch {
    /* nothing else to try */
  }
  document.body.removeChild(ta);
}
