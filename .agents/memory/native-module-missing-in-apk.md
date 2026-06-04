---
name: Native module assente nell'APK (OTA non lo aggiunge)
description: Perché un modulo Expo nativo può mancare nel binario installato e come degradare senza crash via OTA
---

Un modulo Expo "nativo" (es. `expo-image-manipulator` → `ExpoImageManipulator`) è solo un wrapper JS attorno a codice compilato dentro l'APK/AAB. Se la dipendenza viene aggiunta a `package.json` DOPO che il binario è stato compilato, il modulo nativo NON è nell'app installata, anche se `node_modules` lo ha.

Sintomo: accedere a una sua API (anche un export "deprecato" come `manipulateAsync`) attiva `requireNativeModule('ExpoXxx')` che LANCIA `Cannot find native module 'ExpoXxx'`. L'errore arriva al global error handler → ErrorBoundary → crash percepito, anche dentro un try/catch locale (il catch vede un `TypeError: Cannot read property '...' of undefined` derivato, mentre l'errore nativo è già stato riportato a parte).

**Why:** un aggiornamento OTA spedisce SOLO JS. Non può aggiungere/cambiare codice nativo nell'APK già installato. Quindi nessun fix JS che invochi il modulo nativo funzionerà sui device con il vecchio APK.

**How to apply:** prima di chiamare l'API, rileva la presenza SENZA lanciare con `requireOptionalNativeModule('ExpoXxx')` (da `expo-modules-core`, ritorna `null` se assente). Se è `null`, salta del tutto la funzionalità e degrada (es. per le immagini: usa l'uri del picker già compresso via `quality`, niente resize). Forza `true` su web (`Platform.OS === 'web'`) dove il path web è supportato. Quando un nuovo build nativo includerà il modulo, il check tornerà non-null e la feature si riattiva da sola. Per ripristinare la feature piena serve un NUOVO build nativo (non OTA).
