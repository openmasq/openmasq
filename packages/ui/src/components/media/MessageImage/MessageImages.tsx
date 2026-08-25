import type { Ref } from "react";
import { PaperclipIcon } from "../../brand";
import { useStoredImage } from "./useStoredImage";
import { useInView } from "../../../hooks/useInView";

interface ImageAttachment {
  name: string;
  kind: string;
  mime?: string;
}

/**
 * One inline preview. Loads the stored file's ORIGINAL bytes as a `data:` URL and
 * renders it as an image; clicking opens the full in-app viewer (same `onOpen` as
 * a file chip). While loading → a skeleton; if the bytes can't be resolved → a
 * chip fallback, so the user never loses access to the file.
 */
function MessageImage({
  attachment,
  conversationIds,
  onOpen,
}: {
  attachment: ImageAttachment;
  conversationIds: string[];
  onOpen: (name: string) => void;
}) {
  // Gate the DB read + decode on visibility (the ref rides on whichever root renders),
  // so an off-screen inline image never loads its bytes — like the library thumbnails.
  const [ref, inView] = useInView<HTMLElement>();
  const state = useStoredImage(attachment.name, conversationIds, inView);

  if (state.status === "loading") {
    return (
      <span
        ref={ref as Ref<HTMLSpanElement>}
        className="msg-image-skeleton"
        aria-label={`Chargement de ${attachment.name}`}
      />
    );
  }
  if (state.status === "error") {
    return (
      <button
        ref={ref as Ref<HTMLButtonElement>}
        className="msg-file"
        title={`Consulter ${attachment.name}`}
        onClick={() => onOpen(attachment.name)}
      >
        <PaperclipIcon size={13} />
        <span className="msg-file-name">{attachment.name}</span>
      </button>
    );
  }
  return (
    <button
      ref={ref as Ref<HTMLButtonElement>}
      className="msg-image"
      title={`Consulter ${attachment.name}`}
      onClick={() => onOpen(attachment.name)}
    >
      <img src={state.src} alt={attachment.name} loading="lazy" decoding="async" />
    </button>
  );
}

/**
 * Inline image previews under a message — a design thumbnail a tool returned
 * (e.g. Canva `search-designs`), shown as real images rather than a file chip.
 */
export function MessageImages({
  images,
  conversationIds,
  onOpen,
}: {
  images?: ImageAttachment[];
  conversationIds: string[];
  onOpen: (name: string) => void;
}) {
  if (!images?.length) return null;
  return (
    <div className="msg-images">
      {images.map((a, i) => (
        <MessageImage key={i} attachment={a} conversationIds={conversationIds} onOpen={onOpen} />
      ))}
    </div>
  );
}
