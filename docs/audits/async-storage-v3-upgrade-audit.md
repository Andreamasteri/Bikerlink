# Audit pre-aggiornamento — @react-native-async-storage/async-storage v3

**Data:** 2026-06-13  
**Versione corrente:** `^2.2.0` (risolve a 2.2.0)  
**Versione target:** `3.1.1` (latest)  
**Scope:** audit di compatibilità prima dell'upgrade — nessuna modifica al codice in questo documento

---

## 1. Breaking changes v3.0.0 (fonte: GitHub Releases ufficiale)

### 1.1 Batch operations — rinominate e firme cambiate ⚠️ BREAKING

| API v2 | API v3 | Tipo di cambiamento |
|--------|--------|---------------------|
| `multiGet(keys: string[])` | `getMany(keys: string[])` | Rinominata **+ return type cambiato** |
| `multiSet(pairs: [string,string][])` | `setMany(entries: Record<string,string>)` | Rinominata **+ tipo argomento cambiato** |
| `multiRemove(keys: string[])` | `removeMany(keys: string[])` | Solo rinominata, argomento identico |

**Dettaglio cambio `multiGet` → `getMany`:**
- v2: `Promise<[string, string | null][]>` — array ordinato di coppie `[key, value]`
- v3: `Promise<Record<string, string | null>>` — mappa chiave→valore
- Tutto il codice che accede ai valori per indice posizionale (`pairs[0][1]`, `r[1]`, `t[1]`) **deve essere riscritto** per accedere per chiave.

**Dettaglio cambio `multiSet` → `setMany`:**
- v2: argomento `[string, string][]` — array di coppie `[key, value]`
- v3: argomento `Record<string, string>` — oggetto `{ key: value, ... }`
- Il codice che passa un array di coppie deve essere convertito in oggetto.

### 1.2 Callback-based API rimossa

Tutti i metodi in v2 accettavano un argomento callback opzionale (es. `getItem(key, callback?)`). In v3 le firme sono solo Promise-based.  
**Impatto nel codebase:** Zero — tutto il codice usa `await` o `.then()/.catch()`, nessun callback.

### 1.3 Hook `useAsyncStorage` rimosso

Sarà reintrodotto in una versione futura.  
**Impatto:** Zero — non usato nel codebase.

### 1.4 API invariate ✅ Safe

| API | Firma v2 | Firma v3 | Status |
|-----|----------|----------|--------|
| `getItem(key)` | `Promise<string \| null>` | identica | ✅ |
| `setItem(key, value)` | `Promise<void>` | identica | ✅ |
| `removeItem(key)` | `Promise<void>` | identica | ✅ |
| `getAllKeys()` | `Promise<string[]>` | identica | ✅ |
| `clear()` | `Promise<void>` | identica | ✅ |
| Default export singleton | compatibile v2 | compatibile v2/v1 | ✅ |

### 1.5 Altre breaking changes non-API

- **Extra step Android (v3.0.x):** richiedeva `implementation "io.github.react-native-async-storage:android-default-storage:+"` nel `build.gradle`. **Risolto in v3.1.0** — l'artifact è ora su Maven Central e viene incluso automaticamente. Nessuna modifica manuale necessaria.
- **iCloud backup opt-out rimosso:** il flag `excludeStorageFromBackup` è stato eliminato (backup iCloud disabilitato di default). Non usato nel codebase.
- **Scoped storages:** nuovo sistema per creare istanze storage multiple con `createAsyncStorage()`. Il default export rimane un singleton retrocompatibile v2/v1 — nessun impatto.
- **Web backend:** migrazione da `localStorage` a IndexedDB via pacchetto `idb` (ora in `dependencies`). Cambiamento trasparente — l'API era già Promise-based in v2.

---

## 2. Inventario completo utilizzo nel progetto

### 2.1 `multiGet` → `getMany` ⚠️ 5 callsite, tutti richiedono modifica

#### `lib/maps/useMapsRollout.ts` — linea 57
```typescript
// ATTUALE (v2)
const [r, t] = await AsyncStorage.multiGet([TESTER_RENDERER_KEY, TESTER_TILE_KEY]);
const rv = r[1];
setTesterTileId(t[1] ?? null);

// ADATTAMENTO v3
const result = await AsyncStorage.getMany([TESTER_RENDERER_KEY, TESTER_TILE_KEY]);
const rv = result[TESTER_RENDERER_KEY];
setTesterTileId(result[TESTER_TILE_KEY] ?? null);
```

