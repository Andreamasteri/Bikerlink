/**
 * Detox configuration — BikerLink Android E2E
 *
 * STATO: PENDING — in attesa di integrazione Android CI.
 *
 * PREREQUISITI:
 *   1. Build APK di test:
 *        GIT_INDEX_FILE=/tmp/eas-build-index bash scripts/eas.sh build \
 *          --profile debug-e2e --platform android --non-interactive
 *      oppure build locale:
 *        npx expo run:android --configuration Debug
 *
 *   2. Emulatore avviato:
 *        emulator -avk Pixel_6_API_33 -no-snapshot-load
 *
 *   3. Dipendenze Detox installate (separatamente, NON in package.json per
 *      non appesantire il build OTA):
 *        npm install --save-dev detox detox-cli
 *
 * ESECUZIONE:
 *   # Build artifacts Detox
 *   npx detox build --configuration android.emu.debug
 *
 *   # Esegui solo il test drag-hitbox
 *   npx detox test --configuration android.emu.debug e2e/drag-hitbox.e2e.ts
 *
 *   # Tutti i test E2E
 *   npx detox test --configuration android.emu.debug
 *
 * NOTE:
 *   - Il file APK prodotto da EAS è nella cartella /tmp/eas-build-output/
 *     (o come indicato da eas.sh); aggiornare `binaryPath` di conseguenza.
 *   - Per i test su device fisico: sostituire `emulator.android` con
 *     `attached.android` in configurations.
 */

/** @type {import('@detox/types').DetoxConfig} */
module.exports = {
  testRunner: {
    args: {
      $0: "jest",
      config: "e2e/jest.config.js",
    },
    jest: {
      setupTimeout: 120000,
    },
  },

  apps: {
    "android.debug": {
      type: "android.apk",
      binaryPath:
        process.env.DETOX_APK_PATH ||
        "android/app/build/outputs/apk/debug/app-debug.apk",
      build:
        "cd android && ./gradlew assembleDebug assembleAndroidTest -DtestBuildType=debug",
      reversePorts: [8081],
    },
  },

  devices: {
    emulator: {
      type: "android.emulator",
      device: {
        avdName: process.env.DETOX_AVD_NAME || "Pixel_6_API_33",
      },
    },
  },

  configurations: {
    "android.emu.debug": {
      device: "emulator",
      app: "android.debug",
    },
  },
};
