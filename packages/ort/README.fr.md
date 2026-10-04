[English](README.md)

# @openmasq/ort

**onnxruntime, avec un repli WebAssembly là où aucun binding natif n'existe.**

`onnxruntime-node` ne fournit aucun binding natif pour les Mac Intel. Sans lui, le modèle
NER local ne démarre pas, et l'application refuse d'envoyer. Ce paquet prend la place
d'`onnxruntime-node` grâce à un override pnpm dans le `package.json` racine : le moteur de
masquage, l'application de bureau et le proxy local le chargent sous ce nom. À l'exécution, il utilise le
binding natif quand il existe, et `onnxruntime-web` (WASM) sinon.

## Contenu

- **`src/index.cjs`** : l'implémentation. Il charge le moteur natif, se replie sur WASM, et
  réexporte le moteur avec `OPENMASQ_ORT_BACKEND` (`"native"` ou `"wasm"`).
- **`src/index.mjs`** : une façade en module ES par-dessus.
- **`src/index.d.ts`** : les types de la surface commune aux deux entrées
  (`InferenceSession`, `Tensor`, `env`, `OPENMASQ_ORT_BACKEND`).

Il n'y a pas d'étape de compilation.

## Développer

```bash
pnpm test packages/ort       # depuis la racine du dépôt
pnpm check:pkgtree           # vérifie l'arbre de dépendances empaqueté, cette version comprise
```

> [!NOTE]
> Le repli WASM reste local et hors ligne. Il charge les fichiers `.wasm` installés à côté
> de lui, jamais depuis un CDN, et lit lui-même les poids du modèle sur le disque.

> [!IMPORTANT]
> La `version` du paquet est celle d'`onnxruntime-node` qu'il remplace (1.24.3). Relevez-la
> quand vous mettez à jour `ort-native`.
