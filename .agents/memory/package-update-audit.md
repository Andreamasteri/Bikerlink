---
name: Package update audit system
description: Come e quando usare scripts/audit-package-updates.ts per scaricare changelog ufficiali dopo ogni aggiornamento npm.
---

# Package Update Audit

**Regola:** dopo OGNI aggiornamento di versioni npm (patch, minor, major) eseguire:

```bash
npx tsx scripts/audit-package-updates.ts
```

Il report viene salvato in `.local/package-update-notes/YYYY-MM-DD.md`.

**Why:** aggiornamenti silenziosi rompono API, rinominano opzioni, cambiano comportamenti. Leggere i CHANGELOG prima di debuggare evita ore di lavoro a vuoto.

**Quirks critici di Expo:**
- Le patch release SDK 56 vivono nel branch **`sdk-56`**, NON in `main`. Il branch `main` ha solo `## Unpublished` per le versioni più recenti.
- I CHANGELOG di Expo usano **em-dash `—`** come separatore data (non il trattino `-`). Il parser nel script usa `[–—\-]` per coprire entrambi.

**Come applicare:**
- Exit 0 = nessun breaking change → si può procedere.
- Exit 2 = breaking changes → leggere il report prima del deploy.
- Se un pacchetto restituisce "repo non nel registry", aggiungere il mapping in `getRepoInfo()` in `scripts/audit-package-updates.ts`.
- Non aggiungere come workflow (limite 10 raggiunto) — eseguire via bash o indicare il comando nella task description.

**Skill corrispondente:** `.agents/skills/package-update-audit/SKILL.md`
