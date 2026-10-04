---
"@openmasq/redact": minor
---

PDF extraction: in a digital PDF, a page whose text layer is thin or unreadable (a scanned insert, a page drawn as outlines) now takes its OCR reading in the primary `text`, instead of staying empty there. The page stream announces such a page's text once OCR has read it. New helpers in `documents/layers/pageMerge.ts`.