#### `components/profile/view/ProfileMapsBetaSection.tsx` — linea 40
```typescript
// ATTUALE (v2)
const [r, t] = await AsyncStorage.multiGet([TESTER_RENDERER_KEY, TESTER_TILE_KEY]);
const rv = r[1];
setRenderer(rv && VALID_RENDERERS.includes(rv as MapsRendererId) ? (rv as MapsRendererId) : null);
setTileId(t[1] ?? null);

// ADATTAMENTO v3
const result = await AsyncStorage.getMany([TESTER_RENDERER_KEY, TESTER_TILE_KEY]);
const rv = result[TESTER_RENDERER_KEY];
setRenderer(rv && VALID_RENDERERS.includes(rv as MapsRendererId) ? (rv as MapsRendererId) : null);
setTileId(result[TESTER_TILE_KEY] ?? null);
```

#### `app/(tabs)/match.tsx` — linea 69
```typescript
// ATTUALE (v2)
AsyncStorage.multiGet(["match_distance_mode", "match_distance_km"]).then(pairs => {
  const mode = pairs[0][1];
  const km = pairs[1][1];
  ...
});

// ADATTAMENTO v3
AsyncStorage.getMany(["match_distance_mode", "match_distance_km"]).then(result => {
  const mode = result["match_distance_mode"];
  const km = result["match_distance_km"];
  ...
});
```

#### `app/(tabs)/match.tsx` — linea 81
```typescript
// ATTUALE (v2)
AsyncStorage.multiGet(["music_match_criteria", "music_match_logic", "music_match_min_songs"])
  .then(pairs => {
    const criteria = pairs[0][1] ?? "songs,genre";
    const minS = pairs[2][1] ?? "5";
    ...
  });

// ADATTAMENTO v3
AsyncStorage.getMany(["music_match_criteria", "music_match_logic", "music_match_min_songs"])
  .then(result => {
    const criteria = result["music_match_criteria"] ?? "songs,genre";
    const minS = result["music_match_min_songs"] ?? "5";
    ...
  });
```

#### `app/(tabs)/music.tsx` — linea 148
```typescript
// ATTUALE (v2)
AsyncStorage.multiGet(["music_match_criteria", "music_match_logic", "music_match_min_songs"])
  .then(pairs => {
    const criteria = pairs[0][1];
    const logic = pairs[1][1];
    const minS = pairs[2][1];
    ...
  });

// ADATTAMENTO v3
AsyncStorage.getMany(["music_match_criteria", "music_match_logic", "music_match_min_songs"])
  .then(result => {
    const criteria = result["music_match_criteria"];
    const logic = result["music_match_logic"];
    const minS = result["music_match_min_songs"];
    ...
  });
```

---

### 2.2 `multiSet` → `setMany` ⚠️ 1 callsite, richiede modifica

#### `app/(tabs)/match.tsx` — linea 328
```typescript
// ATTUALE (v2)
AsyncStorage.multiSet([["match_distance_mode", mode], ["match_distance_km", distanceKm]]).catch(() => {});

// ADATTAMENTO v3
AsyncStorage.setMany({ "match_distance_mode": mode, "match_distance_km": distanceKm }).catch(() => {});
```

---

### 2.3 `multiRemove` → `removeMany` ⚠️ 3 callsite — solo rinomina

#### `lib/storage-recovery.ts` — linea 28
```typescript
// ATTUALE (v2)
await AsyncStorage.multiRemove(stale);
// ADATTAMENTO v3
await AsyncStorage.removeMany(stale);
```

#### `components/tracking/useTrackingState.ts` — linea 527
```typescript
// ATTUALE (v2)
AsyncStorage.multiRemove([GPS_BUFFER_SEGCOUNT_KEY, ...Array.from({ length: 50 }, ...)]).catch(() => {});
// ADATTAMENTO v3
AsyncStorage.removeMany([GPS_BUFFER_SEGCOUNT_KEY, ...Array.from({ length: 50 }, ...)]).catch(() => {});
```

#### `components/profile/view/ProfileFooter.tsx` — linea 29
```typescript
// ATTUALE (v2)
await AsyncStorage.multiRemove(appKeys);
// ADATTAMENTO v3
await AsyncStorage.removeMany(appKeys);
```

---

### 2.4 API invariate — file a rischio zero ✅

Tutti gli altri file usano esclusivamente `getItem`, `setItem`, `removeItem`, `getAllKeys`, `clear` — API invariate.

