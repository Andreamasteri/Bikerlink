// Task #4979 — OTA Bisect — BootGate diagnostico interattivo
//
// Lista ORDINATA dei checkpoint del boot del client Expo. È la singola fonte di
// verità usata sia dal runtime (BootGateController + BootGateProviderChain) sia
// dal generatore del manifest (scripts/generate-boot-manifest.ts).
//
// ⚠️  Questo file DEVE restare "node-safe": niente import di react / react-native
//     / AsyncStorage. Lo importa anche uno script Node (generate-boot-manifest.ts)
//     che gira fuori dal bundle Metro.

export type BootStepKind = "render" | "action" | "provider" | "navigation";

export interface BootStep {
  /** id stabile, usato come chiave nei ping e per mappare i provider-layer. */
  id: string;
  /** etichetta breve mostrata all'utente nella schermata BootGate. */
  label: string;
  /** descrizione in italiano piano, senza gergo tecnico (Sezione A del manifest). */
  description: string;
  /** posizione nell'ordine ORIGINALE di boot (1-based). */
  originalOrder: number;
  /**
   * - "render"     : il primo paint di React (auto-pass, non bloccabile).
   * - "action"     : esegue una funzione imperativa (es. initSessionToken()).
   * - "provider"   : monta un context provider (incrementa il livello della catena).
   * - "navigation" : monta l'app reale (Stack + gate) — step finale.
   */
  kind: BootStepKind;
  /** se true, un fallimento di questo step impedisce l'avvio dell'app. */
  blocksBoot: boolean;
  /**
   * Solo per gli step `kind: "action"`: dove/quando avviene DAVVERO il lavoro.
   * Serve a rendere il BootGate veritiero su cosa esegue alla conferma "Sì",
   * evitando falsi "passed":
   *  - "imperative"  : il controller chiama QUI una funzione (es. initSessionToken()).
   *  - "module-load" : il lavoro è GIÀ avvenuto come side-effect all'import di
   *                    _layout.tsx (pre-render); "Sì" lo conferma soltanto.
   *  - "mount-hook"  : parte da un hook quando l'app reale monta; non è
   *                    eseguibile in isolamento dentro il gate.
   * Assente per render/provider/navigation (l'esecuzione è implicita nel kind).
   */
  execution?: "imperative" | "module-load" | "mount-hook";

  // ── Sezione B — dettaglio tecnico (per l'agente) ────────────────────────────
  /** file sorgente e nome funzione/componente esatti. */
  module: string;
  /** cosa consuma: DB tables, env vars, stato in memoria, AsyncStorage. */
  reads: string;
  /** cosa produce: DB tables, variabili di stato, context React, cache. */
  writes: string;
  /** step precedenti obbligatori. */
  dependsOn: string;
  /** step successivi che si bloccano se questo fallisce. */
  dependedBy: string;
  /** ms configurato + comportamento alla scadenza (fatal/warn/skip). */
  timeout: string;
  /** motivazione architetturale della posizione. */
  positionReason: string;
  /** race condition note, dipendenze fragili, differenze dev/prod. */
  knownRisks: string;
}

/**
 * Ordine reale di inizializzazione ricostruito da `app/_layout.tsx`,
 * `hooks/useAppBootstrap.ts`, `hooks/useOtaAutoUpdate.ts` e
 * `components/RootProviders.tsx`.
 *
 * Gli step con `kind: "provider"` hanno un `id` che combacia 1:1 con un layer di
 * `PROVIDER_LAYERS` in `components/RootProviders.tsx`: BootGateProviderChain li
 * monta nello stesso ordine, uno per ogni conferma "Sì".
 */
