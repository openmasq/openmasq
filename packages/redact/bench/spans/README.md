# `@openmasq/redact` — the public benchmarks

<sub>**English** · [Français](#openmasqredact--les-bancs-publics) · [openmasq.com](https://openmasq.com)</sub>

How well this engine finds personal data, measured on four public datasets and on our own,
next to two other detectors. Every number here comes from one scorer and replays offline:

```bash
pnpm bench:spans --replay --markdown
```

## What is measured

Three questions, three numbers. They do not rank the engines the same way, and that is the
point of showing all three.

| | what it asks |
|---|---|
| **F1** | Of the characters an engine marked, how many were personal data — and of the personal data, how much did it mark? Partial credit: a name half marked scores half. |
| **contained** | Did it mark the **whole** value? A name with the surname left in clear counts as a miss. |
| **every mention** | Did it mark **every copy** of that value in the document? One copy missed leaks the whole thing. |

The first is how the literature compares detectors, so it is the one that can sit beside
published figures. The last is what a redaction product actually promises.

Two views of every dataset. **All labels** counts everything the annotators marked — the
comparable number. **In scope** counts only what this product claims to redact; plain dates,
countries, occupations and demographics drop out. Precision is the same in both: an engine is
never charged for finding real personal data we chose not to score.

The product is measured as it ships — at its default level, and at Strict.

## The corpora

Five. One we wrote, four public, and only one made of real text.

| | what it is | cases | median length |
|---|---|---:|---:|
| **OpenMasq** | our own: French forms, payslips, deeds, lab results, tool output, OCR damage. Synthetic. | 907 | 125 |
| **TAB** | European Court of Human Rights judgments, annotated by people. **The only real text here.** | 127 | 3 886 |
| **Gretel** | synthetic finance: invoices, statements, and machine formats (MT940, SWIFT, EDI). 7 languages. | 5 594 | 1 306 |
| **ai4privacy** | dense synthetic records, 6 languages. Every value sits beside a label. | 6 000 | 426 |
| **Nemotron** | English documents across 50 industries, 55 label types. | 6 000 | 752 |

Three of them need a caveat before you read their numbers.

- **TAB** was annotated to anonymise a ruling, not to list personal data. Annotators marked
  anything that could identify the applicant, so organisations are 36 % of it and plain dates
  30 %. Mentions they judged safe to leave are counted here as neither hit nor error.
- **Gretel** leaves the account numbers in its machine formats unlabelled. Precision there
  measures how complete the annotation is, as much as how careful an engine is.
- **ai4privacy** puts a label beside every value, which makes it the easiest of the five for a
  model trained on that shape.

<details>
<summary>Provenance, sampling and what <code>in scope</code> counts</summary>

`fetch.sh` downloads each dataset at a fixed version and checks its hash. `adapt.py` derives
the cases with a fixed seed, and writes the drawn ids into `manifest.json` — so the same cases
rebuild anywhere. Offsets come straight from the upstream annotation; nothing is re-annotated.

Every upstream label is mapped to one of three scopes. `in` = the product claims to redact it.
`out` = real, but outside what it claims (dates, countries, occupations, demographics,
coordinates) — counted for recall in the all-labels view only. `ctx` = annotated upstream as
needing no masking (TAB) — never a hit, never an error.

| corpus | `in` | `out` | `ctx` |
|---|---:|---:|---:|
| OpenMasq | 3 394 | AMOUNT only | CONTEXT |
| TAB | 2 360 | 3 064 | 2 141 |
| Gretel | 26 686 | 10 304 | — |
| ai4privacy | 30 955 | 8 972 | — |
| Nemotron | 35 735 | 14 656 | — |

Categories are not required to match: a name found as a company is found. That is how the
PII-TRACE paper scores its external benchmarks.

</details>

## Results

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="figures/f1-by-corpus-en-dark.png">
  <img alt="Character-level F1 per corpus and per engine" src="figures/f1-by-corpus-en-light.png">
</picture>

| corpus | cases | rules | product | product · Strict | PII-Tracer | Presidio |
|---|---:|---:|---:|---:|---:|---:|
| OpenMasq | 907 | 0.906 | 0.911 | 0.923 | 0.883 | 0.549 |
| TAB | 127 | 0.388 | 0.565 | 0.803 | 0.690 | 0.766 |
| Gretel | 2 000 | 0.540 | 0.620 | 0.630 | 0.610 | 0.421 |
| ai4privacy | 2 000 | 0.684 | 0.729 | 0.789 | 0.952 | 0.564 |
| Nemotron | 2 000 | 0.497 | 0.612 | 0.811 | 0.842 | 0.709 |

Same, on what the product claims to redact:

| corpus | cases | rules | product | product · Strict | PII-Tracer | Presidio |
|---|---:|---:|---:|---:|---:|---:|
| OpenMasq | 907 | 0.908 | 0.913 | 0.925 | 0.884 | 0.550 |
| TAB | 127 | 0.526 | 0.797 | 0.819 | 0.543 | 0.621 |
| Gretel | 2 000 | 0.614 | 0.692 | 0.650 | 0.634 | 0.404 |
| ai4privacy | 2 000 | 0.749 | 0.792 | 0.819 | 0.952 | 0.575 |
| Nemotron | 2 000 | 0.595 | 0.715 | 0.871 | 0.894 | 0.748 |

### The three measures side by side

| corpus | engine | F1 | contained | every mention |
|---|---|---:|---:|---:|
| OpenMasq | rules | 0.906 | 0.851 | 86 % |
| OpenMasq | product | 0.911 | 0.853 | 92 % |
| OpenMasq | product · Strict | 0.923 | 0.875 | 95 % |
| OpenMasq | PII-Tracer | 0.883 | 0.782 | 92 % |
| OpenMasq | Presidio | 0.549 | 0.469 | 30 % |
| TAB | rules | 0.388 | 0.252 | 6 % |
| TAB | product | 0.565 | 0.418 | 32 % |
| TAB | product · Strict | 0.803 | 0.686 | 49 % |
| TAB | PII-Tracer | 0.690 | 0.695 | 35 % |
| TAB | Presidio | 0.766 | 0.699 | 43 % |
| Gretel | rules | 0.540 | 0.411 | 37 % |
| Gretel | product | 0.620 | 0.472 | 51 % |
| Gretel | product · Strict | 0.630 | 0.535 | 59 % |
| Gretel | PII-Tracer | 0.610 | 0.531 | 55 % |
| Gretel | Presidio | 0.421 | 0.407 | 44 % |
| ai4privacy | rules | 0.684 | 0.578 | 19 % |
| ai4privacy | product | 0.729 | 0.635 | 27 % |
| ai4privacy | product · Strict | 0.789 | 0.708 | 41 % |
| ai4privacy | PII-Tracer | 0.952 | 0.920 | 99 % |
| ai4privacy | Presidio | 0.564 | 0.466 | 30 % |
| Nemotron | rules | 0.497 | 0.496 | 41 % |
| Nemotron | product | 0.612 | 0.604 | 60 % |
| Nemotron | product · Strict | 0.811 | 0.726 | 73 % |
| Nemotron | PII-Tracer | 0.842 | 0.801 | 68 % |
| Nemotron | Presidio | 0.709 | 0.651 | 56 % |

**Partial credit flatters everyone, and it flatters us most.** On TAB our Strict level scores
0.803 on F1 and 0.494 once every mention has to be found. Read the last column if you want to
know whether a document is safe; read the first if you want to compare detectors.

### Does this bench match the published figures?

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="figures/reproduction-en-dark.png">
  <img alt="PII-Tracer measured here against the figure Perplexity publishes" src="figures/reproduction-en-light.png">
</picture>

Two of four land within three thousandths: ai4privacy 0.952 against 0.950, Nemotron 0.842
against 0.847. The metric here was written from the paper's description alone, so that
agreement is the only external check available.

The two that differ:

- **TAB** — the paper does not say how it pools TAB's ten annotators; this bench takes one.
- **Gretel** — unexplained. PII-Tracer finds 96–100 % of the e-mails, IBANs and addresses, and
  loses its precision on the machine formats described above.

⚠️ And ai4privacy's 0.952 cuts both ways. PII-Tracer scores 96–100 % there on all 27 labels,
including sex and country, which have no recognisable shape. That is a model measured inside
its own training distribution — the paper says it learned on single-record examples, which is
what ai4privacy is. On TAB, the only real text here, the same model drops to 0.529 recall.

### Response time

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="figures/latency-en-dark.png">
  <img alt="Median response time per document, per corpus and per engine" src="figures/latency-en-light.png">
</picture>

| corpus | median chars | rules<br><sub>CPU</sub> | product<br><sub>CPU int8</sub> | product Strict<br><sub>CPU int8</sub> | PII-Tracer<br><sub>CPU</sub> | PII-Tracer<br><sub>GPU</sub> | Presidio<br><sub>CPU</sub> |
|---|---:|---:|---:|---:|---:|---:|---:|
| OpenMasq | 57 | 4 ms | 28 ms | 34 ms | 171 ms | 77 ms | 4 ms |
| TAB | 3 740 | 47 ms | 1.1 s | 1.4 s | 3.3 s | 2.3 s | 124 ms |
| Gretel | 1 283 | 10 ms | 543 ms | 480 ms | 988 ms | 923 ms | 49 ms |
| ai4privacy | 426 | 4 ms | 106 ms | 117 ms | 389 ms | 334 ms | 18 ms |
| Nemotron | 709 | 6 ms | 239 ms | 292 ms | 598 ms | 380 ms | 35 ms |

Bar = median, whisker = p90, hatched = GPU. One engine at a time, nothing else running, 40
documents per corpus. A default Presidio install is the cheapest thing here after the bare
rules, which is what says how much the local model really costs.

⚠️ Three things differ between the product and PII-Tracer: the device, the runtime and the
numeric type. PII-Tracer ships for the GPU in bfloat16; ours runs on the CPU in int8. So it is
measured on both, and the CPU column is the one that compares.

### Precision and recall

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="figures/precision-recall-en-dark.png">
  <img alt="Precision against recall per corpus, with iso-F1 curves" src="figures/precision-recall-en-light.png">
</picture>

Two engines on the same curve share a number and not a behaviour. There is no useful
**accuracy** here: the negative class is every other character of the document, so everything
would score above 99 %.

### Every mention, as repetition grows

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="figures/consistency-en-dark.png">
  <img alt="Share of identifiers whose every mention is found, by mention count" src="figures/consistency-en-light.png">
</picture>

An identifier repeated four times is four chances to miss one. The product holds; the rules alone do not.

### Every label

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="figures/recall-by-label-en-dark.png">
  <img alt="Character-level recall per annotated label" src="figures/recall-by-label-en-light.png">
</picture>

Recall on each label the annotators used, so a gap can be traced to a kind of value rather than to a corpus.

The full tables — per category, language, length and mention count — are at the [end of this page](#the-full-tables--tableaux-complets).

## Replay and regenerate

```bash
pnpm bench:spans --replay --markdown          # the tables above, from committed results
pnpm bench:spans --replay --json              # results/scores.json, what the figures read
packages/redact/bench/spans/fetch.sh          # the upstream files (~500 MB), pinned
python3.12 -m venv v && v/bin/pip install pyarrow pandas
v/bin/python packages/redact/bench/spans/adapt.py     # data/ + manifest.json
pnpm build && pnpm bench:spans --dataset tab          # measure the product
```

`results/<dataset>.<engine>.json` holds every predicted span, the machine and the date.
`figures/` holds six figures × English and French × light and dark, plus a manifest tying them
to an engine version. A figure carries values and bars, never a sentence — what it means is
here, where it can be translated and corrected.

The other engines have sidecars: `pplx.py` for PII-Tracer, `presidio.py` for Presidio, each
with a `--latency` mode. The script that draws the figures is not in this repository; it reads
`results/scores.json` and nothing else.

---

# `@openmasq/redact` — les bancs publics

<sub>[English](#openmasqredact--the-public-benchmarks) · **Français** · [openmasq.com](https://openmasq.com)</sub>

Ce que ce moteur trouve comme données personnelles, mesuré sur quatre jeux publics et sur le
nôtre, à côté de deux autres détecteurs. Tous les chiffres viennent d'un seul scoreur et se
rejouent hors ligne :

```bash
pnpm bench:spans --replay --markdown
```

## Ce qui est mesuré

Trois questions, trois nombres. Ils ne classent pas les moteurs dans le même ordre, et c'est
pour cela qu'ils sont tous les trois là.

| | ce qu'il demande |
|---|---|
| **F1** | Sur les caractères qu'un moteur a marqués, combien étaient des données personnelles — et sur les données personnelles, combien a-t-il marqué ? Crédit partiel : un nom marqué à moitié compte pour moitié. |
| **contenu** | A-t-il marqué la valeur **entière** ? Un nom dont le patronyme reste en clair compte comme raté. |
| **chaque mention** | A-t-il marqué **toutes les copies** de cette valeur dans le document ? Une copie ratée, et tout a fui. |

Le premier est la façon dont la littérature compare des détecteurs : c'est donc celui qui peut
se poser à côté des chiffres publiés. Le dernier est ce qu'un produit de masquage promet.

Deux vues de chaque jeu. **Toutes étiquettes** compte tout ce que les annotateurs ont marqué,
c'est le chiffre comparable. **Dans le périmètre** ne compte que ce que ce produit revendique
masquer ; les dates ordinaires, les pays, les professions et les données démographiques
sortent. La précision est la même dans les deux : un moteur n'est jamais pénalisé pour avoir
trouvé une donnée réelle que nous avons choisi de ne pas noter.

Le produit est mesuré tel qu'il est livré — à son niveau par défaut, et en Strict.

## Les corpus

Cinq. Un que nous avons écrit, quatre publics, et un seul fait de texte réel.

| | ce que c'est | cas | longueur médiane |
|---|---|---:|---:|
| **OpenMasq** | le nôtre : imprimés français, bulletins de paie, actes, résultats de labo, sorties d'outils, dégâts OCR. Synthétique. | 907 | 125 |
| **TAB** | des arrêts de la Cour européenne des droits de l'homme, annotés par des personnes. **Le seul texte réel ici.** | 127 | 3 886 |
| **Gretel** | finance synthétique : factures, relevés, et formats machine (MT940, SWIFT, EDI). 7 langues. | 5 594 | 1 306 |
| **ai4privacy** | enregistrements synthétiques denses, 6 langues. Chaque valeur est collée à une étiquette. | 6 000 | 426 |
| **Nemotron** | documents anglais, 50 secteurs, 55 types d'étiquettes. | 6 000 | 752 |

Trois d'entre eux demandent une réserve avant qu'on lise leurs chiffres.

- **TAB** a été annoté pour anonymiser une décision, pas pour lister des données personnelles.
  Les annotateurs ont marqué tout ce qui pouvait identifier le requérant : les organisations en
  font 36 %, les dates ordinaires 30 %. Les mentions qu'ils ont jugées sans danger ne comptent
  ici ni comme trouvées, ni comme erreurs.
- **Gretel** laisse sans étiquette les numéros de compte de ses formats machine. La précision y
  mesure la complétude de l'annotation autant que la retenue d'un moteur.
- **ai4privacy** pose une étiquette à côté de chaque valeur, ce qui en fait le plus facile des
  cinq pour un modèle entraîné sur cette forme.

<details>
<summary>Provenance, échantillonnage, et ce que compte le périmètre</summary>

`fetch.sh` télécharge chaque jeu à une version fixe et vérifie son empreinte. `adapt.py` en
tire les cas à graine fixe et écrit les identifiants tirés dans `manifest.json` — les mêmes cas
se reconstruisent donc ailleurs. Les offsets viennent de l'annotation amont ; rien n'est
ré-annoté.

Chaque étiquette amont est rangée dans l'un de trois périmètres. `in` = le produit revendique
la masquer. `out` = réelle, mais hors de ce qu'il revendique (dates, pays, professions, données
démographiques, coordonnées) — comptée en rappel dans la seule vue toutes étiquettes. `ctx` =
annotée amont comme n'ayant pas besoin d'être masquée (TAB) — jamais trouvée, jamais erreur.

| corpus | `in` | `out` | `ctx` |
|---|---:|---:|---:|
| OpenMasq | 3 394 | AMOUNT seul | CONTEXT |
| TAB | 2 360 | 3 064 | 2 141 |
| Gretel | 26 686 | 10 304 | — |
| ai4privacy | 30 955 | 8 972 | — |
| Nemotron | 35 735 | 14 656 | — |

Les catégories n'ont pas à coïncider : un nom trouvé comme entreprise est trouvé. C'est ainsi
que l'article PII-TRACE note ses bancs externes.

</details>

## Résultats

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="figures/f1-by-corpus-fr-dark.png">
  <img alt="F1 au niveau du caractère, par corpus et par moteur" src="figures/f1-by-corpus-fr-light.png">
</picture>

| corpus | cas | règles | produit | produit · Strict | PII-Tracer | Presidio |
|---|---:|---:|---:|---:|---:|---:|
| OpenMasq | 907 | 0.906 | 0.911 | 0.923 | 0.883 | 0.549 |
| TAB | 127 | 0.388 | 0.565 | 0.803 | 0.690 | 0.766 |
| Gretel | 2 000 | 0.540 | 0.620 | 0.630 | 0.610 | 0.421 |
| ai4privacy | 2 000 | 0.684 | 0.729 | 0.789 | 0.952 | 0.564 |
| Nemotron | 2 000 | 0.497 | 0.612 | 0.811 | 0.842 | 0.709 |

Le même, sur ce que le produit revendique masquer :

| corpus | cas | règles | produit | produit · Strict | PII-Tracer | Presidio |
|---|---:|---:|---:|---:|---:|---:|
| OpenMasq | 907 | 0.908 | 0.913 | 0.925 | 0.884 | 0.550 |
| TAB | 127 | 0.526 | 0.797 | 0.819 | 0.543 | 0.621 |
| Gretel | 2 000 | 0.614 | 0.692 | 0.650 | 0.634 | 0.404 |
| ai4privacy | 2 000 | 0.749 | 0.792 | 0.819 | 0.952 | 0.575 |
| Nemotron | 2 000 | 0.595 | 0.715 | 0.871 | 0.894 | 0.748 |

### Les trois mesures côte à côte

| corpus | moteur | F1 | contenu | chaque mention |
|---|---|---:|---:|---:|
| OpenMasq | règles | 0.906 | 0.851 | 86 % |
| OpenMasq | produit | 0.911 | 0.853 | 92 % |
| OpenMasq | produit · Strict | 0.923 | 0.875 | 95 % |
| OpenMasq | PII-Tracer | 0.883 | 0.782 | 92 % |
| OpenMasq | Presidio | 0.549 | 0.469 | 30 % |
| TAB | règles | 0.388 | 0.252 | 6 % |
| TAB | produit | 0.565 | 0.418 | 32 % |
| TAB | produit · Strict | 0.803 | 0.686 | 49 % |
| TAB | PII-Tracer | 0.690 | 0.695 | 35 % |
| TAB | Presidio | 0.766 | 0.699 | 43 % |
| Gretel | règles | 0.540 | 0.411 | 37 % |
| Gretel | produit | 0.620 | 0.472 | 51 % |
| Gretel | produit · Strict | 0.630 | 0.535 | 59 % |
| Gretel | PII-Tracer | 0.610 | 0.531 | 55 % |
| Gretel | Presidio | 0.421 | 0.407 | 44 % |
| ai4privacy | règles | 0.684 | 0.578 | 19 % |
| ai4privacy | produit | 0.729 | 0.635 | 27 % |
| ai4privacy | produit · Strict | 0.789 | 0.708 | 41 % |
| ai4privacy | PII-Tracer | 0.952 | 0.920 | 99 % |
| ai4privacy | Presidio | 0.564 | 0.466 | 30 % |
| Nemotron | règles | 0.497 | 0.496 | 41 % |
| Nemotron | produit | 0.612 | 0.604 | 60 % |
| Nemotron | produit · Strict | 0.811 | 0.726 | 73 % |
| Nemotron | PII-Tracer | 0.842 | 0.801 | 68 % |
| Nemotron | Presidio | 0.709 | 0.651 | 56 % |

**Le crédit partiel flatte tout le monde, et nous le plus.** Sur TAB notre niveau Strict note
0,803 en F1 et 0,494 dès qu'il faut trouver chaque mention. Lisez la dernière colonne si vous
voulez savoir si un document est sûr ; la première si vous voulez comparer des détecteurs.

### Ce banc retrouve-t-il les chiffres publiés ?

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="figures/reproduction-fr-dark.png">
  <img alt="PII-Tracer mesuré ici contre le chiffre publié par Perplexity" src="figures/reproduction-fr-light.png">
</picture>

Deux sur quatre à trois millièmes près : ai4privacy 0,952 contre 0,950, Nemotron 0,842 contre
0,847. La métrique a été écrite à partir de la seule description de l'article : cet accord est
le seul contrôle externe dont nous disposons.

Les deux qui divergent :

- **TAB** — l'article ne dit pas comment il regroupe les dix annotateurs de TAB ; ce banc en
  prend un.
- **Gretel** — inexpliqué. PII-Tracer y trouve 96 à 100 % des e-mails, IBAN et adresses, et
  perd sa précision sur les formats machine décrits plus haut.

⚠️ Et le 0,952 d'ai4privacy coupe dans les deux sens. PII-Tracer y note 96 à 100 % sur les
vingt-sept étiquettes, sexe et pays compris, qui n'ont aucune forme reconnaissable. C'est un
modèle mesuré dans sa propre distribution d'entraînement : l'article dit qu'il a appris sur des
exemples à enregistrement unique, ce qu'ai4privacy est. Sur TAB, seul texte réel ici, le même
modèle tombe à 0,529 de rappel.

### Temps de réponse

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="figures/latency-fr-dark.png">
  <img alt="Temps de réponse médian par document, par corpus et par moteur" src="figures/latency-fr-light.png">
</picture>

| corpus | car. médians | rules<br><sub>CPU</sub> | product<br><sub>CPU int8</sub> | product Strict<br><sub>CPU int8</sub> | PII-Tracer<br><sub>CPU</sub> | PII-Tracer<br><sub>GPU</sub> | Presidio<br><sub>CPU</sub> |
|---|---:|---:|---:|---:|---:|---:|---:|
| OpenMasq | 57 | 4 ms | 28 ms | 34 ms | 171 ms | 77 ms | 4 ms |
| TAB | 3 740 | 47 ms | 1.1 s | 1.4 s | 3.3 s | 2.3 s | 124 ms |
| Gretel | 1 283 | 10 ms | 543 ms | 480 ms | 988 ms | 923 ms | 49 ms |
| ai4privacy | 426 | 4 ms | 106 ms | 117 ms | 389 ms | 334 ms | 18 ms |
| Nemotron | 709 | 6 ms | 239 ms | 292 ms | 598 ms | 380 ms | 35 ms |

Barre = médiane, moustache = p90, hachures = GPU. Un moteur à la fois, rien d'autre en marche,
40 documents par corpus. Une installation Presidio par défaut est ce qu'il y a de moins cher
ici après les règles nues, et c'est ce qui dit combien le modèle local coûte vraiment.

⚠️ Trois choses diffèrent entre le produit et PII-Tracer : l'appareil, le moteur d'exécution et
le type numérique. PII-Tracer est livré pour le GPU en bfloat16 ; le nôtre tourne sur le
processeur en entiers 8 bits. Il est donc mesuré sur les deux, et c'est la colonne processeur
qui se compare.

### Précision et rappel

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="figures/precision-recall-fr-dark.png">
  <img alt="Précision contre rappel par corpus, avec les courbes d'iso-F1" src="figures/precision-recall-fr-light.png">
</picture>

Deux moteurs sur la même courbe partagent un nombre, pas un comportement. Il n'y a pas
d'**exactitude** utile ici : la classe négative, ce sont tous les autres caractères du
document, et tout le monde ferait plus de 99 %.

### Chaque mention, quand la répétition augmente

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="figures/consistency-fr-dark.png">
  <img alt="Part des identifiants dont chaque mention est trouvée" src="figures/consistency-fr-light.png">
</picture>

Un identifiant répété quatre fois, ce sont quatre occasions d'en rater une. Le produit tient ; les règles seules non.

### Chaque étiquette

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="figures/recall-by-label-fr-dark.png">
  <img alt="Rappel au niveau du caractère, par étiquette" src="figures/recall-by-label-fr-light.png">
</picture>

Le rappel sur chaque étiquette employée par les annotateurs, pour qu'un écart se rattache à un type de valeur plutôt qu'à un corpus.

Les tableaux complets — par catégorie, langue, longueur et nombre de mentions — sont en [fin de page](#the-full-tables--tableaux-complets).

## Rejouer, régénérer

Mêmes commandes que dans la moitié anglaise. `results/<jeu>.<moteur>.json` porte chaque passage
prédit, la machine et la date. `figures/` porte six figures × anglais et français × clair et
sombre, plus un manifeste qui les rattache à une version du moteur. Une figure porte des
valeurs et des barres, jamais une phrase — ce qu'elle signifie est ici, où cela se traduit et
se corrige.

Les autres moteurs ont leurs annexes : `pplx.py` pour PII-Tracer, `presidio.py` pour Presidio,
chacune avec un mode `--latency`. Le script qui dessine les figures n'est pas dans ce dépôt ;
il lit `results/scores.json` et rien d'autre.

---

## The full tables · Tableaux complets

Every metric, per corpus and per engine, plus the breakdowns by category, language, text
length and mention count. Regenerate with `pnpm bench:spans --replay --markdown`.

<details>
<summary>Open · Ouvrir</summary>

```
### ai4privacy — 2000 cases · 135871 annotated characters (115862 in the product's scope)

| metric | openmasq `patterns` | **openmasq `ner`** (the product, Renforcé) | openmasq `ner` (Strict) | PII-Tracer | Presidio (default) |
|---|---:|---:|---:|---:|---:|
| character-level precision | 0.891 | 0.854 | 0.857 | 0.920 | 0.568 |
| character-level recall · all labels | 0.566 | 0.636 | 0.732 | 0.987 | 0.561 |
| **character-level F1 · all labels** | **0.692** | **0.729** | **0.789** | **0.952** | **0.564** |
| character-level recall · product scope | 0.659 | 0.739 | 0.785 | 0.986 | 0.582 |
| character-level F1 · product scope | 0.758 | 0.792 | 0.819 | 0.952 | 0.575 |
| span-overlap F1 | 0.634 | 0.692 | 0.768 | 0.962 | 0.553 |
| span-containment F1 | 0.595 | 0.635 | 0.708 | 0.920 | 0.466 |
| recurring identifiers, every mention found | 19 % (228) | 27 % (228) | 41 % (228) | 99 % (228) | 30 % (228) |
| latency during this pass (ms/case) | 4.9 · 13 | 232.7 · 559.2 | 234.7 · 502.9 | 498.3 · 713.4 | 21.6 · 30.8 |

Identifiers whose every mention is fully covered, by number of mentions (all labels):

| mentions | openmasq `patterns` | **openmasq `ner`** (the product, Renforcé) | openmasq `ner` (Strict) | PII-Tracer | Presidio (default) |
|---|---:|---:|---:|---:|---:|
| 1 (12354) | 47 % | 55 % | 65 % | 99 % | 41 % |
| 2 (196) | 22 % | 31 % | 44 % | 99 % | 31 % |
| 3–5 (29) | 0 % | 3 % | 24 % | 100 % | 24 % |
| 6–10 (3) | 0 % | 0 % | 33 % | 67 % | 33 % |

Character-level F1 by language (all labels):

| language | openmasq `patterns` | **openmasq `ner`** (the product, Renforcé) | openmasq `ner` (Strict) | PII-Tracer | Presidio (default) |
|---|---:|---:|---:|---:|---:|
| de (1031) | 0.695 | 0.746 | 0.803 | 0.950 | 0.472 |
| en (969) | 0.688 | 0.709 | 0.774 | 0.955 | 0.703 |

Character-level recall by upstream label (spans · scope), all engines:

| label | openmasq `patterns` | **openmasq `ner`** (the product, Renforcé) | openmasq `ner` (Strict) | PII-Tracer | Presidio (default) |
|---|---:|---:|---:|---:|---:|
| IP (599 · in) | 95 % | 95 % | 95 % | 98 % | 96 % |
| EMAIL (614 · in) | 97 % | 98 % | 98 % | 98 % | 98 % |
| SOCIALNUMBER (709 · in) | 50 % | 49 % | 49 % | 100 % | 58 % |
| USERNAME (768 · in) | 11 % | 19 % | 51 % | 95 % | 27 % |
| DRIVERLICENSE (568 · in) | 66 % | 65 % | 65 % | 99 % | 36 % |
| BOD (607 · in) | 65 % | 64 % | 92 % | 100 % | 77 % |
| TEL (508 · in) | 76 % | 72 % | 72 % | 96 % | 55 % |
| IDCARD (666 · in) | 83 % | 83 % | 82 % | 100 % | 74 % |
| PASSPORT (712 · in) | 83 % | 83 % | 83 % | 100 % | 49 % |
| STREET (422 · in) | 42 % | 90 % | 90 % | 100 % | 44 % |
| DATE (450 · out) | 1 % | 1 % | 74 % | 100 % | 75 % |
| TIME (1014 · out) | 2 % | 2 % | 72 % | 99 % | 39 % |
| CITY (445 · in) | 68 % | 95 % | 95 % | 100 % | 47 % |
| LASTNAME1 (560 · in) | 44 % | 82 % | 82 % | 99 % | 41 % |
| GIVENNAME1 (483 · in) | 52 % | 79 % | 79 % | 97 % | 37 % |
| PASS (400 · in) | 60 % | 58 % | 59 % | 96 % | 8 % |
| TITLE (528 · out) | 8 % | 14 % | 15 % | 94 % | 18 % |
| SEX (534 · out) | 6 % | 7 % | 7 % | 99 % | 17 % |
| POSTCODE (449 · in) | 75 % | 74 % | 74 % | 100 % | 27 % |
| STATE (447 · in) | 14 % | 76 % | 76 % | 100 % | 20 % |
| COUNTRY (365 · out) | 1 % | 1 % | 2 % | 100 % | 62 % |
| SECADDRESS (190 · in) | 63 % | 66 % | 66 % | 100 % | 8 % |
| BUILDING (422 · in) | 44 % | 44 % | 44 % | 100 % | 3 % |
| LASTNAME2 (163 · in) | 32 % | 82 % | 82 % | 100 % | 41 % |
| GEOCOORD (60 · out) | 0 % | 0 % | 0 % | 100 % | 2 % |
| GIVENNAME2 (128 · in) | 37 % | 74 % | 74 % | 96 % | 46 % |
| LASTNAME3 (53 · in) | 25 % | 70 % | 70 % | 100 % | 45 % |

### gretel — 2000 cases · 212640 annotated characters (169592 in the product's scope)

| metric | openmasq `patterns` | **openmasq `ner`** (the product, Renforcé) | openmasq `ner` (Strict) | PII-Tracer | Presidio (default) |
|---|---:|---:|---:|---:|---:|
| character-level precision | 0.679 | 0.639 | 0.569 | 0.606 | 0.350 |
| character-level recall · all labels | 0.449 | 0.603 | 0.707 | 0.614 | 0.529 |
| **character-level F1 · all labels** | **0.540** | **0.620** | **0.630** | **0.610** | **0.421** |
| character-level recall · product scope | 0.560 | 0.753 | 0.757 | 0.663 | 0.477 |
| character-level F1 · product scope | 0.614 | 0.692 | 0.650 | 0.634 | 0.404 |
| span-overlap F1 | 0.525 | 0.582 | 0.636 | 0.581 | 0.501 |
| span-containment F1 | 0.411 | 0.472 | 0.535 | 0.531 | 0.407 |
| recurring identifiers, every mention found | 37 % (1870) | 51 % (1870) | 59 % (1870) | 55 % (1870) | 44 % (1870) |
| latency during this pass (ms/case) | 29.1 · 86.3 | 1177.8 · 2373.3 | 1191.7 · 2386.5 | 1464.4 · 1880 | 57.7 · 86.8 |

Identifiers whose every mention is fully covered, by number of mentions (all labels):

| mentions | openmasq `patterns` | **openmasq `ner`** (the product, Renforcé) | openmasq `ner` (Strict) | PII-Tracer | Presidio (default) |
|---|---:|---:|---:|---:|---:|
| 1 (7977) | 29 % | 35 % | 51 % | 60 % | 45 % |
| 2 (1236) | 42 % | 52 % | 61 % | 61 % | 49 % |
| 3–5 (519) | 32 % | 50 % | 55 % | 47 % | 35 % |
| 6–10 (108) | 12 % | 38 % | 50 % | 24 % | 24 % |
| 11+ (7) | 14 % | 29 % | 29 % | 14 % | 0 % |

Character-level P / R / F1 by text length (all labels):

| length | openmasq `patterns` | **openmasq `ner`** (the product, Renforcé) | openmasq `ner` (Strict) | PII-Tracer | Presidio (default) |
|---|---:|---:|---:|---:|---:|
| 1k–10k (1427) | 0.745 / 0.436 / 0.550 | 0.670 / 0.591 / 0.628 | 0.589 / 0.688 / 0.634 | 0.795 / 0.561 / 0.658 | 0.344 / 0.526 / 0.416 |
| <1k (573) | 0.536 / 0.493 / 0.514 | 0.558 / 0.645 / 0.598 | 0.516 / 0.772 / 0.619 | 0.385 / 0.793 / 0.519 | 0.372 / 0.541 / 0.441 |

Character-level F1 by language (all labels):

| language | openmasq `patterns` | **openmasq `ner`** (the product, Renforcé) | openmasq `ner` (Strict) | PII-Tracer | Presidio (default) |
|---|---:|---:|---:|---:|---:|
| en (1033) | 0.546 | 0.613 | 0.636 | 0.632 | 0.543 |
| de (187) | 0.548 | 0.635 | 0.658 | 0.631 | 0.315 |
| sv (161) | 0.506 | 0.636 | 0.620 | 0.599 | 0.356 |
| nl (156) | 0.484 | 0.577 | 0.553 | 0.510 | 0.316 |
| it (159) | 0.573 | 0.626 | 0.622 | 0.567 | 0.305 |
| es (166) | 0.499 | 0.618 | 0.613 | 0.551 | 0.284 |
| fr (138) | 0.589 | 0.685 | 0.687 | 0.648 | 0.412 |

Character-level recall by upstream label (spans · scope), all engines:

| label | openmasq `patterns` | **openmasq `ner`** (the product, Renforcé) | openmasq `ner` (Strict) | PII-Tracer | Presidio (default) |
|---|---:|---:|---:|---:|---:|
| name (3559 · in) | 61 % | 76 % | 76 % | 75 % | 67 % |
| street_address (1562 · in) | 64 % | 80 % | 81 % | 95 % | 43 % |
| company (2375 · in) | 23 % | 64 % | 65 % | 5 % | 9 % |
| date (3107 · out) | 1 % | 1 % | 48 % | 40 % | 77 % |
| email (502 · in) | 96 % | 97 % | 97 % | 96 % | 97 % |
| time (504 · out) | 1 % | 1 % | 68 % | 50 % | 47 % |
| phone_number (341 · in) | 76 % | 76 % | 76 % | 90 % | 79 % |
| ipv6 (60 · in) | 91 % | 91 % | 91 % | 77 % | 74 % |
| iban (63 · in) | 94 % | 94 % | 94 % | 99 % | 76 % |
| bban (64 · in) | 63 % | 63 % | 63 % | 100 % | 9 % |
| api_key (27 · in) | 88 % | 88 % | 88 % | 93 % | 20 % |
| swift_bic_code (87 · in) | 45 % | 45 % | 45 % | 99 % | 1 % |
| date_of_birth (86 · in) | 79 % | 79 % | 89 % | 87 % | 80 % |
| credit_card_number (54 · in) | 86 % | 86 % | 86 % | 100 % | 65 % |
| local_latlng (34 · in) | 30 % | 30 % | 30 % | 97 % | 55 % |
| first_name (112 · in) | 33 % | 94 % | 94 % | 98 % | 63 % |
| last_name (67 · in) | 49 % | 94 % | 95 % | 73 % | 37 % |
| customer_id (63 · in) | 67 % | 67 % | 67 % | 92 % | 41 % |
| ssn (53 · in) | 58 % | 58 % | 58 % | 100 % | 82 % |
| password (42 · in) | 48 % | 48 % | 48 % | 100 % | 7 % |
| ipv4 (40 · in) | 100 % | 100 % | 100 % | 100 % | 100 % |
| employee_id (60 · in) | 63 % | 63 % | 63 % | 89 % | 44 % |
| bank_routing_number (56 · in) | 63 % | 63 % | 63 % | 100 % | 100 % |
| driver_license_number (35 · in) | 72 % | 72 % | 72 % | 100 % | 52 % |
| passport_number (47 · in) | 78 % | 78 % | 78 % | 98 % | 93 % |
| date_time (20 · out) | 0 % | 0 % | 97 % | 100 % | 64 % |
| account_pin (63 · in) | 55 % | 55 % | 55 % | 100 % | 73 % |
| user_name (21 · in) | 15 % | 40 % | 42 % | 93 % | 19 % |
| credit_card_security_code (64 · in) | 50 % | 50 % | 50 % | 97 % | 3 % |

### internal — 907 cases · 49588 annotated characters (49392 in the product's scope)

| metric | openmasq `patterns` | **openmasq `ner`** (the product, Renforcé) | openmasq `ner` (Strict) | PII-Tracer | Presidio (default) |
|---|---:|---:|---:|---:|---:|
| character-level precision | 0.947 | 0.913 | 0.881 | 0.826 | 0.648 |
| character-level recall · all labels | 0.868 | 0.909 | 0.970 | 0.949 | 0.477 |
| **character-level F1 · all labels** | **0.906** | **0.911** | **0.923** | **0.883** | **0.549** |
| character-level recall · product scope | 0.872 | 0.912 | 0.974 | 0.952 | 0.478 |
| character-level F1 · product scope | 0.908 | 0.913 | 0.925 | 0.884 | 0.550 |
| span-overlap F1 | 0.886 | 0.897 | 0.913 | 0.877 | 0.553 |
| span-containment F1 | 0.851 | 0.853 | 0.875 | 0.782 | 0.469 |
| recurring identifiers, every mention found | 86 % (83) | 92 % (83) | 95 % (83) | 92 % (83) | 30 % (83) |
| latency during this pass (ms/case) | 5.4 · 20.3 | 102 · 400.5 | 103.8 · 418.3 | 147.8 · 297.7 | 0 · 0 |

Identifiers whose every mention is fully covered, by number of mentions (all labels):

| mentions | openmasq `patterns` | **openmasq `ner`** (the product, Renforcé) | openmasq `ner` (Strict) | PII-Tracer | Presidio (default) |
|---|---:|---:|---:|---:|---:|
| 1 (3159) | 80 % | 85 % | 94 % | 91 % | 40 % |
| 2 (67) | 87 % | 90 % | 94 % | 91 % | 30 % |
| 3–5 (16) | 81 % | 100 % | 100 % | 94 % | 31 % |

Character-level P / R / F1 by text length (all labels):

| length | openmasq `patterns` | **openmasq `ner`** (the product, Renforcé) | openmasq `ner` (Strict) | PII-Tracer | Presidio (default) |
|---|---:|---:|---:|---:|---:|
| 1k–10k (27) | 0.983 / 0.988 / 0.986 | 0.912 / 0.994 / 0.951 | 0.860 / 1.000 / 0.925 | 0.757 / 0.964 / 0.848 | 0.414 / 0.717 / 0.525 |
| <1k (880) | 0.945 / 0.862 / 0.901 | 0.913 / 0.904 / 0.909 | 0.882 / 0.968 / 0.923 | 0.830 / 0.948 / 0.885 | 0.681 / 0.464 / 0.552 |

Character-level F1 by language (all labels):

| language | openmasq `patterns` | **openmasq `ner`** (the product, Renforcé) | openmasq `ner` (Strict) | PII-Tracer | Presidio (default) |
|---|---:|---:|---:|---:|---:|
| fr (468) | 0.902 | 0.914 | 0.915 | 0.861 | 0.572 |
| en (215) | 0.898 | 0.910 | 0.938 | 0.916 | 0.528 |
| de (47) | 0.926 | 0.916 | 0.936 | 0.877 | 0.464 |
| es (32) | 0.929 | 0.895 | 0.925 | 0.922 | 0.497 |
| it (29) | 0.982 | 0.925 | 0.931 | 0.918 | 0.569 |
| pt (30) | 0.877 | 0.856 | 0.940 | 0.937 | 0.509 |
| nl (24) | 0.963 | 0.945 | 0.963 | 0.932 | 0.432 |
| pl (10) | 1.000 | 0.988 | 0.988 | 0.988 | 0.671 |
| sv (6) | 1.000 | 0.824 | 0.824 | 0.988 | 0.537 |
| da (5) | 1.000 | 1.000 | 1.000 | 0.995 | 0.634 |
| zh (17) | 0.372 | 0.441 | 0.430 | 0.545 | 0.411 |
| ko (11) | 0.756 | 0.800 | 0.800 | 0.738 | 0.407 |
| ja (12) | 0.323 | 0.490 | 0.490 | 0.436 | 0.529 |
| ru (1) | 0.000 | 1.000 | 1.000 | 0.739 | 0.000 |

Character-level recall by upstream label (spans · scope), all engines:

| label | openmasq `patterns` | **openmasq `ner`** (the product, Renforcé) | openmasq `ner` (Strict) | PII-Tracer | Presidio (default) |
|---|---:|---:|---:|---:|---:|
| NAME (674 · in) | 86 % | 96 % | 97 % | 98 % | 51 % |
| EMAIL (253 · in) | 100 % | 100 % | 100 % | 100 % | 99 % |
| ADDRESS (227 · in) | 99 % | 99 % | 99 % | 99 % | 17 % |
| CARD (228 · in) | 100 % | 100 % | 100 % | 99 % | 65 % |
| TOKEN (201 · in) | 100 % | 100 % | 100 % | 99 % | 7 % |
| ID (217 · in) | 88 % | 88 % | 93 % | 97 % | 36 % |
| COMPANY_ID (207 · in) | 100 % | 100 % | 100 % | 100 % | 24 % |
| USERNAME (203 · in) | 0 % | 16 % | 100 % | 99 % | 4 % |
| PHONE (153 · in) | 96 % | 96 % | 96 % | 100 % | 95 % |
| IBAN (52 · in) | 100 % | 100 % | 100 % | 99 % | 91 % |
| CITY (230 · in) | 59 % | 89 % | 89 % | 89 % | 22 % |
| HEALTH (205 · in) | 100 % | 100 % | 100 % | 73 % | 65 % |
| PATH (30 · in) | 80 % | 80 % | 95 % | 64 % | 1 % |
| DOB (88 · in) | 91 % | 91 % | 100 % | 100 % | 72 % |
| ORG (68 · in) | 63 % | 85 % | 85 % | 35 % | 18 % |
| URL (23 · in) | 20 % | 22 % | 95 % | 94 % | 94 % |
| SECRET (23 · in) | 98 % | 98 % | 98 % | 99 % | 15 % |
| POSTAL (103 · in) | 89 % | 89 % | 89 % | 99 % | 17 % |
| COMPANY (25 · in) | 78 % | 80 % | 80 % | 26 % | 1 % |
| PLACE (27 · in) | 89 % | 94 % | 94 % | 90 % | 7 % |
| IP (30 · in) | 100 % | 100 % | 100 % | 100 % | 100 % |
| DATE (27 · in) | 39 % | 39 % | 100 % | 99 % | 74 % |
| BIC (23 · in) | 74 % | 74 % | 74 % | 100 % | 4 % |
| AMOUNT (30 · out) | 0 % | 0 % | 0 % | 24 % | 11 % |

### nemotron — 2000 cases · 242739 annotated characters (187018 in the product's scope)

| metric | openmasq `patterns` | **openmasq `ner`** (the product, Renforcé) | openmasq `ner` (Strict) | PII-Tracer | Presidio (default) |
|---|---:|---:|---:|---:|---:|
| character-level precision | 0.886 | 0.875 | 0.912 | 0.965 | 0.871 |
| character-level recall · all labels | 0.345 | 0.470 | 0.731 | 0.747 | 0.598 |
| **character-level F1 · all labels** | **0.497** | **0.612** | **0.811** | **0.842** | **0.709** |
| character-level recall · product scope | 0.447 | 0.605 | 0.833 | 0.833 | 0.656 |
| character-level F1 · product scope | 0.595 | 0.715 | 0.871 | 0.894 | 0.748 |
| span-overlap F1 | 0.562 | 0.683 | 0.802 | 0.857 | 0.751 |
| span-containment F1 | 0.496 | 0.604 | 0.726 | 0.801 | 0.651 |
| recurring identifiers, every mention found | 41 % (2276) | 60 % (2276) | 73 % (2276) | 68 % (2276) | 56 % (2276) |
| latency during this pass (ms/case) | 35.1 · 85.8 | 469.6 · 1369.8 | 481.1 · 1307.7 | 678 · 1548.5 | 34.5 · 87 |

Identifiers whose every mention is fully covered, by number of mentions (all labels):

| mentions | openmasq `patterns` | **openmasq `ner`** (the product, Renforcé) | openmasq `ner` (Strict) | PII-Tracer | Presidio (default) |
|---|---:|---:|---:|---:|---:|
| 1 (10821) | 37 % | 46 % | 65 % | 82 % | 60 % |
| 2 (1498) | 43 % | 59 % | 74 % | 74 % | 60 % |
| 3–5 (661) | 39 % | 64 % | 72 % | 59 % | 54 % |
| 6–10 (110) | 25 % | 55 % | 60 % | 38 % | 27 % |
| 11+ (7) | 29 % | 57 % | 71 % | 29 % | 43 % |

Character-level P / R / F1 by text length (all labels):

| length | openmasq `patterns` | **openmasq `ner`** (the product, Renforcé) | openmasq `ner` (Strict) | PII-Tracer | Presidio (default) |
|---|---:|---:|---:|---:|---:|
| 1k–10k (675) | 0.885 / 0.300 / 0.447 | 0.861 / 0.449 / 0.591 | 0.903 / 0.719 / 0.801 | 0.975 / 0.661 / 0.788 | 0.833 / 0.551 / 0.663 |
| <1k (1325) | 0.888 / 0.388 / 0.540 | 0.887 / 0.490 / 0.631 | 0.920 / 0.742 / 0.821 | 0.957 / 0.828 / 0.888 | 0.904 / 0.642 / 0.751 |

Character-level recall by upstream label (spans · scope), all engines:

| label | openmasq `patterns` | **openmasq `ner`** (the product, Renforcé) | openmasq `ner` (Strict) | PII-Tracer | Presidio (default) |
|---|---:|---:|---:|---:|---:|
| url (831 · in) | 1 % | 2 % | 100 % | 87 % | 92 % |
| company_name (1043 · in) | 15 % | 91 % | 91 % | 2 % | 1 % |
| email (879 · in) | 99 % | 100 % | 100 % | 100 % | 100 % |
| occupation (773 · out) | 0 % | 4 % | 4 % | 1 % | 0 % |
| date (1455 · out) | 0 % | 0 % | 92 % | 78 % | 94 % |
| http_cookie (124 · in) | 47 % | 47 % | 52 % | 83 % | 11 % |
| first_name (1616 · in) | 76 % | 99 % | 99 % | 99 % | 90 % |
| last_name (1131 · in) | 87 % | 99 % | 99 % | 98 % | 88 % |
| street_address (354 · in) | 71 % | 83 % | 83 % | 99 % | 31 % |
| phone_number (448 · in) | 45 % | 45 % | 45 % | 100 % | 100 % |
| credit_debit_card (271 · in) | 37 % | 37 % | 37 % | 100 % | 55 % |
| account_number (403 · in) | 83 % | 83 % | 83 % | 100 % | 72 % |
| api_key (96 · in) | 89 % | 89 % | 89 % | 100 % | 3 % |
| county (312 · in) | 25 % | 98 % | 98 % | 65 % | 94 % |
| time (520 · out) | 1 % | 1 % | 68 % | 57 % | 69 % |
| user_name (337 · in) | 16 % | 56 % | 63 % | 100 % | 28 % |
| date_time (194 · out) | 0 % | 0 % | 97 % | 95 % | 84 % |
| city (418 · in) | 21 % | 98 % | 98 % | 74 % | 79 % |
| customer_id (374 · in) | 85 % | 85 % | 85 % | 100 % | 64 % |
| coordinate (171 · out) | 0 % | 0 % | 0 % | 95 % | 10 % |
| education_level (225 · out) | 0 % | 2 % | 2 % | 1 % | 2 % |
| date_of_birth (269 · in) | 95 % | 95 % | 100 % | 100 % | 100 % |
| medical_record_number (245 · in) | 58 % | 58 % | 58 % | 100 % | 83 % |
| employment_status (262 · out) | 2 % | 2 % | 2 % | 6 % | 0 % |
| state (427 · in) | 9 % | 86 % | 86 % | 65 % | 85 % |
| ipv6 (66 · in) | 61 % | 61 % | 61 % | 100 % | 84 % |
| health_plan_beneficiary_number (169 · in) | 18 % | 18 % | 18 % | 100 % | 53 % |
| biometric_identifier (172 · in) | 41 % | 42 % | 43 % | 99 % | 88 % |
| password (164 · in) | 24 % | 24 % | 25 % | 97 % | 6 % |
| ipv4 (134 · in) | 100 % | 100 % | 100 % | 100 % | 100 % |
| bank_routing_number (191 · in) | 80 % | 80 % | 80 % | 100 % | 100 % |
| ssn (153 · in) | 87 % | 87 % | 87 % | 100 % | 99 % |
| political_view (116 · out) | 0 % | 10 % | 10 % | 42 % | 1 % |
| vehicle_identifier (91 · in) | 99 % | 99 % | 99 % | 100 % | 3 % |
| country (435 · out) | 0 % | 2 % | 2 % | 49 % | 82 % |
| swift_bic (122 · in) | 97 % | 97 % | 97 % | 100 % | 4 % |
| mac_address (77 · in) | 97 % | 97 % | 97 % | 100 % | 100 % |
| fax_number (109 · in) | 19 % | 19 % | 19 % | 100 % | 100 % |
| religious_belief (110 · out) | 1 % | 2 % | 2 % | 73 % | 20 % |
| employee_id (174 · in) | 76 % | 76 % | 76 % | 100 % | 34 % |
| certificate_license_number (113 · in) | 4 % | 4 % | 4 % | 100 % | 65 % |
| unique_id (39 · in) | 26 % | 26 % | 29 % | 100 % | 10 % |
| language (149 · out) | 0 % | 0 % | 0 % | 9 % | 0 % |
| device_identifier (47 · in) | 23 % | 23 % | 23 % | 100 % | 23 % |
| race_ethnicity (156 · out) | 0 % | 6 % | 6 % | 69 % | 0 % |
| license_plate (98 · in) | 1 % | 1 % | 1 % | 96 % | 5 % |
| gender (141 · out) | 0 % | 0 % | 0 % | 72 % | 0 % |
| sexuality (90 · out) | 0 % | 0 % | 0 % | 75 % | 1 % |
| pin (123 · in) | 74 % | 74 % | 74 % | 95 % | 84 % |
| postcode (135 · in) | 39 % | 39 % | 39 % | 100 % | 46 % |
| blood_type (107 · in) | 77 % | 77 % | 77 % | 75 % | 0 % |
| age (179 · out) | 0 % | 0 % | 3 % | 40 % | 64 % |
| tax_id (28 · in) | 65 % | 65 % | 65 % | 100 % | 70 % |
| cvv (99 · in) | 71 % | 71 % | 71 % | 72 % | 0 % |

### tab — 127 cases · 72746 annotated characters (32423 in the product's scope)

| metric | openmasq `patterns` | **openmasq `ner`** (the product, Renforcé) | openmasq `ner` (Strict) | PII-Tracer | Presidio (default) |
|---|---:|---:|---:|---:|---:|
| character-level precision | 0.762 | 0.842 | 0.898 | 0.989 | 0.930 |
| character-level recall · all labels | 0.260 | 0.425 | 0.726 | 0.529 | 0.652 |
| **character-level F1 · all labels** | **0.388** | **0.565** | **0.803** | **0.690** | **0.766** |
| character-level recall · product scope | 0.402 | 0.757 | 0.753 | 0.374 | 0.467 |
| character-level F1 · product scope | 0.526 | 0.797 | 0.819 | 0.543 | 0.621 |
| span-overlap F1 | 0.470 | 0.638 | 0.852 | 0.717 | 0.816 |
| span-containment F1 | 0.252 | 0.418 | 0.686 | 0.695 | 0.699 |
| recurring identifiers, every mention found | 6 % (500) | 32 % (500) | 49 % (500) | 35 % (500) | 43 % (500) |
| latency during this pass (ms/case) | 92.1 · 260.2 | 1905.3 · 4359.1 | 1982.7 · 4658.6 | 3126.3 · 8939 | 147.4 · 349.9 |

Identifiers whose every mention is fully covered, by number of mentions (all labels):

| mentions | openmasq `patterns` | **openmasq `ner`** (the product, Renforcé) | openmasq `ner` (Strict) | PII-Tracer | Presidio (default) |
|---|---:|---:|---:|---:|---:|
| 1 (3925) | 17 % | 23 % | 58 % | 61 % | 64 % |
| 2 (319) | 8 % | 29 % | 53 % | 39 % | 53 % |
| 3–5 (139) | 5 % | 39 % | 47 % | 25 % | 27 % |
| 6–10 (34) | 3 % | 29 % | 29 % | 32 % | 21 % |
| 11+ (8) | 0 % | 38 % | 38 % | 25 % | 13 % |

Character-level P / R / F1 by text length (all labels):

| length | openmasq `patterns` | **openmasq `ner`** (the product, Renforcé) | openmasq `ner` (Strict) | PII-Tracer | Presidio (default) |
|---|---:|---:|---:|---:|---:|
| 1k–10k (117) | 0.766 / 0.260 / 0.388 | 0.847 / 0.426 / 0.567 | 0.902 / 0.724 / 0.803 | 0.989 / 0.535 / 0.695 | 0.930 / 0.646 / 0.762 |
| ≥10k (10) | 0.737 / 0.260 / 0.385 | 0.803 / 0.424 / 0.555 | 0.877 / 0.734 / 0.799 | 0.996 / 0.489 / 0.656 | 0.933 / 0.691 / 0.794 |

Character-level recall by upstream label (spans · scope), all engines:

| label | openmasq `patterns` | **openmasq `ner`** (the product, Renforcé) | openmasq `ner` (Strict) | PII-Tracer | Presidio (default) |
|---|---:|---:|---:|---:|---:|
| DATETIME (2468 · out/ctx) | 18 % | 18 % | 87 % | 82 % | 99 % |
| ORG (653 · ctx/in) | 17 % | 78 % | 77 % | 0 % | 14 % |
| PERSON (987 · in/ctx) | 71 % | 77 % | 77 % | 76 % | 80 % |
| LOC (391 · in/ctx) | 5 % | 76 % | 76 % | 15 % | 74 % |
| MISC (192 · out/ctx) | 1 % | 11 % | 11 % | 1 % | 12 % |
| DEM (233 · ctx/out) | 0 % | 6 % | 6 % | 12 % | 14 % |
| CODE (329 · in/ctx) | 59 % | 59 % | 59 % | 66 % | 4 % |
| QUANTITY (171 · out/ctx) | 2 % | 2 % | 2 % | 2 % | 1 % |
```

</details>
