---
"@openmasq/redact": patch
---

The detectors stay linear on long runs of one character class (a base64 blob, a column of tabs, a row of dots): the e-mail scan, the identity-document header, labelled contract numbers, password values, code references and addresses. Their matches are unchanged.
