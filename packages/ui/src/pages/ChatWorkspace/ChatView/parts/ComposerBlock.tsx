import { toggleFavoriteModel } from "../../../../components/ModelSelector/simpleList";
import { factorySimpleIds } from "../../../../prompt/defaultModel";
import { AUTO_MODEL_ID } from "../../../../send/autoRoute";
import { Composer } from "../../Composer";
import { ConversationTokens } from "../../ConversationTokens";
import { inactiveCategoryLabels } from "../../docCategoryNotice";
import { MemoryProposalCard } from "../../MemoryProposalCard";
import { RedactionIntroCard } from "../../RedactionIntroCard";
import { redactEngineSig } from "../../redactEngineSig";
import { TransparencyCard } from "../../TransparencyCard";
import type { ChatViewModel } from "../model";

/**
 * ONE composer, rendered in ONE of two spots (home welcome vs docked bottom) — the same
 * instance, so both share identical send wiring. The once-only cards above it are a
 * `*Seen` in the settings, never component state.
 */
export function ComposerBlock({ m }: { m: ChatViewModel }) {
  const { p, view, att, intake, forced, intents, send, redactPolicy, redactLevel } = m;
  const { conversation, settings, onChangeSettings, orgProfile, unavailableModels } = p;
  const canWrite = !!settings && !!onChangeSettings;
  const patch = (partial: Partial<NonNullable<typeof settings>>) =>
    settings && onChangeSettings?.({ ...settings, ...partial });
  return (
    <div className="composer-wrap">
      {view.showTransparency && canWrite && (
        <TransparencyCard
          count={view.transparencyCount}
          modelName={view.currentModelLabel}
          onOpen={() => {
            patch({ transparencySeen: true });
            view.setShowComparison(true);
          }}
          onDismiss={() => patch({ transparencySeen: true })}
        />
      )}
      {view.showRedactionIntro && canWrite && (
        <RedactionIntroCard
          onOpen={() => p.onOpenGuideChapter!("protection")}
          onDismiss={() => patch({ redactionIntroSeen: true })}
        />
      )}
      {view.showMemoryProposal && intents.memoryOpen && canWrite && (
        <MemoryProposalCard
          onActivate={() => patch({ memoryAuto: true, memoryProposalSeen: true })}
          onDismiss={() => patch({ memoryProposalSeen: true })}
        />
      )}
      <Composer
        input={m.input}
        onInput={m.handleInput}
        onSubmit={send.submit}
        modelPickerSimple={settings?.modelPickerSimple}
        // PERSISTED toggles and defaults: without `onChangeSettings` (aperçu, test harness)
        // the view stays whatever it's given, with no toggle offered.
        onModelPickerSimpleChange={canWrite ? (simple) => patch({ modelPickerSimple: simple }) : undefined}
        favoriteModels={settings?.favoriteModels}
        onToggleFavoriteModel={
          canWrite
            ? (id) =>
                patch({
                  favoriteModels: toggleFavoriteModel(
                    settings.favoriteModels,
                    id,
                    factorySimpleIds(unavailableModels, orgProfile?.allowedModelIds),
                  ),
                })
            : undefined
        }
        defaultModelId={view.defaultModelId}
        onSetDefaultModel={canWrite ? (id) => patch({ defaultModelId: id }) : undefined}
        memoryHint={p.memoryHint}
        tag={intents.tag}
        onClearTag={intents.clearTag}
        onEditTag={intents.editTag}
        competences={intents.skills}
        onPickSkill={intents.handlePickSkill}
        // The live highlight's forced layer must see EVERY source the send forces, Coffre included.
        forcedRedactions={forced.forcedValues}
        onForceRedact={p.onForceRedact || !conversation ? forced.handleForceRedact : undefined}
        onAddToVault={p.onAddToVault}
        attachments={att.attachments}
        onRemoveAttachment={att.removeAttachment}
        onRetryAttachment={att.retryAttachment}
        onOcrAllAttachment={intake.canOcrAll ? intake.handleOcrAll : undefined}
        currentRedactSig={redactEngineSig(settings, orgProfile?.forcedCategories, conversation?.redactCategories)}
        inactiveCategories={inactiveCategoryLabels(
          settings?.redactCategories,
          conversation?.redactCategories,
          orgProfile?.forcedCategories,
        )}
        conversation={conversation}
        isStreaming={view.activeStreaming}
        onChangeModel={p.onChangeModel}
        // AUTO passes through as the sentinel — resolving it here would silently drop the mode.
        newChatModelId={view.autoMode ? AUTO_MODEL_ID : view.currentModel.id}
        onChangeNewChatModel={(modelId) => patch({ defaultModelId: modelId })}
        onAccessInfo={(focus, providerLabel) => m.keys.setAccessInfo({ focus, providerLabel })}
        onOpenModelSettings={() => p.onOpenSettings("models")}
        onStop={p.onStop}
        onAttach={intake.attach}
        canAttach={intake.canAttach}
        onAddFolder={intake.onAddFolder}
        // The catalogue in Réglages → Connecteurs IS the chooser.
        onOpenConnectors={() => p.onOpenSettings("mcp")}
        allowedModelIds={orgProfile?.allowedModelIds}
        unavailableModels={unavailableModels}
        onKeepListChange={send.setKeepList}
        onRevealChange={att.setReveal}
        onForceRedactDoc={forced.handleDocForceRedact}
        onDeleteRedactionDoc={forced.handleDocDeleteRedaction}
        // The async detection layer only pays off on an AI-grade engine; on `patterns` the
        // instant regex layer is the only one, and `redactPolicy` is what carries the rules to it.
        onDetectPii={
          settings?.redactEngine === "model" || settings?.redactEngine === "local" || settings?.redactEngine === "remote"
            ? p.onDetectPii
            : undefined
        }
        redactPolicy={redactPolicy}
        redactLevel={redactLevel}
      />
      {conversation && (
        <div className="composer-note">
          <ConversationTokens convId={conversation.id} />
        </div>
      )}
    </div>
  );
}
