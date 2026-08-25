/**
 * `index.html` est statique (il ne peut pas importer `@openmasq/branding`) : le nom et
 * le domaine de la marque y sont des jetons `%BRAND_NAME%` / `%BRAND_DOMAIN%`, substitués
 * par ce plugin — en dev comme au build. `src/renderer/csp.test.ts` applique la MÊME
 * substitution avant de vérifier la CSP, pour tester ce que le bundle sert vraiment.
 *
 * `%SUPABASE_CSP%` : les origines du projet Supabase du BUILD (https + wss), dérivées de
 * `OPENMASQ_SUPABASE_URL` par `supabaseCspEntries` — plus aucun projet committé. Vide ⇒
 * le jeton s'efface et la CSP n'autorise AUCUN hôte Supabase (l'app tourne sans comptes).
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
