/** Small MCP action button (primary / subtle), with an optional inline spinner. */
export function Btn({
  label,
  onClick,
  disabled,
  subtle,
  danger,
  loading,
  title,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  subtle?: boolean;
  /** Tint the label as destructive (déconnecter / oublier) — the kit's ghost-red. */
  danger?: boolean;
  /** Show an inline spinner (e.g. while connecting). */
  loading?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`mcp-btn ${subtle ? "subtle" : ""} ${danger ? "danger" : ""}`}
    >
      {loading && <span className="mcp-btn-spin" aria-hidden="true" />}
      {label}
    </button>
  );
}
