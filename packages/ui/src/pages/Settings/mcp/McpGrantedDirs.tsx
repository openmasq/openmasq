import { useState } from "react";
import type { McpCatalogEntry } from "../../../host";
import { Btn } from "./McpBtn";

/**
 * Les dossiers autorisés d'un serveur local DÉJÀ connecté, avec ajout et retrait.
 *
 * Pourquoi sur la carte du connecté, et pas seulement dans le formulaire de connexion :
 * la liste ne se composait qu'une fois, à la connexion. Ajouter un deuxième dossier
 * demandait de tout déconnecter puis de ré-accorder chaque dossier un par un — une
 * révocation complète pour une addition. Personne ne le fait ; on renonce au dossier.
 *
 * Le retrait est immédiat côté hôte (le connecteur est reconstruit avec le nouveau
 * périmètre), donc ce bouton retire vraiment l'accès, il ne le retire pas « au prochain
 * lancement ». C'est aussi pour ça que l'erreur renvoyée par l'hôte s'affiche ici telle
 * quelle : une révocation qui échoue doit se voir.
 */
export function McpGrantedDirs({
  entry,
  params,
  onPickDir,
  onSetDirs,
}: {
  entry: McpCatalogEntry;
  /** Les dossiers actuellement autorisés, par clé de paramètre. */
  params?: Record<string, string[]>;
  onPickDir: () => Promise<string | undefined>;
  onSetDirs: (key: string, dirs: string[]) => Promise<string | undefined>;
}) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fields = (entry.params ?? []).filter((p) => p.kind === "directory");
  if (!fields.length) return null;

  const apply = async (key: string, dirs: string[]) => {
    setBusyKey(key);
    setError(null);
    try {
      setError((await onSetDirs(key, dirs)) ?? null);
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="mcp-granted-dirs">
      {fields.map((p) => {
        const dirs = params?.[p.key] ?? [];
        const busy = busyKey === p.key;
        return (
          <div key={p.key} className="mcp-param">
            <div className="mcp-rownote">{p.label}</div>
            {dirs.map((d) => (
              <div key={d} className="flex items-center gap-2">
                <code className="mcp-cmd flex-min">{d}</code>
                <button
                  type="button"
                  className="opacity-60 hover:opacity-100"
                  onClick={() => apply(p.key, dirs.filter((x) => x !== d))}
                  // Un dossier requis ne se retire pas s'il est le dernier : l'hôte
                  // refuserait, autant ne pas proposer le geste.
                  disabled={busy || (!!p.required && dirs.length === 1)}
                  aria-label={`Retirer ${d}`}
                  title={
                    p.required && dirs.length === 1
                      ? "Au moins un dossier est requis — ajoutez-en un autre avant de retirer celui-ci"
                      : "Retirer"
                  }
                >
                  ✕
                </button>
              </div>
            ))}
            <Btn
              label={busy ? "Mise à jour…" : "Ajouter un dossier…"}
              onClick={async () => {
                const dir = await onPickDir();
                if (!dir || dirs.includes(dir)) return;
                await apply(p.key, [...dirs, dir]);
              }}
              disabled={busy}
              loading={busy}
              subtle
            />
          </div>
        );
      })}
      {error && <div className="mcp-modal-error">{error}</div>}
    </div>
  );
}
