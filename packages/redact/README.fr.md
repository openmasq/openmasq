# @openmasq/redact — masquage réversible des données personnelles pour les prompts LLM

<sub>[English](https://github.com/openmasq/openmasq/blob/main/packages/redact/README.md) · **Français** · [openmasq.com/redact](https://openmasq.com/redact)</sub>

Détecte les données sensibles d'un prompt, les remplace par des **faux crédibles** avant
qu'elles n'atteignent le modèle, et **restaure les vraies valeurs** dans la réponse. Hors
ligne, TypeScript, aucun réseau dans le cœur. C'est le moteur d'[OpenMasq](https://openmasq.com),
l'application de bureau LLM qui protège vos données.

```bash
npm install @openmasq/redact
```

```ts
import { pseudonymize, unredact } from "@openmasq/redact";

const vault = {};                                         // le vôtre : gardez-le, ne l'envoyez jamais
const { text } = await pseudonymize(prompt, { vault });  // ce que voit le modèle
const reply = await callYourLLM(text);
const restored = unredact(reply, vault);                  // ce que voit l'utilisateur
```

## Ce que voit le modèle

Une entrée, trois modes (sortie réelle de la `0.1.0`) :

```text
entrée       Hi, I'm Jean Dupont. Mail jean.dupont@example.org, phone +33 6 12 34 56 78,
             IBAN FR76 3000 6000 0112 3456 7890 189, server 10.0.12.7

pseudonymize Hi, I'm Basile Delsart. Mail basile.delsart@melvio.com, phone +33 6 50 11 00 45,
             IBAN FR76 1050 8147 1788 2958 0420 560, server 10.161.175.138

mode: token  Hi, I'm [PERSON1]. Mail [EMAIL1], phone [PHONE1], IBAN [IBAN1], server [IP1]

redact       Hi, I'm Jean Dupont. Mail [REDACTED_EMAIL_1], phone [REDACTED_PHONE_1],
             IBAN [REDACTED_IBAN_1], server [REDACTED_IP_1]
```

- **Les faux gardent la forme** : un faux IBAN passe la clé de contrôle, un faux numéro de
  téléphone est valide, un faux prénom garde son genre. Le modèle raisonne sur des données
  plausibles, sa réponse reste utile.
- **Les jetons** (`mode: "token"`) laissent le moins fuiter — un faux code postal désigne encore
  une région — au prix d'un peu de qualité de réponse.
- **`redact`** est la passe synchrone, règles seules. `pseudonymize` y ajoute la détection des
  noms et du contexte, et la NER locale optionnelle.

## Le coffre

Un `Vault` est un simple objet JSON : substitut → vraie valeur. Passez le même à chaque tour
d'une conversation : une valeur garde **un seul** substitut du début à la fin, le modèle peut y
faire référence, et `unredact` la restaure partout — dans le texte, dans les arguments JSON
d'un appel d'outil (`unredactArgs`), dans une date reformatée.

**Le coffre est la donnée sensible.** Le moteur ne le stocke ni ne l'envoie jamais : gardez-le
en mémoire, chiffrez-le au repos, ne le mettez jamais dans un prompt ni dans un log.

## Ce qui est détecté

| Catégorie | Exemples | Détecté par |
|---|---|---|
| `secret`, `apikey` | clés d'API (OpenAI, Anthropic, AWS, GitHub, Slack…), JWT, clés privées, chaînes de connexion, cookies | règles |
| `email`, `phone`, `ip`, `url`, `path`, `username` | adresses, numéros validés par libphonenumber, IPv4/6, chemins de fichiers, `@pseudos` | règles |
| `card`, `iban`, `national_id`, `company_id` | validés par clé de contrôle (Luhn, IBAN mod-97…), SSN / NIR, SIREN / TVA | règles |
| `dob`, `date` | dates de naissance (étiquetées), autres dates — **sur demande** (voir plus bas) | règles + modèle |
| `name`, `company`, `address`, `location` | personnes, organisations, adresses postales, villes et lieux | **modèle** + règles pour les formes ancrées |

Les listes sont d'abord réglées pour le français et l'anglais ; les adresses couvrent
FR/EN/DE/ES/IT/PT/NL et le CJK. Les personnalités et marques connues restent lisibles
(désactivable avec `peopleNotoriety: false`).

## Choisir ce qu'on masque

`disabledKinds` liste les catégories à **laisser en clair** ; tout le reste est masqué, donc une
catégorie ajoutée dans une version future est masquée par défaut.

```ts
await pseudonymize(text, { vault, disabledKinds: ["url", "path"] });
```

Les dates ordinaires sont la seule exception : elles ne sont masquées que si `disabledKinds` est
fourni et ne contient pas `"date"` — un appel nu ne masque jamais une date simple. Autres
options : `keep` (valeurs exactes jamais masquées), `forced` (une valeur masquée dans une
catégorie), `secrets` (chaînes exactes toujours masquées), `numbers` (remplace aussi les
nombres isolés).

## Échouer fermé : les noms exigent un modèle

Noms, entreprises, adresses, lieux et dates de naissance (`MODEL_CATEGORIES`) n'ont pas de forme
qu'une règle reconnaisse de façon fiable ; les règles n'en attrapent que les formes ancrées.
Quand l'une d'elles est active, faites tourner un détecteur à modèle — ou refusez la passe
plutôt que d'envoyer un texte à moitié masqué :

```ts
import { pseudonymize, requiresModel, detectLocalNer } from "@openmasq/redact";
import { createNerPredict } from "@openmasq/redact/ner"; // + @huggingface/transformers, onnxruntime-node

const predict = await createNerPredict();                 // à charger une fois, puis réutiliser
const detectLocal = (t: string) =>
  detectLocalNer(t, predict, { onError: (err) => { throw err; } }); // faire remonter l'échec

const res = await pseudonymize(text, { vault, disabledKinds, detectLocal });
// Un détecteur en échec NE fait PAS échouer la passe : elle continue sur les règles et le dit.
if (res.modelError && requiresModel(disabledKinds)) throw new Error(`non envoyé : ${res.modelError}`);
```

Sans aucun détecteur, testez `requiresModel(disabledKinds)` avant la passe et refusez s'il
renvoie vrai.

`createNerPredict()` charge `openmasq/ner-multilingual` depuis Hugging Face, épinglé à un commit
relu (`NER_REVISIONS`). En production, téléchargez-le une fois, vérifiez chaque fichier contre
`NER_WEIGHTS_SHA256`, et chargez-le hors ligne (`modelName` + `allowLocalModels`).

## Banc d'essai

F1 au caractère sur les catégories ci-dessus, un seul correcteur pour tous les moteurs,
rejouable hors ligne.
[Méthode complète, la mesure plus stricte « chaque mention » et les manques par catégorie →](https://github.com/openmasq/openmasq/tree/main/packages/redact/bench/spans)

| corpus | cas | règles seules | règles + NER locale | Presidio + spaCy |
|---|---:|---:|---:|---:|
| OpenMasq (FR, synthétique) | 907 | 0,931 | 0,923 | 0,547 |
| TAB | 127 | 0,425 | **0,855** | 0,815 |
| Gretel | 2000 | 0,575 | **0,646** | 0,422 |
| ai4privacy | 2000 | 0,756 | 0,827 | 0,579 |
| Nemotron | 2000 | 0,627 | **0,928** | 0,768 |

À lire honnêtement : **les bons scores exigent la NER** ; les règles seules sont sous Presidio
sur TAB et Nemotron. Un autre détecteur, PII-Tracer, fait mieux sur ai4privacy (0,952). Le F1
donne des points partiels — quand chaque mention d'une valeur doit être trouvée, TAB tombe à 49 %.

## Entrées et dépendances optionnelles

L'entrée principale ne dépend que de `libphonenumber-js` et `fflate`. Les autres demandent des
dépendances optionnelles à installer vous-même :

| Entrée | Pour | À installer |
|---|---|---|
| `@openmasq/redact` | texte : détecter, masquer, restaurer | — |
| `/ner` | NER locale | `@huggingface/transformers`, `onnxruntime-node` |
| `/documents`, `/documents.browser` | texte de PDF, DOCX, XLSX | `pdfjs-dist`, `mammoth`, `@napi-rs/canvas` (Node), `xlsx` ≥ 0.20.3 depuis le [CDN officiel SheetJS](https://cdn.sheetjs.com) |
| `/inplace` | masquer un DOCX/XLSX en gardant son format | `xlsx` (idem) |
| `/pdf-redact`, `/image-redact` | peindre les masques sur un PDF ou un scan | `pdfjs-dist`, `@napi-rs/canvas` (Node) |

L'OCR des scans n'est pas encore publié : un document qui en a besoin échoue avec une
`DocumentError` de code `ocr_engine_missing` ; les couches texte s'extraient normalement.

## Versions

`0.x` : une version mineure peut changer l'API. La détection s'améliore d'une version à
l'autre — la même entrée peut être masquée différemment après une mise à jour. Épinglez une
version exacte si vous avez besoin d'une sortie stable.

## Contribuer

Le moteur vit dans le [monorepo OpenMasq](https://github.com/openmasq/openmasq) — l'application
consomme ce paquet depuis les sources. `src/engine/` contient les règles, les faux et le coffre ;
`src/model/` le pipeline de candidats et les vocabulaires ; `src/__cases__/` le corpus de
non-régression ; `bench/` les bancs publics. `pnpm test:redact` est la voie rapide : la suite
est la spécification, et une règle sans cas n'est pas finie.

Apache-2.0 © OpenMasq
