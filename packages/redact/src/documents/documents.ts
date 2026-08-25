// Node entry (@openmasq/redact/documents) — the public API is unchanged; the
// implementation moved into ./documents/ (shared `core` + a `node` binding), so
// the browser binding (./documents/browser) can reuse the SAME dispatch without
// duplicating it. Desktop importers keep using this path exactly as before.
export * from "./node";
