import { AnimatePresence, motion } from "framer-motion";
import type { Messages } from "@openmasq/i18n";
import { CheckIcon, SendIcon, StopIcon } from "../../../../components/brand";

interface Props {
  isStreaming: boolean;
  busy: boolean;
  showDone: boolean;
  disabled: boolean;
  onStop: () => void;
  onSubmit: () => void;
  t: Messages;
}

const FADE = { duration: 0.16 };

/** MORPHS between states — send → « Masquage » (spinner) → « Masqué » ✓ → send; framer animates the width. */
export function SendButton({ isStreaming, busy, showDone, disabled, onStop, onSubmit, t }: Props) {
  if (isStreaming) {
    return (
      <button className="send-btn stop" onClick={onStop} aria-label={t.composer.stop}>
        <StopIcon size={16} />
      </button>
    );
  }
  return (
    <motion.button
      layout
      className={`send-btn${busy ? " is-busy has-text" : ""}${showDone ? " is-done has-text" : ""}`}
      onClick={onSubmit}
      disabled={disabled}
      aria-label={busy ? t.composer.redactingAria : showDone ? t.composer.redacted : t.composer.send}
      aria-busy={busy}
      whileTap={disabled ? undefined : { scale: 0.94 }}
      transition={{ type: "spring", stiffness: 520, damping: 34 }}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {busy ? (
          <motion.span
            key="busy"
            layout
            className="send-btn-content"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={FADE}
          >
            <span className="pill-spin" aria-hidden="true" />
            {t.composer.redacting}
          </motion.span>
        ) : showDone ? (
          <motion.span
            key="done"
            layout
            className="send-btn-content"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={FADE}
          >
            <CheckIcon size={16} />
            {t.composer.redacted}
          </motion.span>
        ) : (
          <motion.span
            key="send"
            layout
            className="send-btn-content"
            initial={{ opacity: 0, scale: 0.6, rotate: -25 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.6, rotate: 25 }}
            transition={FADE}
          >
            <SendIcon size={18} />
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
