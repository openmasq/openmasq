import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { ChatStore } from "../../state/store";

/**
 * External-store BRIDGE over the hand-rolled `useChatStore()` hook.
 *
 * The chat store lives in a `useState`-based hook high in the tree, so ANY change (incl.
 * every streamed token) re-renders its whole subtree. This bridge lets a LEAF subscribe to
 * just the SLICE it needs and re-render ONLY when that slice changes — so a `React.memo`'d
 * leaf reading via {@link useChatSelector} is DECOUPLED from that per-token cascade. It's
 * the same mechanism react-redux uses (`useSyncExternalStore` + a memoised selector),
 * applied to the EXISTING store WITHOUT rewriting it — the incremental foundation for
 * removing chat-store prop-drilling (see `useSectionNav` for the redux-side equivalent).
 *
 * Constraint: a `selector` must return a STABLE reference while its value is unchanged, so
 * pass {@link shallowEqual} for object/array slices (a fresh `{a,b}` each call otherwise
 * looks changed and defeats the bail-out).
 */
interface Bridge {
  get: () => ChatStore;
  subscribe: (cb: () => void) => () => void;
}

const Ctx = createContext<Bridge | null>(null);

export function ChatStoreProvider({ store, children }: { store: ChatStore; children: ReactNode }) {
  // Latest snapshot, refreshed on EVERY render before children read it (no tearing).
  const snap = useRef(store);
  snap.current = store;
  const listeners = useRef<Set<() => void> | null>(null);
  if (!listeners.current) listeners.current = new Set();
  const bridge = useRef<Bridge | null>(null);
  if (!bridge.current) {
    bridge.current = {
      get: () => snap.current,
      subscribe: (cb) => {
        listeners.current!.add(cb);
        return () => listeners.current!.delete(cb);
      },
    };
  }
  // The store is a fresh object each hook render, so this component re-rendered ⇒ notify
  // subscribers AFTER commit so their memoised getSnapshot re-selects (and bails out unless
  // their slice actually changed).
  useEffect(() => {
    for (const l of listeners.current!) l();
  });
  return <Ctx.Provider value={bridge.current}>{children}</Ctx.Provider>;
}

/**
 * Subscribe to a SLICE of the chat store. Re-renders only when `selector`'s result changes
 * (by `isEqual`, default `Object.is`; pass {@link shallowEqual} for an object/array slice).
 */
export function useChatSelector<T>(
  selector: (s: ChatStore) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  const bridge = useContext(Ctx);
  if (!bridge) throw new Error("useChatSelector must be used within a <ChatStoreProvider>");
  // Cache the last selection so getSnapshot returns a STABLE reference while unchanged —
  // required by useSyncExternalStore (an ever-fresh snapshot loops). Selector/equality are
  // read via refs so an inline selector doesn't churn the (stable) getSnapshot identity.
  const cache = useRef<{ has: boolean; value: T }>({ has: false, value: undefined as never });
  const selRef = useRef(selector);
  selRef.current = selector;
  const eqRef = useRef(isEqual);
  eqRef.current = isEqual;
  const getSnapshot = useCallback(() => {
    const next = selRef.current(bridge.get());
    if (cache.current.has && eqRef.current(cache.current.value, next)) return cache.current.value;
    cache.current = { has: true, value: next };
    return next;
  }, [bridge]);
  return useSyncExternalStore(bridge.subscribe, getSnapshot, getSnapshot);
}

/**
 * Shallow equality for object/array slices, so a selector returning a fresh `{a,b}` each
 * call still bails out when the values are unchanged. Pure + unit-tested.
 */
export function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) return false;
  const ka = Object.keys(a as Record<string, unknown>);
  const kb = Object.keys(b as Record<string, unknown>);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  }
  return true;
}
