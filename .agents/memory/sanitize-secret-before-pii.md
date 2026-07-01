---
name: Sanitize order — secret check before PII redaction
description: Why the anti-secret filter must run before PII redaction on any untrusted output (VPS/command output, model output).
---

Quando sanitizzi un output non fidato (output di comandi VPS/SSH, output di un
modello), esegui il check anti-secret (`matchesSensitive`) sul testo GREZZO (al
massimo troncato) PRIMA di applicare `redactPII`.

**Why:** `redactPII` può mutare la parte numerica/interna di un token (es. una API
key `sk-...1234567890` → `sk-...[phone-redacted]`) quel tanto da spezzarlo sotto la
soglia del pattern secret; a quel punto `matchesSensitive` non lo riconosce più e un
FRAMMENTO del segreto trapela. Emerso nei test di `sanitizeVpsOutput`.

**How to apply:** ordine corretto = `cap length → if matchesSensitive(raw) return
"[output rimosso...]" → else redactPII(raw)`. Vale per qualunque pipeline che
combini redazione PII e detection secret sullo stesso testo. Pattern secret in
`server/ai/assistant/security-filter.ts` (`matchesSensitive`); redazione PII in
`server/ai/moderation/redact.ts`.
