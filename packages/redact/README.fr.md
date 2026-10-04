# @openmasq/redact — masquage réversible des données personnelles pour les prompts LLM

**[Guide développeur](https://help.openmasq.com/fr/redact)** · [Site](https://openmasq.com/fr/redact) · [Banc d'essai](https://github.com/openmasq/openmasq/tree/main/packages/redact/bench/spans) · [English](https://github.com/openmasq/openmasq/blob/main/packages/redact/README.md)

Détecte les données sensibles d'un prompt, les remplace par des **faux crédibles** avant
qu'elles n'atteignent le modèle, et **restaure les vraies valeurs** dans la réponse. Hors
ligne, TypeScript, aucun réseau dans le cœur. C'est le moteur d'[OpenMasq](https://openmasq.com/fr),
l'application de bureau LLM qui protège vos données.

```bash
npm install @openmasq/redact
```

## Démarrage

```ts
import { pseudonymize, unredactReply } from "@openmasq/redact";

const vault = {};                                         // un par conversation — gardez-le, ne l'envoyez jamais
const { text } = await pseudonymize(
  "Write to Claire Martin (claire.martin@acme.fr) about invoice FR76 3000 6000 0112 3456 7890 189.",
  { vault },
);
// text → "Write to Eulalie Fressineau (eulalie.fressineau@courlys.fr) about invoice FR76 1050 8147 1788 2958 0420 560."

const reply = await callYourLLM(text);                    // "Dear Eulalie Fressineau, …"
const shown = unredactReply(reply, vault);                // "Dear Claire Martin, …"
```

## Ce que voit le modèle

```text
entrée       Hi, I'm Jean Dupont. Mail jean.dupont@example.org, phone +33 6 12 34 56 78,
             IBAN FR76 3000 6000 0112 3456 7890 189, server 10.0.12.7

pseudonymize Hi, I'm Basile Delsart. Mail basile.delsart@melvio.com, phone +33 6 50 11 00 45,
             IBAN FR76 1050 8147 1788 2958 0420 560, server 10.161.175.138

mode: token  Hi, I'm [PERSON1]. Mail [EMAIL1], phone [PHONE1], IBAN [IBAN1], server [IP1]

redact       Hi, I'm Jean Dupont. Mail [REDACTED_EMAIL_1], phone [REDACTED_PHONE_1],
             IBAN [REDACTED_IBAN_1], server [REDACTED_IP_1]
```

- **Les faux gardent la forme** : un faux IBAN passe le mod-97, une fausse carte passe Luhn, un
  faux numéro est valide, un faux email correspond au faux nom. Le modèle raisonne sur des
  données plausibles.
- **Les jetons** (`mode: "token"`) laissent le moins fuiter, au prix d'un peu de qualité.
- **`redact`** est synchrone et ne fait que les règles — pas de détection des noms, comme le
  montre la sortie.

## Exemples

Chaque exemple est raccourci d'un script exécuté sur cette version ; les sorties sont réelles.

### Une conversation : un coffre, un sel

Une valeur garde **un seul** substitut pendant toute la conversation : le modèle peut y revenir.

```ts
import { pseudonymize, unredactReply, type Vault } from "@openmasq/redact";
import { randomInt } from "node:crypto";

const conv = { vault: {} as Vault, salt: randomInt(1, 2 ** 31) }; // à stocker avec la conversation

await pseudonymize("Book a table for Lucas Bernard.", { vault: conv.vault, salt: conv.salt });
// → "Book a table for Aymeric Bouchereau."
await pseudonymize("Also invite Lucas Bernard's sister.", { vault: conv.vault, salt: conv.salt });
// → "Also invite Aymeric Bouchereau's sister."            même faux, tour suivant

const saved = JSON.stringify(conv);  // à persister CHIFFRÉ : le coffre contient les vraies valeurs
```

Le `salt` rend la correspondance valeur → faux propre à cette conversation ; sans lui, c'est un
hachage déterministe et public.

### Appels d'outils : les vraies valeurs sortent, les résultats reviennent masqués

```ts
import { pseudonymize, unredactArgs } from "@openmasq/redact";

// Le modèle appelle un outil avec le faux qu'il a vu. Restaurez les VRAIES valeurs avant d'exécuter :
const args = JSON.parse(unredactArgs(toolCall.arguments, vault));   // { from: "paul.durand@example.com" }
const result = await searchMail(args);

// Masquez la réponse de l'outil avec le MÊME coffre avant que le modèle ne la lise :
const { text } = await pseudonymize(result, { vault });
// "3 emails from firmin.guilbaud@orbisel.nl, last one signed by Firmin Guilbaud, +33 6 50 11 00 45"
```

`unredactReply` sert à **afficher** une réponse (il répare aussi les faux légèrement modifiés
par le modèle) ; `unredactArgs` sert aux **arguments envoyés à un vrai outil** (exact, formes
encodées en URL comprises, jamais de supposition).

### Choisir ce qu'on masque

```ts
const r = await pseudonymize(
  "Ticket from Camille Laurent at Acme Corp, see https://help.acme.io. Key: sk-live-4f9a8b7c6d5e4f3a2b1c",
  {
    vault,
    disabledKinds: ["url"],                    // catégories laissées EN CLAIR — tout le reste est masqué
    keep: ["Acme"],                            // valeurs jamais masquées, telles que détectées (voir r.matches)
    secrets: ["sk-live-4f9a8b7c6d5e4f3a2b1c"], // chaînes exactes toujours masquées
  },
);
// "Ticket from Sidonie Mabille at Acme Corp, see https://help.acme.io. Key: sk-live-3a3g7g1q5i9u5i5e7s9s"
// r.matches → NAME: Camille Laurent → Sidonie Mabille · API_KEY: sk-live-4f9a… → sk-live-3a3g…
```

- Une catégorie ajoutée dans une version future est masquée par défaut.
- **Les dates ordinaires** sont la seule exception : elles ne sont masquées que si
  `disabledKinds` est fourni et ne contient pas `"date"`. Un appel nu ne masque jamais une date.
- `keep` compare la valeur **telle que détectée** : ici le moteur détecte « Acme », donc
  « Acme Corp » ne correspondrait pas. Regardez `r.matches`.

### Nettoyer les logs et les rapports d'erreur

```ts
import { redactText } from "@openmasq/redact";

redactText("POST /login user=marc@example.org token=eyJhbGciOi… from 192.168.1.24");
// "POST /login user=[REDACTED_EMAIL_1] token=[REDACTED_JWT_1] from [REDACTED_IP_1]"
```

### Montrer à l'utilisateur ce qui a été masqué

```ts
import { pseudonymize, toSegments, redactionCategory } from "@openmasq/redact";

const { matches } = await pseudonymize(original, { vault });
const kinds = Object.fromEntries(matches.map((m) => [m.value, redactionCategory(m.category ?? m.type)]));
for (const s of toSegments(original, vault, kinds)) render(s); // { kind: "text" | "redaction", value, label }
// Send the contract to [Inès Moreau · name], [ines.moreau@example.fr · email]
```

## Les noms exigent un modèle — échouer fermé

Noms, entreprises, adresses, lieux et dates de naissance (`MODEL_CATEGORIES`) n'ont pas de
forme qu'une règle reconnaisse. Sans modèle, seules leurs formes ancrées sont attrapées :
« Camille Laurent » l'est, « Julie Petit » non, et dans « Mme Julie Petit » seul « Julie »
l'est. Faites tourner la NER locale, et refusez d'envoyer quand elle échoue :

```ts
import { pseudonymize, requiresModel, detectLocalNer } from "@openmasq/redact";
import { createNerPredict } from "@openmasq/redact/ner"; // + @huggingface/transformers, onnxruntime-node

const predict = await createNerPredict();                 // à charger une fois, puis réutiliser
const res = await pseudonymize(text, { vault, disabledKinds, detectLocal: (t) => detectLocalNer(t, predict) });

// Un modèle en échec ne fait pas échouer la passe : elle continue sur les règles et le signale.
if (res.modelError) throw new Error(`non envoyé : ${res.modelError}`);
```

Sans aucun détecteur, refusez si `requiresModel(disabledKinds)` est vrai.
`createNerPredict()` télécharge `openmasq/ner-multilingual` depuis Hugging Face, épinglé à un
commit relu. En production, téléchargez-le une fois, vérifiez chaque fichier contre
`NER_WEIGHTS_SHA256`, et chargez-le hors ligne (`modelName` + `allowLocalModels`).
→ [Guide : les noms et la NER](https://help.openmasq.com/fr/redact-ner)

## Documents

```ts
import { extractBytes } from "@openmasq/redact/documents"; // + pdfjs-dist, @napi-rs/canvas ; mammoth pour le DOCX
import { pseudonymize } from "@openmasq/redact";

const file = await extractBytes(bytes, "payslip.pdf", "application/pdf");
if (file.errorCode) throw new Error(file.errorCode);      // l'extraction ne lève jamais : testez-le
const { text } = await pseudonymize(file.text, { vault });
```

**Les scans ne sont pas encore pris en charge.** Une page de PDF courte (moins de 120
caractères), qui contient une image ou des champs de formulaire part à l'OCR, qui n'est pas
publié : le document renvoie alors `errorCode: "ocr_engine_missing"` et aucun texte. `error` est un
message en anglais ; `errorCode` est la valeur stable à tester.
→ [Guide : les documents](https://help.openmasq.com/fr/redact-documents)

## Ce qui est détecté

| Catégorie | Exemples | Détecté par |
|---|---|---|
| `secret`, `apikey` | clés d'API (OpenAI, Anthropic, AWS, GitHub, Slack…), JWT, clés privées, chaînes de connexion, cookies | règles |
| `email`, `phone`, `ip`, `url`, `path`, `username` | adresses, numéros validés par libphonenumber, IPv4/6, chemins de fichiers, `@pseudos` | règles |
| `card`, `iban`, `national_id`, `company_id` | validés par clé de contrôle (Luhn, IBAN mod-97…), SSN / NIR, SIREN / TVA | règles |
| `dob`, `date` | dates de naissance (étiquetées), autres dates — sur demande | règles + modèle |
| `name`, `company`, `address`, `location` | personnes, organisations, adresses postales, villes et lieux | **modèle** + règles pour les formes ancrées |

Réglé d'abord pour le français et l'anglais ; les adresses couvrent FR/EN/DE/ES/IT/PT/NL et le
CJK. Les personnalités et marques connues restent lisibles (`peopleNotoriety: false` les masque
aussi). → [Guide : options et catégories](https://help.openmasq.com/fr/redact-options)

## Banc d'essai

F1 au caractère sur les catégories ci-dessus, un seul correcteur pour tous les moteurs,
rejouable hors ligne.
[Méthode, la mesure plus stricte « chaque mention » et les manques par catégorie →](https://github.com/openmasq/openmasq/tree/main/packages/redact/bench/spans)

| corpus | cas | règles seules | règles + NER locale | Presidio + spaCy |
|---|---:|---:|---:|---:|
| OpenMasq (FR, synthétique) | 907 | 0,931 | 0,923 | 0,547 |
| TAB | 127 | 0,425 | **0,855** | 0,815 |
| Gretel | 2000 | 0,575 | **0,646** | 0,422 |
| ai4privacy | 2000 | 0,756 | 0,827 | 0,579 |
| Nemotron | 2000 | 0,627 | **0,928** | 0,768 |

**Les bons scores exigent la NER** ; les règles seules sont sous Presidio sur TAB et Nemotron.
Un autre détecteur, PII-Tracer, fait mieux sur ai4privacy (0,952). Le F1 donne des points
partiels — quand chaque mention d'une valeur doit être trouvée, TAB tombe à 49 %.

## Entrées et dépendances optionnelles

| Entrée | Pour | À installer |
|---|---|---|
| `@openmasq/redact` | texte : détecter, masquer, restaurer | — (`libphonenumber-js`, `fflate`) |
| `/ner` | NER locale | `@huggingface/transformers`, `onnxruntime-node` |
| `/documents`, `/documents.browser` | texte de PDF, DOCX, XLSX | `pdfjs-dist`, `@napi-rs/canvas` (Node), `mammoth`, `xlsx` ≥ 0.20.3 depuis le [CDN officiel SheetJS](https://cdn.sheetjs.com) |
| `/inplace` | masquer un DOCX/XLSX en gardant son format | `xlsx` (idem) |
| `/pdf-redact`, `/image-redact` | peindre les masques sur un PDF ou une image | `pdfjs-dist`, `@napi-rs/canvas` (Node) |

## FAQ

**Est-ce que quelque chose quitte la machine ?** Non : le cœur ne fait aucun appel réseau.
Seuls l'entrée `/remote`, sur demande, et le premier téléchargement du modèle NER touchent le
réseau.

**Où stocker le coffre ?** Avec la conversation, chiffré au repos. Il associe chaque faux à la
vraie valeur : traitez-le comme la donnée d'origine.

**La sortie change-t-elle d'une version à l'autre ?** Oui — la détection s'améliore. En `0.x`,
une version mineure peut aussi changer l'API. Épinglez une version exacte pour une sortie stable.

Plus de recettes et de détails : **[le guide développeur](https://help.openmasq.com/fr/redact)**.

## Contribuer

Le moteur vit dans le [monorepo OpenMasq](https://github.com/openmasq/openmasq), où
l'application le consomme depuis les sources. `src/engine/` contient les règles, les faux et le
coffre ; `src/model/` le pipeline de candidats ; `src/__cases__/` le corpus de non-régression ;
`bench/` les bancs publics. `pnpm test:redact` est la voie rapide : la suite est la spécification.

Apache-2.0 © OpenMasq
