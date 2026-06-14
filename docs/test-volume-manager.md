# Test — react-native-volume-manager su device Android reale

> **Prerequisiti**: APK debug installato su device Android fisico via `adb install`.  
> Test non eseguibili in emulatore né in Expo Go web — richiedono modulo nativo.

---

## Installazione APK debug

```bash
# Build APK debug (da Replit, con EAS o build locale)
GIT_INDEX_FILE=/tmp/eas-build-index npx eas build --platform android --profile debug --local

# Installa sul device connesso via USB (debug USB abilitato)
adb install -r build-*.apk

# Avvia il metro bundler (necessario per log in DEV)
# oppure usa la build standalone se il bundle è già embeddato
```

Per vedere i log `[VolumeManager]` in tempo reale:

```bash
adb logcat -s ReactNativeJS | grep VolumeManager
```

---

## Casi di test

| # | Caso | Condizione | Risultato atteso | Pass | Fail | Note |
|---|------|-----------|-----------------|------|------|------|
| 1 | HUD volume assente durante tracking attivo | Avvia un giro → premi tasto volume | Il popup HUD nativo del volume **non** appare | ☐ | ☐ | |
| 2 | HUD volume visibile fuori dal tracking | App aperta, nessun giro in corso → premi tasto volume | Il popup HUD nativo del volume **appare** normalmente | ☐ | ☐ | |
| 3 | Pressione tasto volume → pausa giro | Giro attivo → premi tasto volume | Il giro passa a stato **paused**, haptic light percepibile | ☐ | ☐ | |
| 4 | Pressione tasto volume → ripresa giro | Giro in pausa → premi tasto volume | Il giro torna a stato **active**, haptic light percepibile | ☐ | ☐ | |
| 5 | App in background — nessuna intercettazione | Giro attivo → manda app in background → premi tasto volume | Il volume di sistema si regola normalmente (nessuna intercettazione) | ☐ | ☐ | |
| 6 | Rientro in foreground — stato listener corretto | Dopo il caso 5, riporta app in foreground | Listener riattivo: pressione volume → pausa/ripresa giro; HUD scomparso | ☐ | ☐ | |
| 7 | Cold start + tracking immediato | Chiudi completamente l'app → riapri → avvia giro subito | Listener attivo dal primo evento volume, log `[VolumeManager] listener registered` presente | ☐ | ☐ | |
| 8 | Fine giro — listener rimosso | Termina il giro → premi tasto volume | HUD volume torna visibile, log `[VolumeManager] listener removed` presente, nessuna pausa/ripresa | ☐ | ☐ | |

---

## Log attesi (APK debug — `adb logcat`)

Durante i test, filtrare:

```
adb logcat -s ReactNativeJS | grep "\[VolumeManager\]"
```

Sequenza log corretta per il caso **avvio giro**:

```
[VolumeManager] phase="idle" isTracking=false platform=android
[VolumeManager] phase="active" isTracking=true platform=android
[VolumeManager] listener registered (phase active/paused)
```

Al **termine del giro**:

```
[VolumeManager] listener removed (cleanup)
[VolumeManager] phase="idle" isTracking=false platform=android
```

Al **tasto volume premuto** durante giro:

```
[VolumeManager] volume button pressed — firing onVolumeButton callback
```

---

## Note operative

- I log `[VolumeManager]` sono gated su `__DEV__` e non compaiono in APK release.
- Se un caso fallisce, aprire un task separato di fix (non correggere inline durante il test).
- Testare sempre su device fisico Android (API 28+) con USB debug abilitato.
- iOS è **fuori scope** di questo test — da pianificare separatamente.

---

## Risultati compilati

> **⚠ Da compilare sul field** — I casi di test richiedono un device Android fisico con APK debug installato. Compilare la tabella seguente dopo l'esecuzione manuale.

**Data test**: ___________  
**Device**: ___________  
**Android version**: ___________  
**APK tipo**: ☐ debug  ☐ release  
**Tester**: ___________

### Esito complessivo

| Casi passati | Casi falliti | Non testati |
|-------------|-------------|-------------|
| / 8         |             |             |

### Dettaglio casi

| # | Pass | Fail | Note |
|---|------|------|------|
| 1 — HUD assente durante tracking | ☐ | ☐ | |
| 2 — HUD visibile fuori tracking | ☐ | ☐ | |
| 3 — Tasto volume → pausa giro | ☐ | ☐ | |
| 4 — Tasto volume → ripresa giro | ☐ | ☐ | |
| 5 — App in background: nessuna intercettazione | ☐ | ☐ | |
| 6 — Rientro foreground: listener corretto | ☐ | ☐ | |
| 7 — Cold start + tracking immediato | ☐ | ☐ | |
| 8 — Fine giro: listener rimosso | ☐ | ☐ | |

### Anomalie rilevate

_(compilare se uno o più casi falliscono)_

| Caso # | Descrizione anomalia | Ripetibile | Task aperto |
|--------|---------------------|------------|-------------|
|        |                     | ☐ sì ☐ no  |             |
