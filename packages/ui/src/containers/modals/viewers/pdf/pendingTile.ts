import type { PendingPage } from "./pendingPages";

/**
 * A page that may not be shown yet: its shell keeps the page's true size and holds only the
 * thumbnail the extraction streamed — ≤ 40 px wide AT THE SOURCE, so unreadable whatever
 * this element does with it (the blur only makes the upscale read as a page) — and a line
 * saying where the page stands. Never the page's raster. Returns what clears it.
 */
export function mountPendingTile(shell: HTMLElement, page: PendingPage | undefined, label: string): () => void {
  const tile = document.createElement("div");
  tile.className = "pdfv-wait";
  // Only a checked `data:image/png` thumbnail (`extractStream.ts`, `readingMask.ts`).
  if (page?.thumb?.startsWith("data:image/png;base64,")) {
    const img = document.createElement("img");
    img.className = "pdfv-wait-thumb";
    img.src = page.thumb;
    img.alt = "";
    img.draggable = false;
    tile.appendChild(img);
  }
  const badge = document.createElement("span");
  badge.className = `pdfv-wait-badge is-${page?.state ?? "waiting"}`;
  badge.textContent = label;
  tile.appendChild(badge);
  shell.replaceChildren(tile);
  shell.classList.add("pending", "is-waiting");
  shell.setAttribute("aria-label", label);
  return () => {
    shell.replaceChildren();
    shell.classList.remove("is-waiting");
    shell.removeAttribute("aria-label");
  };
}
