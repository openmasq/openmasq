---
"@openmasq/redact": patch
---

PDF OCR and thumbnails render non-embedded standard fonts (Helvetica, Times, Courier…) with the fonts pdf.js ships instead of the machine's: on a system without a matching face, such a text page rendered without ink and was skipped as blank. A font that cannot be supplied now keeps every page of the document from being skipped as blank.
