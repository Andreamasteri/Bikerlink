---
name: react-native-keyboard-controller version lock
description: Il package è bloccato a 1.21.6 per scelta esplicita dell'utente — non aggiornare mai senza autorizzazione diretta.
---

## Regola

`react-native-keyboard-controller` è pinned a `1.21.6` e NON deve essere aggiornato senza autorizzazione esplicita dell'utente.

**Why:** versioni successive (es. 1.21.9) rompono la compatibilità con Expo SDK 56 oppure causano comportamenti inattesi testati in produzione. L'utente ha richiesto il blocco esplicito dopo aver dovuto fare un downgrade manuale.

**How to apply:**
- Il package è in `expo.install.exclude` in `package.json` → `expo install`, `expo install --check` e `expo doctor` lo ignorano automaticamente.
- La versione in `package.json` è senza `^` o `~` (esatta: `"1.21.6"`).
- Se un futuro `npm install` o aggiornamento dipendenze lo tocca, ripristinarlo a `1.21.6`.
- Per aggiornarlo serve un "sì" esplicito dell'utente in quella conversazione — non basta che expo doctor lo segnali come outdated.
