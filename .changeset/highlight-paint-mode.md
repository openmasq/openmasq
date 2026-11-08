---
"@openmasq/redact": minor
---

`renderRedactedImage`, `loadRedactedPdf` and `renderRedactedPdf` take an optional `paintMode`: `"cover"` (default, unchanged) hides each value under an opaque box with its replacement drawn on top; `"highlight"` paints a translucent wash in the value's category colour and leaves the real text readable, for a local review surface. Each rendered page and image reports its `paintMode`, and `paintCoversReplacements` accepts only `"cover"` pages.
