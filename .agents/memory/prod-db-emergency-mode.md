---
name: Prod DB emergency mode
description: Il server di produzione è in modalità emergenza — ogni deploy sovrascrive il DB prod con il DB dev.
---

## Regola

Il server di produzione è in **modalità emergenza** fino a nuovo ordine dell'utente.

**Conseguenza:** ogni deploy (publish) sovrascrive il DB di produzione con i dati del DB di sviluppo.

**How to apply:**
- Prima di suggerire un deploy, avvisare l'utente di questa conseguenza.
- NON eseguire deploy automatici o suggerirli come passaggio scontato.
- Tenere presente che qualsiasi dato inserito in prod (es. via API o direttamente) verrà cancellato al prossimo deploy.
- Verificare con l'utente se la modalità emergenza è ancora attiva prima di ogni deploy.

**Why:** l'utente ha comunicato questa modalità il 2026-06-01 e ha detto "fino a nuovo ordine".
