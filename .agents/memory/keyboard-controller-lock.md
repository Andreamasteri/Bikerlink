---
name: react-native-keyboard-controller version lock
description: Versione 1.21.11 per fix Kotlin 2.1.20; aggiunta a expo.install.exclude perché expo doctor EAS segnalava mismatch con la versione attesa da SDK.
---

## Regola

`react-native-keyboard-controller` è pinned a **≥ 1.21.9** (attualmente `^1.21.11`) e NON deve essere downgradata sotto 1.21.9.

**Why:** Kotlin 2.1.20 (usato da Expo SDK 56 / compileSdk 36) richiede che `onConfigurationChanged` abbia un parametro `Configuration` non-nullable. Versioni < 1.21.9 dichiaravano `Configuration?` → errore `'onConfigurationChanged' overrides nothing` → build Android fallisce a runtime EAS. Il fix è nella 1.21.9 (linea 1.21.x, nessuna breaking change JS).

**Build verificata:** EAS release-apk build 7d1afb7b (2026-06-11, v60.10.100) completata con successo.

**How to apply:**
- La versione in `package.json` è `"^1.21.11"`.
- **È in `expo.install.exclude`** (aggiunto dopo che expo doctor EAS segnalava "expected 1.21.6, found 1.21.11" → check failed → build annullata).
- API JS identica: `KeyboardProvider`, `KeyboardAwareScrollView`, `KeyboardAvoidingView` — nessuna migrazione richiesta.
- Non tornare mai sotto 1.21.9: la build Android con Kotlin 2.1.20+ fallirebbe di nuovo.
