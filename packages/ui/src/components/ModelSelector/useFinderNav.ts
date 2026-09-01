import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { type ModelInfo, type ProviderId } from "@openmasq/llm";
import { findModelAny } from "../../prompt/models";
import { filterModels, modelFamily, subgroupByFamily, type PriceTier } from "../../prompt/modelFilter";
import { pickerBlocks, type UnavailableReason } from "../../send/modelAvailability";
import { PROVIDER_ORDER } from "./providers";

/**
 * State + keyboard navigation for {@link FinderMenu} (the miller-columns model picker),
 * pulled out of the component so the `.tsx` stays presentation-only (logic in `.ts`).
 * Owns the price filter, the selected provider/family/model, the focused row and the
 * active column, plus the arrow/Enter/Escape handling. Behaviour is identical to the
 * former inline version — a pure lift.
 */
export function useFinderNav({
  value,
  available,
  unavailableModels,
  onChoose,
  onClose,
}: {
  value: string;
  available: ModelInfo[];
  unavailableModels?: ReadonlyMap<string, UnavailableReason>;
  onChoose: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const focusRef = useRef<HTMLButtonElement>(null);

  // Price-tier filter (same vocabulary + logic as the Settings grid — `filterModels`,
  // rule 9). It narrows the whole finder: providers, families, models and the search.
  const [price, setPrice] = useState<PriceTier | null>(null);
  const pool = useMemo(
    () => (price ? filterModels(available, "", null, price) : available),
    [available, price],
  );

  const providers = useMemo(
    () => PROVIDER_ORDER.filter((pid) => pool.some((m) => m.provider === pid)),
    [pool],
  );
  const reasonOf = (id: string) => unavailableModels?.get(id);
  // Only a HARD reason (nothing to call — `pickerBlocks`) removes a row from keyboard
  // nav / picking: a subscription- or key-gated model stays selectable, the send's
  // inline container owns the explanation (abonnement / clé).
  const usable = (m: ModelInfo) => {
    const r = unavailableModels?.get(m.id);
    return !r || !pickerBlocks(r);
  };

  const current = findModelAny(value);
  const [selProvider, setSelProvider] = useState<ProviderId>(
    current && providers.includes(current.provider) ? current.provider : (providers[0] ?? "openai"),
  );
  const families = useMemo(
    () => subgroupByFamily(pool.filter((m) => m.provider === selProvider)),
    [pool, selProvider],
  );
  const [selFamily, setSelFamily] = useState<string>(
    current ? modelFamily(current).key : (families[0]?.key ?? ""),
  );
  const familyModels = useMemo(
    () => families.find((f) => f.key === selFamily)?.models ?? [],
    [families, selFamily],
  );
  const [focusId, setFocusId] = useState<string>(value);
  const [col, setCol] = useState<0 | 1 | 2>(2);

  // Search flattens the columns to one filtered list.
  const q = query.trim();
  const results = useMemo(() => (q ? filterModels(pool, q, null) : null), [q, pool]);

  // A narrowed pool can orphan the selected provider/family — re-anchor to what exists.
  useEffect(() => {
    if (providers.length && !providers.includes(selProvider)) setSelProvider(providers[0]);
  }, [providers, selProvider]);
  useEffect(() => {
    if (families.length && !families.some((f) => f.key === selFamily)) setSelFamily(families[0].key);
  }, [families, selFamily]);

  // ⚠️ BLOCK BODY mandatory (rule `check:effects`): in recent Chromium,
  // `scrollIntoView` returns a PROMISE — the concise arrow was returning it as the
  // effect's cleanup and React called it on unmount: « destroy is not a function »,
  // the whole app on the ErrorBoundary on every model change. `lib.dom` still declares
  // it as `void`, so the typecheck CANNOT see this class of bug.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => {
    focusRef.current?.scrollIntoView({ block: "nearest" });
  }, [focusId, results]);

  // Selecting a provider (mouse or key) re-anchors the family + focused model to it.
  const pickProvider = (pid: ProviderId) => {
    setSelProvider(pid);
    const fams = subgroupByFamily(pool.filter((m) => m.provider === pid));
    const fam = fams[0];
    setSelFamily(fam?.key ?? "");
    setFocusId(fam?.models[0]?.id ?? "");
  };
  const pickFamily = (key: string) => {
    setSelFamily(key);
    const models = families.find((f) => f.key === key)?.models ?? [];
    setFocusId(models[0]?.id ?? "");
  };

  const choose = (id: string) => {
    const r = reasonOf(id);
    if (r && pickerBlocks(r)) return; // nothing to call — the row is disabled too
    onChoose(id);
  };

  const step = (list: { id?: string; key?: string }[], cur: string, dir: 1 | -1) => {
    const i = list.findIndex((x) => (x.id ?? x.key) === cur);
    const next = Math.min(list.length - 1, Math.max(0, (i < 0 ? 0 : i) + dir));
    return list[next];
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === "Escape") return onClose();
    // Search mode: a plain vertical list.
    if (results) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const usableList = results.filter(usable);
        const nx = step(usableList, focusId, e.key === "ArrowDown" ? 1 : -1);
        if (nx?.id) setFocusId(nx.id);
      } else if (e.key === "Enter") {
        e.preventDefault();
        choose(focusId);
      }
      return;
    }
    // Column mode.
    if (e.key === "ArrowRight") {
      e.preventDefault();
      setCol((c) => (c < 2 ? ((c + 1) as 0 | 1 | 2) : c));
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setCol((c) => (c > 0 ? ((c - 1) as 0 | 1 | 2) : c));
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const dir = e.key === "ArrowDown" ? 1 : -1;
      if (col === 0) pickProvider((step(providers.map((id) => ({ id })), selProvider, dir).id ?? selProvider) as ProviderId);
      else if (col === 1) pickFamily(step(families, selFamily, dir).key ?? selFamily);
      else {
        const usableList = familyModels.filter(usable);
        const nx = step(usableList, focusId, dir);
        if (nx?.id) setFocusId(nx.id);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (col === 2) choose(focusId);
      else setCol((c) => (c + 1) as 0 | 1 | 2);
    }
  };

  return {
    query, setQuery, price, setPrice,
    providers, families, familyModels, results,
    selProvider, selFamily, focusId, setFocusId, col, setCol,
    inputRef, focusRef, reasonOf, pickProvider, pickFamily, choose, onKeyDown,
  };
}