export const BOOT_GATE_STEPS: BootStep[] = [
  {
    id: "react_render",
    label: "Render React",
    description: "L'app disegna la prima schermata. Se vedi questo elenco, React funziona.",
    originalOrder: 1,
    kind: "render",
    blocksBoot: true,
    module: "app/_layout.tsx → RootLayout()",
    reads: "—",
    writes: "primo commit React (BootGateScreen)",
    dependsOn: "bundle JS valutato senza errori di sintassi/import",
    dependedBy: "tutti gli step successivi",
    timeout: "nessuno (auto-pass)",
    positionReason: "Spostato al primo posto (Task #4979): React deve renderizzare PRIMA di qualsiasi provider/context, così un crash nei provider non impedisce di mostrare la diagnostica.",
    knownRisks: "Un errore a livello di valutazione di un modulo importato in cima a _layout.tsx avviene prima di questo step e non è catturabile qui.",
  },
  {
    id: "splash_prevent",
    label: "Blocco splash",
    description: "Tiene visibile la schermata d'avvio (casco) finché l'app non è pronta.",
    originalOrder: 2,
    kind: "action",
    blocksBoot: false,
    execution: "module-load",
    module: "app/_layout.tsx → SplashScreen.preventAutoHideAsync()",
    reads: "—",
    writes: "stato nativo splash screen",
    dependsOn: "react_render",
    dependedBy: "—",
    timeout: "nessuno",
    positionReason: "Chiamato a module-load così lo splash non sparisce prima che il bootstrap completi.",
    knownRisks: "Se hideAsync() non viene mai chiamato (gate appeso) lo splash resta su per sempre. useAppBootstrap ha un safety-timeout di 5s.",
  },
  {
    id: "sentry_init",
    label: "Sentry",
    description: "Avvia il sistema di raccolta crash. Se fallisce, l'app continua senza report crash.",
    originalOrder: 3,
    kind: "action",
    blocksBoot: false,
    execution: "module-load",
    module: "lib/sentry.ts → initSentry() (import dinamico in _layout.tsx)",
    reads: "env: SENTRY_DSN / EXPO_PUBLIC_SENTRY_DSN",
    writes: "client Sentry globale",
    dependsOn: "react_render",
    dependedBy: "—",
    timeout: "nessuno (best-effort, .catch ignora)",
    positionReason: "Import dinamico non bloccante a module-load per catturare errori il prima possibile senza ritardare il boot.",
    knownRisks: "Init pesante può rubare tempo CPU al cold start; per questo è dinamico e best-effort.",
  },
  {
    id: "online_focus_manager",
    label: "Online/Focus manager",
    description: "Collega le richieste di rete allo stato online e all'app in primo piano.",
    originalOrder: 4,
    kind: "action",
    blocksBoot: false,
    execution: "module-load",
    module: "lib/online-focus-manager.ts → initOnlineFocusManager()",
    reads: "NetInfo, AppState",
    writes: "React Query onlineManager/focusManager",
    dependsOn: "react_render",
    dependedBy: "query (le query si mettono in pausa offline)",
    timeout: "nessuno",
    positionReason: "Deve essere wired prima che le query partano, così pausano offline e riprendono coordinato al riaggancio.",
    knownRisks: "Listener NetInfo/AppState non rimossi possono accumularsi; init idempotente.",
  },
  {
    id: "background_telemetry_task",
    label: "Task telemetria background",
    description: "Registra il compito che invia la telemetria di guida anche in background.",
    originalOrder: 5,
    kind: "action",
    blocksBoot: false,
    execution: "module-load",
    module: "lib/background-telemetry-task.ts (side-effect import in _layout.tsx)",
    reads: "expo-task-manager registry",
    writes: "definizione TASK_TELEMETRY",
    dependsOn: "react_render",
    dependedBy: "AutoTelemetryProvider",
    timeout: "nessuno",
    positionReason: "Import side-effect in cima così il task è definito prima che qualunque componente lo avvii.",
    knownRisks: "Se il modulo nativo expo-task-manager manca nell'APK, l'import può lanciare 'Cannot find native module'.",
  },
  {
    id: "token_init",
    label: "Token sessione",
    description: "Carica il token di accesso salvato così le chiamate al server sono autenticate.",
    originalOrder: 6,
    kind: "action",
    blocksBoot: false,
    execution: "imperative",
    module: "lib/query-client.ts → initSessionToken() (via useAppBootstrap)",
    reads: "AsyncStorage (token di sessione)",
    writes: "token in memoria nel query-client; setTokenReady(true)",
    dependsOn: "react_render",
    dependedBy: "ota_auto_update, device metrics, tutte le query autenticate",
    timeout: "3000ms (TOKEN_INIT_TIMEOUT_MS) → prosegue comunque, tokenReady=true",
    positionReason: "Primissima operazione del bootstrap: i consumer montati subito dopo devono trovare il token già in cache per non inviare richieste anonime.",
    knownRisks: "AsyncStorage lento/saturo al cold start: il timeout garantisce che tokenReady diventi sempre true.",
  },
  {
    id: "fonts_load",
    label: "Caricamento font",
    description: "Carica i caratteri Inter. Se fallisce, l'app usa i font di sistema.",
    originalOrder: 7,
    kind: "action",
    blocksBoot: false,
    execution: "mount-hook",
    module: "hooks/useAppBootstrap.ts → useFonts(Inter_*)",
    reads: "asset font @expo-google-fonts/inter",
    writes: "fontsLoaded/fontError; ready=true; SplashScreen.hideAsync()",
    dependsOn: "react_render",
    dependedBy: "StartupGate (ready)",
    timeout: "5000ms (SPLASH_SAFETY_TIMEOUT_MS) → apre comunque il gate",
    positionReason: "Gate fonts→ready: l'app passa a stato renderizzabile quando i font sono pronti o allo scadere del safety-timeout.",
    knownRisks: "fontError gestito insieme a fontsLoaded per non restare su splash bianco per sempre.",
  },
  {
    id: "theme",
    label: "Tema",
    description: "Imposta i colori chiari/scuri dell'app.",
    originalOrder: 8,
    kind: "provider",
    blocksBoot: true,
    module: "lib/theme-context.tsx → ThemeProvider",
    reads: "AsyncStorage (preferenza tema)",
    writes: "context tema (colors)",
    dependsOn: "react_render",
    dependedBy: "tutti i componenti che usano useColors/useTheme",
    timeout: "nessuno",
    positionReason: "Outermost dopo ErrorBoundary: i colori servono a quasi tutti i provider/UI sottostanti.",
    knownRisks: "Cambio tema al boot ha già causato loop setOptions in React Navigation (fix: costanti statiche + NavThemeProviderBridge).",
  },
  {
    id: "language",
    label: "Lingua",
    description: "Carica la lingua scelta (IT/EN) per tutti i testi.",
    originalOrder: 9,
    kind: "provider",
    blocksBoot: true,
    module: "lib/language-context.tsx → LanguageProvider",
    reads: "AsyncStorage (lingua)",
    writes: "context lingua (renderKey, t())",
    dependsOn: "theme",
    dependedBy: "tutti i componenti con testo localizzato",
    timeout: "nessuno",
    positionReason: "Sopra al query provider così i messaggi d'errore di rete sono già localizzati.",
    knownRisks: "renderKey cambia → re-render a cascata; gestito.",
  },
  {
    id: "query",
    label: "Cache dati (React Query)",
    description: "Avvia la cache delle richieste al server e la ripristina dal disco.",
    originalOrder: 10,
    kind: "provider",
    blocksBoot: true,
    module: "components/RootProviders.tsx → QueryLayer (QueryClientProvider)",
    reads: "—",
    writes: "QueryClient in memoria",
    dependsOn: "language, online_focus_manager",
    dependedBy: "auth e ogni useQuery/useMutation",
    timeout: "nessuno",
    positionReason: "Sopra AuthProvider perché l'auth usa React Query per la sessione utente.",
    knownRisks: "—",
  },
  {
    id: "auth",
    label: "Autenticazione",
    description: "Verifica chi è l'utente loggato.",
    originalOrder: 11,
    kind: "provider",
    blocksBoot: true,
    module: "lib/auth-context.tsx → AuthProvider",
    reads: "AsyncStorage (token), GET /api/auth/me (React Query)",
    writes: "context auth (user, refetch)",
    dependsOn: "query, token_init",
    dependedBy: "chat_sse, navigazione (redirect ottimistico), gran parte della UI",
    timeout: "dipende dalla query auth",
    positionReason: "Subito sotto al query provider; molti provider e gate dipendono dall'utente.",
    knownRisks: "Redirect ottimistico a (tabs) con user=undefined ha causato boot-loop (fix: seed cache auth prima di abilitare la query).",
  },
  {
    id: "chat_sse",
    label: "Chat in tempo reale",
    description: "Apre il canale per i messaggi in tempo reale (solo se loggato).",
    originalOrder: 12,
    kind: "provider",
    blocksBoot: false,
    module: "components/RootProviders.tsx → ChatSseGate → lib/chat-sse-provider.tsx",
    reads: "context auth (user), SSE endpoint chat",
    writes: "context chat SSE",
    dependsOn: "auth",
    dependedBy: "schermate chat",
    timeout: "riconnessione gestita internamente",
    positionReason: "Deve stare sotto AuthProvider perché usa useAuth per abilitarsi solo da loggati.",
    knownRisks: "Connessione SSE che ritenta in loop può consumare batteria; gating su user.",
  },
  {
    id: "map_settings",
    label: "Impostazioni mappa",
    description: "Carica le preferenze della mappa (stile, tracce).",
    originalOrder: 13,
    kind: "provider",
    blocksBoot: false,
    module: "lib/map-context.tsx → MapSettingsProvider",
    reads: "AsyncStorage / GET /api/settings/* (config mappa)",
    writes: "context mappa (isLoading, config)",
    dependsOn: "auth",
    dependedBy: "MapReadyGate, schermate mappa",
    timeout: "dipende dalla query settings",
    positionReason: "Sotto auth perché alcune impostazioni mappa sono per-utente.",
    knownRisks: "MapReadyGate non deve restituire null/loader senza children o smonta lo Stack (fix: pass-through).",
  },
  {
    id: "taskbar_style",
    label: "Stile barra inferiore",
    description: "Imposta l'aspetto della barra di navigazione in basso.",
    originalOrder: 14,
    kind: "provider",
    blocksBoot: false,
    module: "lib/taskbar-style-context.tsx → TaskbarStyleProvider",
    reads: "AsyncStorage (stile taskbar)",
    writes: "context stile taskbar",
    dependsOn: "map_settings",
    dependedBy: "TabBar custom",
    timeout: "nessuno",
    positionReason: "Raggruppato con gli altri provider di preferenze UI.",
    knownRisks: "—",
  },
  {
    id: "units",
    label: "Unità di misura",
    description: "Sceglie km/miglia e altre unità.",
    originalOrder: 15,
    kind: "provider",
    blocksBoot: false,
    module: "lib/units-context.tsx → UnitsProvider",
    reads: "AsyncStorage (unità)",
    writes: "context unità",
    dependsOn: "taskbar_style",
    dependedBy: "UI che mostra distanze/velocità",
    timeout: "nessuno",
    positionReason: "Provider di preferenza leggero.",
    knownRisks: "—",
  },
  {
    id: "location",
    label: "Posizione GPS",
    description: "Prepara l'accesso alla posizione (non chiede ancora il permesso).",
    originalOrder: 16,
    kind: "provider",
    blocksBoot: false,
    module: "lib/location-context.tsx → LocationProvider",
    reads: "permessi posizione, expo-location",
    writes: "context posizione (hasLocationPermission)",
    dependsOn: "units",
    dependedBy: "GpsAlwaysGate, mappa, PermissionGrantBeacon",
    timeout: "nessuno (permesso richiesto on-demand)",
    positionReason: "Sotto i provider di preferenze, sopra il player/widget.",
    knownRisks: "Su web expo-location non è supportato: usare web geolocation; gestito con Platform check.",
  },
  {
    id: "player",
    label: "Player musicale",
    description: "Avvia il lettore musicale integrato.",
    originalOrder: 17,
    kind: "provider",
    blocksBoot: false,
    module: "lib/player-context.tsx → PlayerProvider",
    reads: "stato player, audio",
    writes: "context player",
    dependsOn: "location",
    dependedBy: "mini-player, radio",
    timeout: "nessuno",
    positionReason: "Provider di funzionalità, sotto i provider di base.",
    knownRisks: "—",
  },
  {
    id: "floating_widget",
    label: "Widget flottante",
    description: "Prepara il pallino flottante (assistente / scorciatoie).",
    originalOrder: 18,
    kind: "provider",
    blocksBoot: false,
    module: "lib/floating-widget-context.tsx → FloatingWidgetProvider",
    reads: "AsyncStorage (posizione widget)",
    writes: "context widget flottante",
    dependsOn: "player",
    dependedBy: "FloatingWidget",
    timeout: "nessuno",
    positionReason: "Provider UI, vicino agli altri overlay.",
    knownRisks: "Overlay fullscreen può mangiare i tap su Android (fix: box-none + elevation).",
  },
  {
    id: "gesture_handler",
    label: "Gestione gesti",
    description: "Abilita swipe e gesti su tutta l'app.",
    originalOrder: 19,
    kind: "provider",
    blocksBoot: true,
    module: "components/RootProviders.tsx → GestureHandlerRootView",
    reads: "—",
    writes: "root view gesti (flex:1)",
    dependsOn: "floating_widget",
    dependedBy: "qualsiasi gesto/scroll/bottom-sheet",
    timeout: "nessuno",
    positionReason: "Deve avvolgere l'albero di rendering visibile per intercettare i gesti; tenuto vicino alla UI.",
    knownRisks: "Se manca, i gesti non funzionano ma l'app non crasha necessariamente.",
  },
  // NOTE: uptime_widget, keyboard, auto_telemetry rimossi intenzionalmente (OTA 155-safe).
  // Verranno reintrodotti DOPO che il BootGate avrà identificato la root cause del loop boot.
  {
    id: "ota_auto_update",
    label: "Controllo aggiornamenti OTA",
    description: "Controlla se c'è un aggiornamento autorizzato e, se sì, lo applica.",
    originalOrder: 23,
    kind: "action",
    blocksBoot: false,
    execution: "mount-hook",
    module: "hooks/useOtaAutoUpdate.ts → useOtaAutoUpdate(tokenReady)",
    reads: "token, GET /api/ota/manifest, expo-updates, AsyncStorage (device id, pending)",
    writes: "POST /api/ota/event, eventualmente Updates.reloadAsync()",
    dependsOn: "token_init",
    dependedBy: "—",
    timeout: "attende interattività + 4000ms (OTA_STARTUP_DELAY_MS) prima di toccare EAS",
    positionReason: "Ritardato dopo che l'app è montata e interattiva: un reload durante lo splash può saturare il bridge e chiudere l'app al cold start.",
    knownRisks: "Le OTA pending NON si auto-applicano (solo admin via 'Prova OTA'); reload al primo mount è rischioso → ritardato.",
  },
  {
    id: "app_mount",
    label: "Avvio app completa",
    description: "Monta la navigazione e tutte le schermate. Ultimo passo: l'app è pronta.",
    originalOrder: 24,
    kind: "navigation",
    blocksBoot: true,
    module: "app/_layout.tsx → StartupGate › NativeUpdateChecker › MapReadyGate › RootLayoutNav (Stack)",
    reads: "context ready, mappa, auth",
    writes: "albero di navigazione Expo Router montato",
    dependsOn: "tutti i provider + fonts_load (ready)",
    dependedBy: "—",
    timeout: "StartupGate è pass-through (mai null)",
    positionReason: "Step finale: la navigazione si monta solo dopo che provider e bootstrap sono pronti. StartupGate/MapReadyGate sono pass-through per non smontare lo Stack.",
    knownRisks: "Gate che restituiscono null smontano lo Stack → +not-found loop; inline screenOptions/options → loop setOptions. Tutti i fix sono attivi.",
  },
];

/** id degli step provider, nell'ordine outer→inner della catena. */
export const PROVIDER_STEP_IDS: string[] = BOOT_GATE_STEPS.filter(
  (s) => s.kind === "provider",
).map((s) => s.id);

export function getBootStep(id: string): BootStep | undefined {
  return BOOT_GATE_STEPS.find((s) => s.id === id);
}
