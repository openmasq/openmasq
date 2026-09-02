# @openmasq/ort — onnxruntime with a WASM fallback

<sub>**English** · [Français](#openmasqort--onnxruntime-avec-un-repli-wasm) · [openmasq.com](https://openmasq.com)</sub>

Takes the place of `onnxruntime-node` (a pnpm override) and picks the engine at runtime:
the native binding where it exists, `onnxruntime-web` WASM where it does not (Intel Mac).
Three hand-written files, no build step.

---

# @openmasq/ort — onnxruntime avec un repli WASM

Prend la place d'`onnxruntime-node` (une surcharge pnpm) et choisit le moteur à
l'exécution : le binding natif là où il existe, `onnxruntime-web` en WASM là où il n'existe
pas (Mac Intel). Trois fichiers écrits à la main, aucune étape de build.
