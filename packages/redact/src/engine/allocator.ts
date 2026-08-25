import type { Vault } from "../types";

export interface Allocator {
  /** Map a value to its (stable) placeholder, creating one under `label` if new. */
  ensure(label: string, value: string): string;
  /** value -> placeholder, seeded from the vault. */
  reverse: Map<string, string>;
}

/**
 * Build a placeholder allocator backed by `vault`. Placeholders are stable: a
 * value already present in the vault keeps its placeholder, and counters resume
 * from the highest index seen so new placeholders never collide. The vault is
 * mutated in place as new values are registered.
 */
export function makeAllocator(vault: Vault): Allocator {
  const reverse = new Map<string, string>(); // value -> placeholder
  const counters = new Map<string, number>(); // label -> highest index used
  for (const [placeholder, value] of Object.entries(vault)) {
    reverse.set(value, placeholder);
    const m = placeholder.match(/^\[REDACTED_(.+)_(\d+)\]$/);
    if (m) {
      counters.set(m[1], Math.max(counters.get(m[1]) ?? 0, Number(m[2])));
    }
  }
  const ensure = (label: string, value: string): string => {
    let placeholder = reverse.get(value);
    if (!placeholder) {
      const n = (counters.get(label) ?? 0) + 1;
      counters.set(label, n);
      placeholder = `[REDACTED_${label}_${n}]`;
      reverse.set(value, placeholder);
      vault[placeholder] = value;
    }
    return placeholder;
  };
  return { ensure, reverse };
}
