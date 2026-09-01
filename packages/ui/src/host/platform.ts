/**
 * Encrypted-at-rest provider API keys, owned by the main process. The renderer
 * never reads a key back — it only sets/clears them and learns which ids are
 * configured. Ids are `ProviderId`s plus the special `"redactModel"`. The key is
 * injected into the provider call in main, so it never rides in the renderer or
 * the persisted settings.
 */
export interface KeysHost {
  /** Re-scope the encrypted key store to the signed-in account (sign-in / switch;
   *  `null` = signed out) — so account B can never use account A's keys. Called in the
   *  store's userId effect ALONGSIDE `db.setUser`/`mcp.setUser`. Optional (browser preview). */
  setUser?(uid: string | null): Promise<void> | void;
  configured(): Promise<string[]>;
  set(id: string, value: string): Promise<void>;
  clear(id: string): Promise<void>;
  /** One-time migration of legacy plaintext keys (only sets ids not present). */
  importLegacy(map: Record<string, string>): Promise<void>;
  /**
   * "Connect my OpenRouter account" — OAuth PKCE, run entirely by the platform:
   * it opens the browser, receives the callback and stores the key itself. Resolves
   * `true` once a key is stored, `false` on refusal/timeout/failure.
   *
   * ⚠️ Note what does NOT happen: the key never travels through this interface. The
   * paste path (`set`) necessarily shows the renderer a key once; this one does not,
   * which is why it is a separate verb rather than a helper returning a value to `set`.
   * Absent ⇒ the affordance is not rendered (browser preview, mobile) and the manual
   * paste stays the only route.
   */
  connectOpenRouter?(): Promise<boolean>;
  /**
   * Publish the org posture "can this account use ITS OWN keys?".
   * `null` = no organization / not known yet ⇒ the platform lets it happen; `false` =
   * managed account ⇒ it refuses both writing a key AND injecting an already-stored key.
   * An interface that hides the grid isn't enough: the real guard is on the platform side
   * (rule 7). Absent ⇒ nothing to constrain on this platform.
   */
  setOrgByoAllowed?(allowed: boolean | null): Promise<void>;
}

/**
 * Optional microphone capability. `ensureMicAccess()` asks the platform for
 * OS-level mic access (macOS TCC) and resolves to whether the mic is usable —
 * the dictation hook calls it before `getUserMedia`. Absent = no native gate
 * (browser preview) → the hook records directly.
 */
export interface MediaHost {
  ensureMicAccess(): Promise<boolean>;
}

/** An OpenGraph link-preview card. `image` is a `data:` URL (bytes fetched by the
 *  platform in a safe context), never a remote URL. All fields optional. */
export interface LinkPreviewData {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  /** The site's icon as a `data:` URL — blurred background fallback when there's no
   *  `image`. Fetched safely by the platform; never a remote URL. */
  favicon?: string;
  siteName?: string;
}

/**
 * Optional link-unfurl capability. `preview(url)` returns an OG card (or null when
 * nothing usable / the fetch is refused). The platform MUST fetch safely (SSRF
 * guard, size/timeout caps) and inline the image as a `data:` URL. Absent = no
 * previews (e.g. browser preview). Gated behind the user's `linkPreviews` setting.
 */
export interface LinksHost {
  preview(url: string): Promise<LinkPreviewData | null>;
  /** Push the user's `linkPreviews` opt-in to the platform so it can ALSO enforce it
   *  at the fetch boundary (main tracks it authoritatively, default OFF — audit M4).
   *  Optional: a platform with no main-side gate (browser preview) can omit it. */
  setEnabled?(on: boolean): Promise<void>;
}

/** Result of a sandboxed Python run: process outcome, captured output, and any
 *  matplotlib figures the code produced (PNG bytes, base64). */
export interface PythonRunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  images: { name: string; base64: string }[];
  /** Deliverable files the code produced (PDF/xlsx/docx/…), captured from the sandbox
   *  output dir and handed back to the user as message attachments. */
  files: { name: string; base64: string; mime: string }[];
}

/**
 * Optional sandboxed Python execution (desktop only). `run(code)` executes
 * model-generated Python in an isolated, download-on-first-use CPython runtime
 * (numpy/pandas/seaborn/matplotlib/yfinance/requests) under an OS jail with network
 * forced through a host-controlled egress allow-list, and returns stdout/stderr +
 * any figures as PNGs. Wired into the agentic loop as the `run_python` tool, gated
 * Absent = no code interpreter (browser preview).
 *
 * Privacy: the agent loop DE-REDACTS the code before calling this (deliverables must
 * hold the user's REAL data), so the jail's egress/FS confinement is load-bearing;
 * only the stdout the model reads back is re-redacted (see `agent/CLAUDE.md`).
 */
