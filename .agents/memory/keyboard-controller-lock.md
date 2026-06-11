---
name: react-native-keyboard-controller version lock
description: Versione aggiornata a 1.21.11 per fix Kotlin 2.1.20 / compileSdk 36; rimossa da expo.install.exclude per lasciarla gestire da expo.
---

## Regola

`react-native-keyboard-controller` è pinned a **≥ 1.21.9** (attualmente `^1.21.11`) e NON deve essere downgradata sotto 1.21.9.

**Why:** Kotlin 2.1.20 (usato da Expo SDK 56 / compileSdk 36) richiede che `onConfigurationChanged` abbia un parametro `Configuration` non-nullable. Versioni < 1.21.9 dichiaravano `Configuration?` → errore `'onConfigurationChanged' overrides nothing` → build Android fallisce a runtime EAS. Il fix è nella 1.21.9 (linea 1.21.x, nessuna breaking change JS).

**How to apply:**
- La versione in `package.json` è `"^1.21.11"` (caret, Expo può aggiornarla entro la linea compatibile).
- **Non** è in `expo.install.exclude` → expo doctor / expo install possono gestirla.
- API JS identica: `KeyboardProvider`, `KeyboardAwareScrollView`, `KeyboardAvoidingView` — nessuna migrazione richiesta.
- Se si introduce un breaking change JS in una futura versione, rimetterla in `expo.install.exclude` con la versione esatta senza `^`.
- Non tornare mai sotto 1.21.9: la build Android con Kotlin 2.1.20+ fallirebbe di nuovo.
