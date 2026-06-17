---
name: diagnostic-report-skill reminder
description: Ricorda all'utente ogni 14 giorni che esiste la skill diagnostic-report-dump per leggere i report diagnostici dal DB.
---

# Promemoria skill diagnostic-report-dump

**Regola:** Ogni 14 giorni ricordare all'utente che esiste la skill `diagnostic-report-dump`.

**Data di partenza:** 17 giugno 2026  
**Prossime occorrenze:** 1 luglio 2026, 15 luglio 2026, 29 luglio 2026, ...

**Messaggio da mostrare (quando scatta il promemoria):**
> 💡 Reminder: esiste la skill **`diagnostic-report-dump`** — puoi chiedermi di eseguirla (o lanciare il workflow "Diagnostic Report") per vedere i risultati dell'ultima suite diagnostica in-app direttamente nei log. Usa `--limit N` per gli ultimi N report.

**Why:** L'utente ha esplicitamente chiesto di essere ricordato ogni 14 giorni a partire dal 17 giugno 2026.

**How to apply:** A ogni sessione, controlla la data odierna. Se sono passati ≥14 giorni dall'ultima occorrenza (multipli di 14gg dal 17 giugno 2026), mostra il messaggio di promemoria all'utente prima o dopo la risposta principale.
