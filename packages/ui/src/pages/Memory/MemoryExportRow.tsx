import { DownloadIcon } from "../../components/brand";
import { downloadTextFile } from "../../components/export/documentExport";
import { useChatSelector } from "../../containers/providers/chatStore";
import { useT } from "../../i18n";
import { memoryExportFilename, memoryExportText } from "../../memory/memoryExport";
import { useMemoryIndex } from "../../state/memory/useMemoryIndex";
import type { MemoryData } from "../../types";

const EMPTY: MemoryData = { cards: [] };

/**
 * The Mémoire's DIAGNOSTIC export — the cards AND the semantic links, as a local text
 * file. The links are what a clustering/dedupe question turns on, and they are
 * invisible on screen.
 *
 * It lives in Réglages → Journal, not on the Mémoire page: a debug artifact (real
 * data, local file) is a transparency gesture, not a daily one, and the page keeps
 * only what files your knowledge. Self-contained on purpose — it reads the store
 * through the bridge so the Journal tab's props stay what they are.
 */
export function MemoryExportRow() {
  const t = useT();
  const memoryData = useChatSelector((s) => s.settings.memoire ?? EMPTY);
  const { edges } = useMemoryIndex(memoryData);
  const exportDebug = () =>
    downloadTextFile(
      memoryExportFilename(),
      "text/plain;charset=utf-8",
      memoryExportText({ memoryData, edges: edges ?? null }),
    );
  return (
    <section className="settings-section">
      <div className="cv-eyebrow">{t.privacyTab.memoryEyebrow}</div>
      <div className="settings-card">
        <div className="toggle-row">
          <div className="row-body">
            <div className="row-title">{t.privacyTab.memoryExportTitle}</div>
            <div className="row-desc">{t.privacyTab.memoryExportHint}</div>
          </div>
          <button
            type="button"
            className="btn-ghost btn-inline"
            onClick={exportDebug}
            disabled={memoryData.cards.length === 0}
            title={t.menus.page.exportMemoryTip}
          >
            <DownloadIcon size={15} /> {t.menus.page.exportMemory}
          </button>
        </div>
      </div>
    </section>
  );
}
