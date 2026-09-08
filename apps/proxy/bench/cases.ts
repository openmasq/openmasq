// The utility corpus: coding-agent questions whose answer is checkable, over text that a
// developer really does paste into an agent. Each case is self-contained (no file system, no
// tools) so the run is cheap and reproducible, and each ORACLE targets one property the
// masking may destroy — the value itself, or the class it belongs to.
//
// Entirely synthetic: invented hosts, documentation IBANs, invented people.

export interface BenchCase {
  id: string;
  /** What the masking must preserve for the answer to survive. */
  probes: "value" | "relation" | "class" | "count";
  prompt: string;
  /** True when the answer is right. Receives the model's text, lowercased. */
  expect: (answer: string) => boolean;
  /** Read by the report to explain a failure. */
  want: string;
}

const has =
  (...needles: string[]) =>
  (a: string) =>
    needles.some((n) => a.includes(n.toLowerCase()));
const answersYes = (a: string) => /\b(oui|yes)\b/.test(a) && !/\bnon\b|\bno\b/.test(a.slice(0, 40));

export const CASES: BenchCase[] = [
  {
    id: "ip-most-frequent",
    probes: "value",
    want: "192.168.1.42",
    prompt:
      "Voici un extrait de journal.\n" +
      "10.0.5.7 - GET /health 200\n" +
      "192.168.1.42 - GET /api/orders 200\n" +
      "10.0.5.99 - GET /health 200\n" +
      "192.168.1.42 - POST /api/orders 201\n" +
      "192.168.1.42 - GET /api/orders 200\n\n" +
      "Quelle adresse IP revient le plus souvent ? Réponds uniquement par l'adresse.",
    expect: has("192.168.1.42"),
  },
  {
    id: "ip-same-subnet",
    probes: "relation",
    want: "oui (10.0.5.7 et 10.0.5.99 partagent le /24)",
    prompt:
      "Les adresses 10.0.5.7 et 10.0.5.99 appartiennent-elles au même sous-réseau /24 ? " +
      "Réponds uniquement par oui ou non.",
    expect: answersYes,
  },
  {
    id: "ip-private-range",
    probes: "class",
    want: "privée (RFC 1918)",
    prompt:
      "L'adresse 192.168.1.42 est-elle une adresse privée au sens de la RFC 1918, ou une adresse publique ? " +
      "Réponds par un seul mot : privée ou publique.",
    expect: (a) => has("privé", "private")(a) && !has("publique", "public")(a),
  },
  {
    id: "path-from-trace",
    probes: "value",
    want: "/srv/atelier/api/handlers/orders.ts:214",
    prompt:
      "Voici une trace d'erreur.\n" +
      "TypeError: cannot read property 'total' of undefined\n" +
      "    at buildInvoice (/srv/atelier/api/handlers/orders.ts:214:19)\n" +
      "    at processQueue (/srv/atelier/api/queue.ts:88:7)\n\n" +
      "Dans quel fichier et à quelle ligne l'erreur est-elle levée ? Réponds au format chemin:ligne.",
    expect: (a) => a.includes("/srv/atelier/api/handlers/orders.ts") && a.includes("214"),
  },
  {
    id: "path-test-or-source",
    probes: "class",
    want: "le fichier de test (orders.test.ts)",
    prompt:
      "Parmi ces deux fichiers, lequel est le fichier de test ?\n" +
      "  /srv/atelier/api/handlers/orders.ts\n" +
      "  /srv/atelier/api/handlers/orders.test.ts\n" +
      "Réponds uniquement par le chemin.",
    expect: (a) => a.includes("orders.test.ts"),
  },
  {
    id: "iban-country",
    probes: "class",
    want: "France",
    prompt:
      "De quel pays provient l'IBAN FR7630006000011234567890189 ? Réponds uniquement par le nom du pays.",
    expect: has("france", "français"),
  },
  {
    id: "phone-mobile-or-landline",
    probes: "class",
    want: "mobile (préfixe 06)",
    prompt:
      "Le numéro +33 6 12 34 56 78 est-il un mobile ou une ligne fixe, en France ? " +
      "Réponds par un seul mot : mobile ou fixe.",
    expect: (a) => has("mobile", "portable")(a) && !has("fixe", "landline")(a),
  },
  {
    id: "email-distinct-domains",
    probes: "count",
    want: "2 domaines",
    prompt:
      "Voici une fixture de test.\n" +
      "  clara.vermeil@atelier-sud.fr\n" +
      "  noe.tallard@atelier-sud.fr\n" +
      "  service@bureau-nord.fr\n\n" +
      "Combien de domaines distincts ? Réponds uniquement par le chiffre.",
    expect: (a) => /\b(2|deux)\b/.test(a),
  },
  {
    id: "people-count",
    probes: "count",
    want: "3 personnes",
    prompt:
      "Combien de personnes distinctes sont citées dans cette note ? Réponds uniquement par le chiffre.\n" +
      "« Clara Vermeil a préparé le dossier, Noé Tallard l'a relu, et Clara Vermeil l'a transmis " +
      "à Iris Bonnefoy pour la mise en production. »",
    expect: (a) => /\b(3|trois)\b/.test(a),
  },
  {
    id: "ip-loopback",
    probes: "class",
    want: "oui, c'est l'adresse de boucle locale",
    prompt:
      "Le service écoute sur 127.0.0.1. Cette adresse désigne-t-elle la machine elle-même (boucle locale) ? " +
      "Réponds uniquement par oui ou non.",
    expect: answersYes,
  },
  {
    id: "ip-in-cidr",
    probes: "relation",
    want: "oui (10.0.5.7 est dans 10.0.5.0/24)",
    prompt:
      "L'adresse 10.0.5.7 appartient-elle au bloc 10.0.5.0/24 ? Réponds uniquement par oui ou non.",
    expect: answersYes,
  },
  {
    id: "ipv6-link-local",
    probes: "class",
    want: "lien-local (fe80::/10)",
    prompt:
      "L'adresse IPv6 fe80::1a2b:3c4d:5e6f:7a8b est-elle une adresse de lien local ou une adresse globale ? " +
      "Réponds par un seul mot : locale ou globale.",
    expect: (a) => has("local", "lien")(a) && !has("globale", "global")(a),
  },
  {
    id: "email-tld",
    probes: "class",
    want: ".fr",
    prompt:
      "Quelle est l'extension de premier niveau de l'adresse clara.vermeil@atelier-sud.fr ? " +
      "Réponds uniquement par l'extension.",
    expect: (a) => /(^|[^a-z])\.?fr([^a-z]|$)/.test(a), // ".fr" or a bare "fr"
  },
  {
    id: "domain-tld",
    probes: "class",
    want: "un domaine en .fr",
    prompt:
      "Le service tourne sur le domaine atelier-sud.fr. Quelle est son extension de premier niveau ? " +
      "Réponds uniquement par l'extension.",
    expect: has(".fr", "fr"),
  },
];

/** The proxy configurations compared, `clear` being the no-proxy baseline. */
export interface BenchConfig {
  id: string;
  /** Extra flags for the proxy; `null` means: do not start a proxy at all. */
  flags: string[] | null;
  label: string;
}

export const CONFIGS: BenchConfig[] = [
  { id: "clear", flags: null, label: "no proxy (baseline)" },
  { id: "standard", flags: [], label: "--level standard (default)" },
  { id: "coding", flags: ["--disable", "path,ip"], label: "standard --disable path,ip" },
  { id: "renforce", flags: ["--level", "renforce"], label: "--level renforce" },
];
