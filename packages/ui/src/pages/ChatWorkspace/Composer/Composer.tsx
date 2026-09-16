import { BRAND } from "@openmasq/branding";
import { AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";
import { MemoryIcon, ShieldIcon } from "../../../components/brand";
import { ModelSelector } from "../../../components/ModelSelector";
import { SelectionMenu } from "../../../components/SelectionMenu";
import { useT } from "../../../i18n";
import { isExplicitMemoryAsk } from "../../../memory/extract";
import { AttachmentChips } from "../AttachmentChips";
import { AttachmentPreviewHost } from "../AttachmentPreviewHost";
import { ComposerAddMenu } from "../ComposerAddMenu";
import { DetectChips, LongTextCard } from "../ComposerChips";
import { chipValueFor, LONG_TEXT_THRESHOLD, longTextStats, markAtCaret } from "../composerDetection";
import { ComposerRedactButton } from "../ComposerRedactButton";
import { ComposerSkillMenu } from "../ComposerSkillMenu";
import { ComposerTextModal } from "../ComposerTextModal";
import { HighlightedTextarea } from "../HighlightedTextarea";
import { MarkKeepMenu } from "../MarkKeepMenu";
import { useTextareaSelection } from "../useTextareaSelection";
import { useUtilityRisk } from "../useUtilityRisk";
import { ComposerTag } from "./parts/ComposerTag";
import { SendButton } from "./parts/SendButton";
import { UtilityRiskNote } from "./parts/UtilityRiskNote";
import type { ComposerProps } from "./types";
import { useLiveDetection } from "./useLiveDetection";
import { useSendState } from "./useSendState";
import { useSlashPalette } from "./useSlashPalette";

type MarkMenu = { x: number; y: number; value: string; hue: string; uncertain?: boolean };

/**
 * The bottom composer: attachment chips, the auto-growing textarea over its highlight
 * mirror, and the action row (model picker, level, live count, the « + » door, send/stop).
 * All logic is passed in or lives in the hooks beside this file.
 */
export function Composer(p: ComposerProps) {
  const { input, onInput, onSubmit, attachments, conversation, tag, onForceRedact, onAddToVault } = p;
  const t = useT();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const [previewCid, setPreviewCid] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [markMenu, setMarkMenu] = useState<MarkMenu | null>(null);
  // Resolved LIVE (by cid) so a re-run's fresh redaction shows in the open modal.
  const preview = previewCid ? attachments.find((a) => a.cid === previewCid) ?? null : null;

  const palette = useSlashPalette({ input, onInput, onPickSkill: p.onPickSkill, skills: p.competences, taRef, t });
  const live = useLiveDetection(p);
  const { detection, keepSet, toggleKeep, segments } = live;
  const utilRisk = useUtilityRisk({
    input,
    forcedCats: live.forcedCats,
    regexCats: live.regexCats,
    modelCats: live.modelCats,
    attachments,
    competencePreview: tag?.preview,
    disabledKinds: p.redactPolicy?.disabledKinds,
    keepSet,
    toggleKeep,
    onRevealChange: p.onRevealChange,
  });
  const sendState = useSendState({ input, attachments, live, skillCats: utilRisk.skillCats, t });
  const { busy, showDone, scanState } = sendState;

  // A textarea selection (not a DOM range) → the "Redact" menu; a keystroke drops it.
  const { sel: redactSel, onSelect: onTaSelect, clear: clearRedactSel } = useTextareaSelection(taRef);
  useEffect(() => {
    clearRedactSel();
  }, [input, clearRedactSel]);
  // A drag opens the force-redact menu; a plain click INSIDE a mark offers « garder en clair ».
  const onTaMouseUp = (e: MouseEvent) => {
    if (onForceRedact) onTaSelect(e);
    const { clientX, clientY } = e;
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (!ta || ta.selectionStart !== ta.selectionEnd) return;
      const m = markAtCaret(detection.ranges, keepSet, ta.selectionStart ?? -1);
      setMarkMenu(m ? { x: clientX, y: clientY, value: m.value, hue: m.hue, uncertain: m.uncertain } : null);
    });
  };
  function onKeyDown(e: KeyboardEvent) {
    if (palette.onKeyDown(e)) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      // Never send while the redaction is still being computed (or a file redacted).
      if (!busy) onSubmit();
    }
  }
  // A long draft collapses the inline box to a card; editing moves to the modal.
  const longStats = input.length > LONG_TEXT_THRESHOLD ? longTextStats(input) : null;

  return (
    <div className="composer">
      {attachments.length > 0 && (
        <AttachmentChips
          attachments={attachments}
          currentRedactSig={p.currentRedactSig}
          onRetry={p.onRetryAttachment}
          onOcrAll={p.onOcrAllAttachment}
          onRemove={p.onRemoveAttachment}
          onOpen={setPreviewCid}
        />
      )}
      {tag && <ComposerTag tag={tag} onClearTag={p.onClearTag} onEditTag={p.onEditTag} t={t} />}
      {/* Passive MÉMOIRE hint: derives from the text, nothing to clear. */}
      {p.memoryHint && isExplicitMemoryAsk(input) && (
        <div className="composer-tag tone-violet composer-memhint" title={t.composer.memoryHintTip}>
          <MemoryIcon size={13} />
          <span>{t.composer.memoryHint}</span>
        </div>
      )}
      <div className="composer-input-wrap" ref={palette.inputWrapRef}>
        {palette.paletteOpen && (
          <div
            ref={palette.menuRef}
            className={`composer-slash-pop${palette.slashPlace.below ? " below" : ""}`}
            style={{ "--slash-max": `${palette.slashPlace.maxHeight}px` } as CSSProperties}
          >
            <ComposerSkillMenu
              skillList={palette.slashItems ?? []}
              actions={palette.slashActs ?? undefined}
              activeIndex={palette.activeIndex}
              onPick={palette.pickSlash}
              onPickAction={palette.pickSlashAction}
              onCreate={palette.onCreate}
            />
          </div>
        )}
        {longStats ? (
          <LongTextCard stats={longStats} onOpen={() => setEditorOpen(true)} />
        ) : (
          // The privacy CLAIM is made once, by the welcome subtitle; here only the invitation.
          <HighlightedTextarea
            taRef={taRef}
            backdropRef={backdropRef}
            value={input}
            onChange={onInput}
            segments={segments}
            placeholder={t.composer.placeholder(BRAND.name)}
            grow={200}
            onKeyDown={onKeyDown}
            onMouseUp={onTaMouseUp}
            onKeyUp={onForceRedact ? (e) => (e.shiftKey ? onTaSelect() : undefined) : undefined}
          />
        )}
        {markMenu && (
          <MarkKeepMenu
            {...markMenu}
            onKeep={() => toggleKeep(chipValueFor(detection.items, markMenu.value))}
            onClose={() => setMarkMenu(null)}
          />
        )}
        {redactSel && onForceRedact && (
          <SelectionMenu
            x={redactSel.x}
            y={redactSel.y}
            onPick={(token) => {
              onForceRedact(redactSel.text, token);
              clearRedactSel();
            }}
            onVault={
              onAddToVault
                ? (token) => {
                    onAddToVault(redactSel.text, token);
                    clearRedactSel();
                  }
                : undefined
            }
          />
        )}
      </div>
      <UtilityRiskNote util={utilRisk} t={t} />
      {detection.items.length > 0 && <DetectChips items={detection.items} keepSet={keepSet} onToggle={toggleKeep} />}
      <div className="composer-row">
        {/* With no conversation yet it shows the new-chat default, never a blank picker. */}
        <ModelSelector
          value={conversation?.modelId ?? p.newChatModelId ?? ""}
          disabled={p.isStreaming}
          allowedModelIds={p.allowedModelIds}
          unavailableModels={p.unavailableModels}
          onAccessInfo={p.onAccessInfo}
          onOpenModelSettings={p.onOpenModelSettings}
          simple={p.modelPickerSimple}
          onSimpleChange={p.onModelPickerSimpleChange}
          favoriteModels={p.favoriteModels}
          onToggleFavorite={p.onToggleFavoriteModel}
          defaultModelId={p.defaultModelId}
          onSetDefault={p.onSetDefaultModel}
          onChange={(modelId) =>
            conversation ? p.onChangeModel(conversation.id, modelId) : p.onChangeNewChatModel?.(modelId)
          }
        />
        {p.redactLevel && <ComposerRedactButton api={p.redactLevel} />}
        {/* Idle-only count; the LIVE state (running → done) is shown IN the send button. */}
        {!busy && !showDone && scanState.kind === "count" && (
          <span
            key="count"
            className={`protected-pill sm kx-pill-in${scanState.partial ? " partial" : ""}`}
            title={scanState.hint}
          >
            <ShieldIcon size={12} />
            {scanState.label}
          </span>
        )}
        <div className="flex-spacer" />
        {/* ONE door for everything that joins the message; "/" stays the keyboard way to the compétences. */}
        <ComposerAddMenu
          onFile={p.canAttach ? p.onAttach : undefined}
          onFolder={p.onAddFolder}
          onConnector={p.onOpenConnectors}
          onSkill={palette.openFromPlus}
        />
        <SendButton
          isStreaming={p.isStreaming}
          busy={busy}
          showDone={showDone}
          disabled={sendState.sendDisabled}
          onStop={p.onStop}
          onSubmit={onSubmit}
          t={t}
        />
      </div>
      <AttachmentPreviewHost
        preview={preview}
        currentRedactSig={p.currentRedactSig}
        inactiveCategories={p.inactiveCategories}
        convCategories={conversation?.redactCategories}
        onRetryAttachment={p.onRetryAttachment}
        onRevealChange={p.onRevealChange}
        onForceRedactDoc={p.onForceRedactDoc}
        onDeleteRedactionDoc={p.onDeleteRedactionDoc}
        onAddToVault={onAddToVault}
        onClose={() => setPreviewCid(null)}
      />
      <AnimatePresence>
        {editorOpen && (
          <ComposerTextModal
            input={input}
            onInput={onInput}
            segments={segments}
            mirrorOff={!live.mirrorOn}
            items={detection.items}
            ranges={detection.ranges}
            keepSet={keepSet}
            onToggleKeep={toggleKeep}
            keepValueOf={(occ) => chipValueFor(detection.items, occ)}
            liveCount={sendState.liveCount}
            onForceRedact={onForceRedact}
            onAddToVault={onAddToVault}
            onClose={() => setEditorOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
