/**
 * `index.html` is static (it can't import `@openmasq/branding`): the brand's name and
 * domain are `%BRAND_NAME%` / `%BRAND_DOMAIN%` tokens there, substituted
 * by this plugin — in dev as at build. `src/renderer/csp.test.ts` applies the SAME
 * substitution before checking the CSP, to test what the bundle actually serves.
 *
 * `%SUPABASE_CSP%`: the BUILD's Supabase project origins (https + wss), derived from
 * `OPENMASQ_SUPABASE_URL` by `supabaseCspEntries` — no more committed project. Empty ⇒
 * the token clears and the CSP allows NO Supabase host (the app runs without accounts).
 */
export function supabaseCspEntries(supabaseUrl: string | undefined): string {
  const u = (supabaseUrl ?? "").trim();
  if (!u) return "";
  const host = new URL(u).host;
  return `https://${host} wss://${host}`;
}

export function brandIndexHtml(brand: { name: string; domain: string }, supabaseUrl?: string) {
  return {
    name: "openmasq-brand-index-html",
    transformIndexHtml: (html: string) =>
      html
        .replaceAll("%BRAND_NAME%", brand.name)
        .replaceAll("%BRAND_DOMAIN%", brand.domain)
        .replaceAll("%SUPABASE_CSP%", supabaseCspEntries(supabaseUrl)),
  };
}