export interface PythonHost {
  /** `onProgress` streams a live human status (download %, install, "Exécution…",
   *  the code's latest stdout line) so the chat's tool indicator evolves.
   *  `files` = deliverables generated EARLIER in the conversation (real bytes),
   *  seeded into the run's working dir so the code can load + MODIFY them; the
   *  implementation re-sanitizes them and does not re-deliver an unchanged seed. */
  run(
    code: string,
    onProgress?: (status: string) => void,
    files?: { name: string; base64: string }[],
  ): Promise<PythonRunResult>;
}

/** A document to typeset: the body markup + its print stylesheet + a plain-text title
 *  (PDF metadata and the running footer). Built by `components/export/documentHtml.ts`. */
export interface PdfDocument {
  html: string;
  css: string;
  title: string;
}

/**
 * Optional HTML→PDF typesetter (desktop only) for a model-authored ```document. The
 * platform lays the HTML out with a real browser engine — brand webfont, full Unicode,
 * page-breaking, real tables — which the in-renderer pdf-lib exporter cannot do (WinAnsi
 * + the 14 standard fonts). Absent ⇒ the card falls back to `export/documentPdf.ts`, so
 * the download always works; this only makes it prettier.
 *
 * Privacy: the document holds the user's REAL values (it is the un-redacted reply, for the
 * user's own eyes), so the implementation MUST keep it on-device — the desktop renders it
 * in an isolated, script-less, network-less window and writes nothing to disk
 * (`apps/desktop/src/main/pdf/CLAUDE.md`). A host that would round-trip it to a server
 * cannot implement this slot.
 */
export interface PdfHost {
  /** Resolves the PDF bytes; REJECTS on any failure (the caller then falls back). */
  renderHtml(doc: PdfDocument): Promise<Uint8Array>;
}

/** One page's outcome from {@link WebHost.fetchMany}. */
export interface WebFetchItem {
  /** The requested URL (real, un-redacted by the loop before the fetch). */
  url: string;
  ok: boolean;
  /** After redirects — present on success. */
  finalUrl?: string;
  /** Extracted readable text — present on success. */
  text?: string;
  /** A short, host-free reason — present on failure. */
  error?: string;
}

/**
 * Optional BATCH web reader (desktop only). Fetches several URLs CONCURRENTLY over the
 * hardened `safeFetch` egress path (http(s) only, SSRF re-checked per redirect hop, IP
 * pinned, Content-Type allow-listed to text/data, size-capped, timed out) and returns
 * each page's readable text — the parallel alternative to driving the agent browser one
 * page at a time. Surfaced to the model as the `web_fetch_many` tool whenever this slot
 * exists. Absent = no batch reader (browser preview).
 *
 * Privacy/security: the loop un-redacts each URL (fake→real) BEFORE calling this and
 * re-redacted every returned string after — via the browser's CLEAR-MODE (vault replay
 * only) when the call carried no redacted data, else the full engine; `safeFetch`
 * carries NO cookies, so this can never reach the user's authenticated pages. It does
 * NOT execute JavaScript.
 */
export interface WebHost {
  fetchMany(urls: string[]): Promise<WebFetchItem[]>;
}

/**
 * Optional SYSTEM notification when a reply lands while the user is elsewhere
 * (`state/replyNotice.ts` owns when and what). Absent (browser preview, mobile) ⇒ the
 * setting is not offered and nothing is posted — the toggle would promise a banner the
 * platform cannot draw.
 *
 * ⚠️ The banner carries NO conversation content and no title: it goes to the OS
 * notification centre and paints over whatever is on screen — a lock screen, a shared
 * display. `conversationId` travels so the CLICK can land on the right thread; it never
 * shows. The platform focuses its own window on click (a renderer cannot) and then
 * reports the id through {@link onActivate}.
 */
export interface NotifyHost {
  /** Whether the OS can actually show one (Electron `Notification.isSupported()`). */
  supported(): Promise<boolean>;
  /** Post a banner. Fire-and-forget: a refused/undisplayable notification is not an error
   *  the app should surface — the reply is in the conversation either way. */
  reply(input: { conversationId: string; title: string; body: string }): void;
  /** The user clicked one. The platform has ALREADY focused the window; the renderer
   *  only has to open the thread. Returns the unsubscribe. */
  onActivate(cb: (conversationId: string) => void): () => void;
}

/**
 * Optional read of the **Claude Code skills** this machine already holds — the basis of
 * « Importer mes compétences Claude » in two clicks.
 *
 * ⚠️ The renderer supplies NO path: the platform enumerates roots it alone knows
 * (`~/.claude/skills/`, and the `.claude/skills/` of folders ALREADY granted to the
 * Files connector) and reads only a fixed-named file. It is a single-shape allow-listed
 * capability, not the broadened read-gate.
 *
 * Absent (web preview, mobile) ⇒ the button isn't drawn; dropping a folder remains the
 * universal path.
 */
export interface ClaudeSkillsHost {
  list(): Promise<
    { folder: string; text: string; siblings: string[]; from: "home" | "project" }[]
  >;
}
