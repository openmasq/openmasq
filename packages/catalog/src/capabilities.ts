// The org-console CAPABILITY keys — the governance vocabulary a CUSTOM role's
// capability map is expressed over. The backend VALIDATES a custom-role payload
// against this exact set (features/teams) and the web roles matrix RENDERS it, so
// it is single-sourced here (rule 9) — the fourth governable list alongside models,
// MCP connectors and redaction categories. ⚠️ ADVISORY governance metadata only:
// real RBAC is `requireOrgRole` over the fixed `org_role` enum (owner/admin/member),
// NOT these caps. UI-free (no labels) — presentation lives in the consumer.
export const CAP_KEYS = ["members", "teams", "billing", "policy", "models", "audit"] as const;
export type CapKey = (typeof CAP_KEYS)[number];
