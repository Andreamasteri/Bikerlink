---
name: Install research first
description: Prima di installare/configurare qualsiasi software, pacchetto o versione, bisogna recuperare la documentazione ufficiale aggiornata — le conoscenze di training sono obsolete.
---

## Regola

Prima di installare, aggiornare o configurare **qualsiasi** software, pacchetto, libreria, tool o versione, eseguire sempre una ricerca attiva delle fonti aggiornate:

1. **README / CHANGELOG** del repo ufficiale (GitHub/GitLab) — in particolare le sezioni di installazione e breaking changes della versione target.
2. **Documentazione ufficiale online** — recuperata con web-search, non dalla memoria di training.
3. **Issues e forum** (GitHub Issues, Reddit, Stack Overflow, Discord) — per problemi noti, workaround e gotcha pratici.
4. **Release notes** — specialmente se si passa tra major/minor version.

**Why:** Le conoscenze di training sono datate. Pacchetti come EAS CLI, Expo SDK, GraphHopper, Ollama, Better Auth ecc. cambiano API, flag e comportamenti ad ogni release. Fidarsi della memoria interna senza verifica live produce configurazioni errate, flag deprecati, passi mancanti.

**How to apply:**
- Quando l'utente dice "installa X", "aggiorna a versione Y", "integra Z" → prima `web_search` sul repo/docs ufficiale della versione esatta.
- Quando si scrive codice di configurazione (es. auth, routing, CDN) → leggere il file di esempio ufficiale della versione in uso, non scrivere da memoria.
- Se la documentazione è in un repo, clonare o leggere i file raw via URL prima di procedere.
- Non assumere mai che l'API/configurazione di 6 mesi fa sia ancora valida oggi.
