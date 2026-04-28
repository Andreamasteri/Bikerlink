// ⚠️ CHECKLIST RELEASE: aggiornare questo numero PRIMA di ogni pubblicazione OTA
// Ciclo 8.0.0 — APK deployata: v41 3.0.0 (buildId e03f51d8…) — unica APK costruita
// per questo runtimeVersion. NOTA: app.json è già bumpato a v42/3.1.0 in preparazione
// della prossima build, ma la build APK v42 non è ancora stata generata (vedi follow-up
// task #1076). OTA-16 (Task #1077): fix ventaglio biker sovrapposti su mappa — il
// plugin OverlappingMarkerSpiderfier viene ora bundlato inline nell'HTML iniettato
// nella WebView (l'URL CDN unpkg /dist/oms.min.js usato da OTA-2..OTA-15 era 404,
// per cui il plugin non veniva mai caricato). Bumpata anche nearbyDistance a 34px e
// aggiunto postMsg di diagnostica omsStatus.
// Aggiornare ad ogni nuova OTA pubblicata.
export const CURRENT_OTA_NUMBER = 16;
