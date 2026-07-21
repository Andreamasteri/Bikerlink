---
name: Expo SDK 57 migration facts
description: Cosa è davvero cambiato (e cosa no) nella migrazione SDK 56→57 — per futuri upgrade SDK
---

# Expo SDK 57 — fatti verificati (lug 2026)

- SDK 57 target **RN 0.86.0 e react 19.2.3 — identici a SDK 56**: nessun bump RN/react necessario; i rischi webview/keyboard-controller/gesture-handler erano nulli.
- `Updates.checkForUpdateAsync/fetchUpdateAsync/reloadAsync/isEnabled/updateId/runtimeVersion` **esistono ancora in expo-updates 57** — nessuna migrazione a `useUpdates()` necessaria se il codice usa le funzioni async (non le costanti rimosse).
- Procedura upgrade reale: `npx expo install expo@^57` poi `npx expo install --fix` (il comando `npx expo upgrade` dei vecchi piani non esiste più). `--fix` rispetta `expo.install.exclude`.
- `expo install --fix` può aggiungere config plugin ad app.json (es. expo-secure-store, expo-status-bar) — diff atteso, non rumore.
- I pacchetti excluded root erano già TUTTI ≥ versioni bundled SDK 57 (verifica via `bundledNativeModules.json` dentro il tarball npm di expo — metodo affidabile per scoprire le versioni target senza changelog).
- **runtimeVersion bump obbligatorio** a ogni SDK major (tutti i moduli nativi expo-* cambiano major): ciclo 10→11, versionCode 82→83, versionName reale in uso = `<build>.<ciclo>.<ota>` (es. 83.11.242) nonostante la skill descriva `<build>.<ota>.<ciclo>`.
- `logs/ota-hwm.txt` è il contatore OTA (242), NON il versionCode — mai sovrascriverlo col versionCode anche se un piano lo chiede.

**Why:** i piani pre-scritti per upgrade SDK sovrastimano i rischi e citano comandi/numeri stale; verificare sempre live (npm pack + bundledNativeModules) prima di toccare codice.
**How to apply:** a ogni futuro upgrade SDK Expo, partire da questo file.
