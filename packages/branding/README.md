# @openmasq/branding — the one home of the brand

`branding.json` holds the name, domains, URL scheme and storage keys; `BRAND`,
`brandHost`, `brandUrl`, `brandKey`, `brandHeader` derive every runtime, wire and disk
value from it. Nothing else in the repository spells the brand as a literal — the
`check:brand` gate guards the retired names.
