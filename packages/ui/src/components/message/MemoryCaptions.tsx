import { MemoryIcon } from "../brand";
import { useMemoryUi } from "../../memory/memoryUi";
import type { Message } from "../../types";

/**
 * The MÉMOIRE captions under a bubble — the feature's visibility in the chat.
 * Both consume `useMemoryUi` HERE (not in MessageBubble) on purpose: a context
 * change re-renders these tiny leaves only, never the memo'd bubble around them.
 * No provider mounted ⇒ they render nothing / plain text (preview fragments).
 */

/** « Mémoire utilisée » on a USER message: which souvenirs rode this send
 *  (redacted). Ids resolve against the LIVE store — a deleted card drops out. */
export function MemoryUsedCaption({ ids }: { ids: string[] }) {
  const mem = useMemoryUi();
  if (!mem) return null;
  const items = mem.resolve(ids);
  if (!items.length) return null;
  const firstCard = items.find((i) => i.id !== "profile");
  return (
    <div
      className="shield-caption"
      title="Souvenirs injectés avec cet envoi, redacted comme le reste — cliquez pour ouvrir la Mémoire"
    >
      <MemoryIcon size={13} />
      <button type="button" className="caption-link" onClick={() => mem.open(firstCard?.id)}>
        Mémoire utilisée — {items.map((i) => i.label).join(" · ")}
      </button>
    </div>
  );
}

/** Le NON-RAPPEL surprenant, rendu diagnosticable : une fiche qui aurait pu accompagner
 *  cet envoi mais n'est pas partie — budget d'injection saturé, ou prénom/nom trop
 *  courant tapé seul (ignoré exprès : « Pierre » ne doit pas rappeler « Pierre Marché »
 *  sur chaque « pierre » du texte). Le non-rappel NORMAL (aucune mention) reste
 *  silencieux — cette légende n'apparaît que sur les quasi-ratés, sinon son bruit
 *  apprendrait à l'ignorer. Le message porte des ids opaques ; les noms se résolvent
 *  ici, contre le store vivant. */
export function MemorySkippedCaption({ skipped }: { skipped: { id: string; reason: string }[] }) {
  const mem = useMemoryUi();
  if (!mem) return null;
  const byId = new Map(skipped.map((s) => [s.id, s.reason]));
  const items = mem.resolve(skipped.map((s) => s.id));
  if (!items.length) return null; // les fiches ont été supprimées depuis
  const homographe = items.filter((i) => byId.get(i.id) === "homographe");
  const budget = items.filter((i) => byId.get(i.id) === "budget");
  const parts: string[] = [];
  if (homographe.length)
    parts.push(
      `${homographe.map((i) => i.label).join(", ")} non injectée${homographe.length > 1 ? "s" : ""} — nom trop courant seul, écrivez-le en entier`,
    );
  if (budget.length)
    parts.push(
      `${budget.length} fiche${budget.length > 1 ? "s" : ""} écartée${budget.length > 1 ? "s" : ""} faute de place`,
    );
  return (
    <div
      className="shield-caption"
      title="Ces souvenirs correspondaient mais ne sont pas partis avec cet envoi — cliquez pour ouvrir la fiche"
    >
      <MemoryIcon size={13} />
      <button type="button" className="caption-link" onClick={() => mem.open(items[0]?.id)}>
        Mémoire : {parts.join(" · ")}
      </button>
    </div>
  );
}

/** « N faits notés » after an explicit « retiens que… »: clickable (deep-link to the
 *  created card) with an inline « Annuler ». The undo is DERIVED — once the created
 *  cards are gone (annulé here or deleted on the page) the caption says so, instead
 *  of keeping a stale claim. */
export function MemoryNotedCaption({ message }: { message: Message }) {
  const mem = useMemoryUi();
  // Extraction en vol (« retiens que… » reçu, appel modèle en cours) : le dire tout de
  // suite — les secondes que prend l'extraction se lisaient comme une fonctionnalité
  // morte. Remplacé par le résultat (`memoryNoted`/`memoryNotedFailed`) quand il tombe.
  if (message.memoryNotedPending && typeof message.memoryNoted !== "number") {
    return (
      <div className="shield-caption" title="Extraction en cours — le résultat s'affichera ici">
        <MemoryIcon size={13} />
        <span className="flex-min">Mise en mémoire…</span>
      </div>
    );
  }
  if (typeof message.memoryNoted !== "number") return null;
  // A REAL failure (model unreachable / reply unusable after retry) is told honestly —
  // never dressed up as « rien de durable à retenir », which is an ANSWER.
  if (message.memoryNotedFailed) {
    return (
      <div
        className="shield-caption"
        title="Mise en mémoire impossible : rien n'a été enregistré. Redemandez « retiens… » pour réessayer."
      >
        <MemoryIcon size={13} />
        <span className="flex-min">Mise en mémoire échouée — rien n'a été noté, réessayez</span>
      </div>
    );
  }
  const n = message.memoryNoted;
  const ids = message.memoryNotedIds ?? [];
  // A preference lands in the PROFILE (« Profil » sentinel), not a card, so it counts 0
  // facts — but it IS a save. `live`/`undone` stay about the created CARDS only (the
  // profile append has no card to deep-link or undo).
  const hasProfile = ids.includes("profile");
  const live = mem ? mem.resolve(ids).filter((i) => i.id !== "profile") : [];
  // Les fiches EXISTANTES que la passe a mises à jour — résolues contre le store
  // vivant (une fiche supprimée depuis sort du compte), deep-link vers le panneau où
  // l'historique montre la phrase remplacée.
  const updated = mem ? mem.resolve(message.memoryUpdatedIds ?? []).filter((i) => i.id !== "profile") : [];
  const undone = n > 0 && ids.some((id) => id !== "profile") && live.length === 0 && updated.length === 0;
  const updSuffix = updated.length
    ? ` · ${updated.length === 1 ? "1 fiche mise à jour" : `${updated.length} fiches mises à jour`}`
    : "";
  const label =
    n === 0
      ? hasProfile
        ? "Préférence enregistrée en mémoire"
        : "Rien de durable à retenir en mémoire"
      : undone
        ? "Souvenir retiré de la mémoire"
        : `${n === 1 ? "1 fait noté" : `${n} faits notés`}${hasProfile ? " + profil" : ""}${updSuffix} en mémoire`;
  return (
    <div
      className="shield-caption"
      title="Mémoire locale (page Mémoire) — demande explicite de retenir"
    >
      <MemoryIcon size={13} />
      {mem && (n > 0 || hasProfile) && !undone ? (
        <button type="button" className="caption-link" onClick={() => mem.open(live[0]?.id ?? updated[0]?.id)}>
          {label}
        </button>
      ) : (
        <span className="flex-min">{label}</span>
      )}
      {mem && live.length > 0 && (
        <button
          type="button"
          className="caption-undo"
          title="Retirer de la mémoire ce que cette demande a créé"
          onClick={() => mem.forget(live.map((i) => i.id))}
        >
          Annuler
        </button>
      )}
    </div>
  );
}
