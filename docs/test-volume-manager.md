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

Per vedere i log `[VolumeManager]` in tempo reale (**solo APK debug pre-cleanup**):

```bash
adb logcat -s ReactNativeJS | grep VolumeManager
```

---

## Casi di test

| # | Caso | Condizione | Risultato atteso | Pass | Fail | Note |
|---|------|-----------|-----------------|------|------|------|
| 1 | HUD volume assente durante tracking attivo | Avvia un giro → premi tasto volume | Il popup HUD nativo del volume **non** appare | ✅ | | |
| 2 | HUD volume visibile fuori dal tracking | App aperta, nessun giro in corso → premi tasto volume | Il popup HUD nativo del volume **appare** normalmente | ✅ | | |
| 3 | Pressione tasto volume → pausa giro | Giro attivo → premi tasto volume | Il giro passa a stato **paused**, haptic light percepibile | ✅ | | |
| 4 | Pressione tasto volume → ripresa giro | Giro in pausa → premi tasto volume | Il giro torna a stato **active**, haptic light percepibile | ✅ | | |
| 5 | App in background — nessuna intercettazione | Giro attivo → manda app in background → premi tasto volume | Il volume di sistema si regola normalmente (nessuna intercettazione) | ✅ | | |
| 6 | Rientro in foreground — stato listener corretto | Dopo il caso 5, riporta app in foreground | Listener riattivo: pressione volume → pausa/ripresa giro; HUD scomparso | ✅ | | |
| 7 | Cold start + tracking immediato | Chiudi completamente l'app → riapri → avvia giro subito | Listener attivo dal primo evento volume | ✅ | | Log `[VolumeManager]` rimossi dopo verifica |
| 8 | Fine giro — listener rimosso | Termina il giro → premi tasto volume | HUD volume torna visibile, nessuna pausa/ripresa | ✅ | | Log `[VolumeManager]` rimossi dopo verifica |

---

## Log attesi — riferimento storico (pre-cleanup)

> **⚠ I log `[VolumeManager]` sono stati rimossi da `hooks/useVolumeManager.ts`** dopo la verifica positiva su device. Questa sezione è conservata come riferimento storico per documentare le sequenze osservate durante i test.

Sequenza log osservata per il caso **avvio giro**:

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

- I log `[VolumeManager]` erano gated su `__DEV__` e **sono stati rimossi** dopo verifica positiva su device.
- Il `console.warn` per ambienti senza supporto nativo è rimasto — è un avviso operativo, non debug.
- Se un caso fallisce in futuro, aprire un task separato di fix (non correggere inline durante il test).
- Testare sempre su device fisico Android (API 28+) con USB debug abilitato.
- iOS è **fuori scope** di questo test — da pianificare separatamente.

---

## Risultati compilati

**Data test**: 2026-06-14  
**Device**: Android fisico  
**Android version**: API 28+  
**APK tipo**: ✅ debug  
**Tester**: BikerLink team

### Esito complessivo

| Casi passati | Casi falliti | Non testati |
|-------------|-------------|-------------|
| 8 / 8       | 0           | 0           |

### Dettaglio casi

| # | Pass | Fail | Note |
|---|------|------|------|
| 1 — HUD assente durante tracking | ✅ | | |
| 2 — HUD visibile fuori tracking | ✅ | | |
| 3 — Tasto volume → pausa giro | ✅ | | |
| 4 — Tasto volume → ripresa giro | ✅ | | |
| 5 — App in background: nessuna intercettazione | ✅ | | |
| 6 — Rientro foreground: listener corretto | ✅ | | |
| 7 — Cold start + tracking immediato | ✅ | | Log debug rimossi dopo verifica |
| 8 — Fine giro: listener rimosso | ✅ | | Log debug rimossi dopo verifica |

### Anomalie rilevate

Nessuna.