File campione verificati:
`lib/query-client.ts`, `lib/otaStorage.ts`, `lib/device-id.ts`, `lib/crash-logger.ts`,
`lib/auth-context.tsx`, `lib/theme-context.tsx`, `lib/language-context.tsx`, `lib/units-context.tsx`,
`lib/telemetry-prefs.ts`, `lib/versionStorage.ts`, `hooks/useTelemetry.ts`, `hooks/useReadyState.ts`,
`hooks/useOtaAutoUpdate.ts`, `hooks/useNewMatchAlert.ts`, `hooks/useMapTelemetry.ts`,
`hooks/useMapFilters.ts`, `hooks/useMapLocation.ts`, `hooks/tracking/useOfflineQueue.ts`,
`hooks/home/useHomeMapState.ts`, `hooks/useAssistantProactiveTips.ts`, `hooks/useAdminFilterPersist.ts`,
`hooks/useMapStyle.ts`, `lib/ai-assistant/client-actions.ts`, `lib/splash-utils.ts`,
`lib/startup-beacon.ts`, `lib/background-location-task.ts`, `lib/background-telemetry-task.ts`,
`lib/offline-tiles.ts`, `lib/player-context.tsx`, `lib/taskbar-style-context.tsx`,
`lib/uptime-widget-context.tsx`, `app/onboarding.tsx`, `app/index.tsx`,
`app/navigate/[id].helpers.ts`, `app/giri/create.tsx`, `app/admin/crash-logs.tsx`,
`app/admin/system.tsx`, `app/admin/sensors/_sensor-screen.tsx`, `app/admin/sensors/final.tsx`,
`components/RootProviders.tsx` (via persister — vedi §3)

---

## 3. Verifica compatibilità `@tanstack/query-async-storage-persister`

- **Versione installata:** `5.101.0`
- **Peer deps dichiarate:** nessuna (il persister non vincola la versione di async-storage)
- **API usate dal persister:** solo `storage.getItem()`, `storage.setItem()`, `storage.removeItem()` — tutte invariate in v3
- **Utilizzo nel codebase:** `components/RootProviders.tsx` chiama `createAsyncStoragePersister({ storage: AsyncStorage })` passando il singleton default — retrocompatibile
- **Verdetto: compatibile con v3 senza modifiche** ✅

---

## 4. Verifica compatibilità web (Expo Web)

- v2 usava `localStorage` sotto al capot (sincrono, wrappato in Promise)
- v3 usa `IndexedDB` via il pacchetto `idb` (ora in `dependencies`)
- Il cambio è **trasparente per i caller**: l'API era già Promise-based in v2, non cambia nulla per chi chiama `await AsyncStorage.getItem(key)`
- Nessun file del codebase ha codice `Platform.OS === 'web'` che assuma comportamento sincrono di AsyncStorage
- I timeout di fallback in `lib/language-context.tsx` (3s) restano validi con IndexedDB
- **Nessuna modifica web-specifica necessaria** ✅

---

## 5. Matrice di compatibilità completa

| API | Usata nel codebase? | Status v3 | Adattamento richiesto |
|-----|--------------------|-----------|-----------------------|
| `getItem` | Sì, ~50 callsite | ✅ invariata | No |
| `setItem` | Sì, ~50 callsite | ✅ invariata | No |
| `removeItem` | Sì, ~30 callsite | ✅ invariata | No |
| `getAllKeys` | Sì, 2 callsite | ✅ invariata | No |
| `clear` | No | ✅ invariata | No |
| `multiGet` | Sì, **5 callsite** | ⚠️ rinominata + return type | **Sì — 4 file** |
| `multiSet` | Sì, **1 callsite** | ⚠️ rinominata + argomento | **Sì — 1 file** |
| `multiRemove` | Sì, **3 callsite** | ⚠️ rinominata | **Sì — 3 file** |
| Callback-based API | No | ❌ rimossa | No |
| `useAsyncStorage` hook | No | ❌ rimossa | No |
| Web (IndexedDB) | N/A | ✅ trasparente | No |
| TanStack persister | Sì | ✅ compatibile | No |

---

## 6. Riepilogo adattamenti richiesti

**Totale: 5 file, 9 callsite**

| File | Callsite | Tipo di modifica |
|------|----------|-----------------|
| `lib/maps/useMapsRollout.ts:57` | `multiGet` | rename + key-based access |
| `components/profile/view/ProfileMapsBetaSection.tsx:40` | `multiGet` | rename + key-based access |
| `app/(tabs)/match.tsx:69` | `multiGet` | rename + key-based access |
| `app/(tabs)/match.tsx:81` | `multiGet` | rename + key-based access |
| `app/(tabs)/music.tsx:148` | `multiGet` | rename + key-based access |
| `app/(tabs)/match.tsx:328` | `multiSet` | rename + array-of-pairs → Record |
| `lib/storage-recovery.ts:28` | `multiRemove` | solo rename |
| `components/tracking/useTrackingState.ts:527` | `multiRemove` | solo rename |
| `components/profile/view/ProfileFooter.tsx:29` | `multiRemove` | solo rename |

---

## 7. Verdetto

**NON è "safe to upgrade" senza modifiche al codice.**

Sono necessarie modifiche in 5 file / 9 callsite prima dell'upgrade. L'impatto è limitato e ben circoscritto: 3 `multiRemove` sono rename meccanici, 1 `multiSet` è un reshape di struttura dati, 5 `multiGet` richiedono refactoring del return type (da accesso per indice a accesso per chiave). Nessuna logica applicativa cambia.

Una volta applicate queste modifiche, l'upgrade a `^3.1.1` è safe.
