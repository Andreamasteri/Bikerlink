---
name: Diagnostica OTA-proof (camera + sensori + canale diagnostic)
description: Come la suite diagnostica riconosce la build e perché i sensori girano ovunque
---
# Diagnostica — camera, sensori, riconoscimento build OTA-proof

- **Camera permessi (SDK 56)**: `getCameraPermissionsAsync` NON è un named export top-level di
  `expo-camera` — è metodo statico di `Camera`. Usare `const { Camera } = await import("expo-camera");
  await Camera.getCameraPermissionsAsync()`. Il vecchio lookup del named export dava sempre SKIP.

- **Sensori (expo-sensors) girano su QUALSIASI build nativa**: la dipendenza è in package.json →
  autolinkata in ogni build. NON gattare i sensori dietro `isDiagnosticApk` (era una falsa barriera).
  `testHardwareSensors(isNative)` — accelerometro PASS/WARN reale, pedometro SKIP "Solo iOS" su Android.

- **Riconoscimento diagnostic OTA-proof**: `EXPO_PUBLIC_BUILD_PROFILE` è baked al build EAS ma
  CANCELLATO da ogni bundle OTA → diventa "" dopo il primo OTA. `detectBuildCapabilities()` legge
  anche `Updates.channel`: `isDiagnosticApk = isNative && (envProfile==="diagnostic" || channel==="diagnostic")`.
  La build pubblicata sul canale `diagnostic` resta riconosciuta anche dopo OTA successivi.

- **Canale OTA `diagnostic`**: profilo `diagnostic-apk` in eas.json usa `channel:"diagnostic"` (non
  più production) → OTA diagnostici isolati dagli utenti prod. `publish-ota.sh --diagnostic` pubblica
  sul canale diagnostic e imposta EXPO_PUBLIC_BUILD_PROFILE=diagnostic nell'expo export. Default = staging.
  **Richiede una nuova diagnostic APK col profilo aggiornato per essere pienamente attivo.**

- **buildProfile nel report**: colonna `build_profile` su diagnostic_reports (migration 0116),
  propagata da runner → POST /api/diagnostic/report → GET admin reports → card (badge DIAGNOSTIC +
  riga metadati). Dà un consumatore reale e verificabile al rilevamento.
