import type { Bucketers, CleanEvent } from "./types";

/**
 * Build the `sanitize` walk from an app's allow-list + bucketers. Reduces a typed
 * event to `{ name, props }`, keeping ONLY allow-listed keys, bucketing the flagged
 * numeric ones, and dropping anything that isn't a primitive or a string[] — so no
 * object/free-form content can slip through even if a (mis-cast) call site attaches
 * it. Unknown event names yield no props.
 */
export function makeSanitize<E extends { name: string }>(opts: {
  allowed: Record<string, readonly string[]>;
  bucketers?: Bucketers;
}): (event: E) => CleanEvent {
  const { allowed, bucketers } = opts;
  return (event: E): CleanEvent => {
    const keys = allowed[event.name] ?? [];
    const src = event as unknown as Record<string, unknown>;
    const props: CleanEvent["props"] = {};
    for (const key of keys) {
      const value = src[key];
      if (value === undefined || value === null) continue;
      const b = bucketers?.[key];
      if (b && typeof value === "number") {
        props[key] = b(value);
      } else if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        props[key] = value;
      } else if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
        props[key] = value as string[];
      }
      // anything else (objects, functions…) is dropped — content can't slip through
    }
    return { name: event.name, props };
  };
}
