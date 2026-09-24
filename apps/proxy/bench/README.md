# The proxy's utility bench

<sub>**English** · [Français](#le-banc-dutilité-du-proxy) · [openmasq.com](https://openmasq.com)</sub>

The detection benches (`packages/redact/bench`) score what the engine **catches**. This one
scores what an answer still gets **right** once it is caught. The same coding-agent question is
asked through each proxy configuration and once with no proxy at all; the gap between a
configuration and that baseline is what the protection costs.

```bash
pnpm --filter @openmasq/proxy build   # the bench runs the built server
pnpm bench:proxy                      # every case, every configuration
pnpm bench:proxy --cases 3            # a cheap smoke run
pnpm bench:proxy --configs clear,coding
pnpm bench:proxy --model sonnet       # opus by default
```

⚠️ Every case is a real `claude -p` call **on your own subscription**. Nothing here reads an
API key. A full run is `cases × configurations` calls.

- **Cases** (`cases.ts`) — self-contained questions over text a developer really pastes into an
  agent: a log with addresses, a stack trace, a fixture, a note. No tools, no file system, so a
  run is reproducible and cheap. Entirely synthetic: invented hosts and people, documentation
  IBANs.
- **What each case probes** — the property the masking may destroy. `value` (the exact string
  comes back), `relation` (two values still relate, e.g. one `/24`), `class` (the substitute
  belongs to the same family: private stays private, a French mobile stays a French mobile),
  `count` (distinct things stay distinct).
- **Configurations** (`CONFIGS`) — `clear` is the baseline with no proxy; then the default
  level, the coding preset (`--disable path,ip`) and `renforce`.
- **The agent** (`harness.ts`) — `claude -p` in an empty temporary directory, tools disallowed,
  one turn. The bench measures what the masking does to an answer, not what an agent does to a
  repository.
- **Reports** — `evals-reports/_proxy-utility/<stamp>.{md,json}` (gitignored), with a diff
  against the previous run, like the agentic bench.

A `class` failure matters more than a `value` failure: a wrong search returns nothing and is
visible, whereas a substitute from the wrong family makes the model **confidently wrong**.

---

# Le banc d'utilité du proxy

<sub>[English](#the-proxys-utility-bench) · **Français** · [openmasq.com](https://openmasq.com)</sub>

Les bancs de détection (`packages/redact/bench`) mesurent ce que le moteur **attrape**.
Celui-ci mesure ce qu'une réponse garde de **juste** une fois la donnée attrapée. La même
question d'agent de code est posée à travers chaque configuration du proxy, puis sans proxy du
tout ; l'écart entre une configuration et cette référence est le coût de la protection.

```bash
pnpm --filter @openmasq/proxy build   # le banc exécute le serveur compilé
pnpm bench:proxy                      # tous les cas, toutes les configurations
pnpm bench:proxy --cases 3            # un essai bon marché
pnpm bench:proxy --configs clear,coding
pnpm bench:proxy --model sonnet       # opus par défaut
```

⚠️ Chaque cas est un vrai appel `claude -p` **sur votre abonnement**. Aucune clé API n'est lue
ici. Une exécution complète coûte `cas × configurations` appels.

- **Cas** (`cases.ts`) — des questions autonomes sur du texte qu'un développeur colle vraiment
  dans un agent : un journal avec des adresses, une trace d'erreur, une fixture, une note. Sans
  outils ni système de fichiers, donc reproductible et bon marché. Entièrement synthétique.
- **Ce que chaque cas éprouve** — la propriété que le masquage peut détruire. `value` (la chaîne
  exacte revient), `relation` (deux valeurs restent liées, un même `/24`), `class` (le substitut
  reste de la même famille : une adresse privée reste privée, un mobile français reste un mobile
  français), `count` (les choses distinctes le restent).
- **L'agent** (`harness.ts`) — `claude -p` dans un dossier temporaire vide, outils interdits, un
  seul tour : on mesure l'effet du masquage sur une réponse, pas l'effet d'un agent sur un dépôt.
- **Rapports** — `evals-reports/_proxy-utility/` (ignoré par git), avec un diff contre la
  précédente exécution, comme le banc agentique.

Un échec de `class` est plus grave qu'un échec de `value` : une recherche fausse ne rend rien et
se voit, alors qu'un substitut de la mauvaise famille rend le modèle **faux avec assurance**.
