import { View, StyleSheet } from "react-native";
import { Stack } from "expo-router";
import Colors from "@/constants/colors";

// ANTI-LOOP: costante statica — non dipende da useColors()/tema dinamico.
// useMemo con deps colors.* creava un nuovo oggetto ad ogni tema-load dal server
// → screenOptions prop cambiava → React Navigation setOptions cascade su tutti
// gli Stack.Screen → "Maximum update depth exceeded". Stesso bug fixato per i
// tab in OTA #187. I colori header vengono gestiti a livello navigation theme
// da NavThemeProviderBridge senza mai chiamare setOptions.
const ADMIN_SCREEN_OPTIONS = {
  headerShown: true,
  headerStyle: { backgroundColor: Colors.surface },
  headerTintColor: Colors.accent,
  headerTitleStyle: { color: Colors.text, fontFamily: "Inter_600SemiBold" },
  contentStyle: { backgroundColor: Colors.background },
} as const;

const ADMIN_CONTAINER_STYLE = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
}).root;

const ADMIN_OPTS: Record<string, { title: string } | { headerShown: false }> = {
  "index": { title: "Pannello Admin" },
  "users": { title: "Gestione Utenti" },
  "workshops": { title: "Gestione Officine" },
  "easter-eggs": { title: "Easter Eggs" },
  "ads": { title: "Campagne" },
  "reports": { title: "Bugs & Co" },
  "analytics": { title: "Analytics" },
  "settings": { title: "Impostazioni" },
  "privacy": { title: "Gestione Privacy" },
  "performance": { title: "Record Performance" },
  "stregatti": { title: "Stregatti" },
  "db-debug": { title: "DB Debug" },
  "db-tables": { title: "Dimensioni DB" },
  "motoclubs": { title: "Clubs" },
  "invite-codes": { title: "Codici Invito" },
  "backup": { title: "Backup automatici" },
  "exports": { title: "Export Dati" },
  "system": { title: "System Monitor" },
  "resource-monitor": { title: "Risorse & Salute App" },
  "db-monitor": { title: "Database Monitor" },
  "eventi": { title: "Raduni — Moderazione" },
  "tabella-lingue": { title: "Tabella Lingue" },
  "gps-errors": { title: "GPS Error Log" },
  "gps-rejections": { title: "GPS Rifiutati" },
  "sensors": { headerShown: false },
  "moderator-logs": { title: "Log Moderatori" },
  "false-reports": { title: "False Segnalazioni" },
  "reports-hub": { title: "Hub Report" },
  "reports-by-category": { title: "Report per Categoria" },
  "reports-by-role": { title: "Report per Ruolo" },
  "reports-patterns": { title: "Pattern Segnalazioni" },
  "active-bans": { title: "Ban Attivi" },
  "reports-thresholds": { title: "Soglie & Policy" },
  "blocks": { title: "Blocchi tra utenti" },
  "crash-logs": { title: "Log Riavvii App" },
  "restart-history": { title: "Storico Riavvii" },
  "newsletter": { title: "Iscritti Newsletter" },
  "marketing": { title: "Business Reach" },
  "visitatori": { title: "Counter Visitatori Sito" },
  "matching-hub": { title: "Hub Matching" },
  "matching-telemetry": { title: "Telemetria Matching" },
  "match-inspector": { title: "Match Inspector" },
  "match-inspector-detail": { title: "Dettaglio Match" },
  "match-control": { title: "Controllo Matching" },
  "match-health": { title: "Match Engine Health" },
  "match-engine": { title: "Motore Matching" },
  "match-rules": { title: "Regole Matching" },
  "ab": { title: "A/B Esperimenti" },
  "match-preferences-edit": { title: "Preferenze Matching" },
  "negative-pref-patterns": { title: "Pattern Pref. Negative" },
  "ota": { title: "Controllo OTA" },
  "maps": { title: "Sistema Mappe" },
  "routing-hub": { title: "Hub Routing" },
  "routing-control": { title: "Controllo Routing" },
  "routing-health": { title: "Routing Health" },
  "routing-areas": { title: "Aree di routing" },
  "routing-functions": { title: "Funzioni per engine" },
  "device-stats": { title: "Dispositivi Utenti" },
  "tags": { title: "Sistema Tag" },
  "text-aliases": { title: "Alias Testo" },
  "ai-moderation-stats": { title: "Co-Pilot AI — Stats" },
  "ai-moderation-settings": { title: "Co-Pilot AI — Settings" },
  "ai-moderation-digest": { title: "Co-Pilot AI — Digest" },
  "db-integrity": { title: "AI DB Integrity" },
  "db-integrity-quarantine": { title: "DB Integrity — Quarantena" },
  "app-integrity": { title: "AI App Integrity" },
  "ai-console": { title: "AI Console" },
  "ai-pinned": { title: "AI — Insight Pinnati" },
  "ai-layer": { title: "AI Layer" },
  "ai-hub": { title: "Hub AI" },
  "nadir": { title: "Nadir — Ricerca semantica" },
  "horus-scan": { title: "Horus — Scansioni complete" },
  "ares-jobs": { title: "Ares — Job on-demand" },
  "whisper-config": { title: "Voce & Trascrizione" },
  "telemetry-users": { title: "Sessioni Utenti" },
  "telemetry-user/[userId]": { title: "Dettaglio Sessioni" },
  "boot-log": { title: "Boot Log Avvio" },
  "boot-gate": { title: "BootGate — Bisect Avvio" },
  "metro-crashes": { title: "Crash Metro" },
  "ai-assistant": { title: "Bowie" },
  "bowie-standalone": { title: "Bowie · Standalone" },
  "ai-group-chat": { title: "Tavola Rotonda AI" },
  "match-explain": { title: "Explain Matching" },
  "ai-assistant-config": { title: "Bowie Config" },
  "background-location": { title: "Posizione Background" },
} as const;

export default function AdminLayout() {
  return (
    <View style={ADMIN_CONTAINER_STYLE}>
      <Stack screenOptions={ADMIN_SCREEN_OPTIONS}>
        <Stack.Screen name="index" options={ADMIN_OPTS["index"]} />
        <Stack.Screen name="users" options={ADMIN_OPTS["users"]} />
        <Stack.Screen name="workshops" options={ADMIN_OPTS["workshops"]} />
        <Stack.Screen name="easter-eggs" options={ADMIN_OPTS["easter-eggs"]} />
        <Stack.Screen name="ads" options={ADMIN_OPTS["ads"]} />
        <Stack.Screen name="reports" options={ADMIN_OPTS["reports"]} />
        <Stack.Screen name="analytics" options={ADMIN_OPTS["analytics"]} />
        <Stack.Screen name="settings" options={ADMIN_OPTS["settings"]} />
        <Stack.Screen name="privacy" options={ADMIN_OPTS["privacy"]} />
        <Stack.Screen name="performance" options={ADMIN_OPTS["performance"]} />
        <Stack.Screen name="stregatti" options={ADMIN_OPTS["stregatti"]} />
        <Stack.Screen name="db-debug" options={ADMIN_OPTS["db-debug"]} />
        <Stack.Screen name="db-tables" options={ADMIN_OPTS["db-tables"]} />
        <Stack.Screen name="motoclubs" options={ADMIN_OPTS["motoclubs"]} />
        <Stack.Screen name="invite-codes" options={ADMIN_OPTS["invite-codes"]} />
        <Stack.Screen name="backup" options={ADMIN_OPTS["backup"]} />
        <Stack.Screen name="exports" options={ADMIN_OPTS["exports"]} />
        <Stack.Screen name="system" options={ADMIN_OPTS["system"]} />
        <Stack.Screen name="resource-monitor" options={ADMIN_OPTS["resource-monitor"]} />
        <Stack.Screen name="eventi" options={ADMIN_OPTS["eventi"]} />
        <Stack.Screen name="tabella-lingue" options={ADMIN_OPTS["tabella-lingue"]} />
        <Stack.Screen name="gps-errors" options={ADMIN_OPTS["gps-errors"]} />
        <Stack.Screen name="gps-rejections" options={ADMIN_OPTS["gps-rejections"]} />
        <Stack.Screen name="sensors" options={ADMIN_OPTS["sensors"]} />
        <Stack.Screen name="moderator-logs" options={ADMIN_OPTS["moderator-logs"]} />
        <Stack.Screen name="false-reports" options={ADMIN_OPTS["false-reports"]} />
        <Stack.Screen name="reports-hub" options={ADMIN_OPTS["reports-hub"]} />
        <Stack.Screen name="reports-by-category" options={ADMIN_OPTS["reports-by-category"]} />
        <Stack.Screen name="reports-by-role" options={ADMIN_OPTS["reports-by-role"]} />
        <Stack.Screen name="reports-patterns" options={ADMIN_OPTS["reports-patterns"]} />
        <Stack.Screen name="active-bans" options={ADMIN_OPTS["active-bans"]} />
        <Stack.Screen name="reports-thresholds" options={ADMIN_OPTS["reports-thresholds"]} />
        <Stack.Screen name="blocks" options={ADMIN_OPTS["blocks"]} />
        <Stack.Screen name="crash-logs" options={ADMIN_OPTS["crash-logs"]} />
        <Stack.Screen name="restart-history" options={ADMIN_OPTS["restart-history"]} />
        <Stack.Screen name="newsletter" options={ADMIN_OPTS["newsletter"]} />
        <Stack.Screen name="marketing" options={ADMIN_OPTS["marketing"]} />
        <Stack.Screen name="visitatori" options={ADMIN_OPTS["visitatori"]} />
        <Stack.Screen name="matching-hub" options={ADMIN_OPTS["matching-hub"]} />
        <Stack.Screen name="matching-telemetry" options={ADMIN_OPTS["matching-telemetry"]} />
        <Stack.Screen name="match-inspector" options={ADMIN_OPTS["match-inspector"]} />
        <Stack.Screen name="match-inspector-detail" options={ADMIN_OPTS["match-inspector-detail"]} />
        <Stack.Screen name="match-control" options={ADMIN_OPTS["match-control"]} />
        <Stack.Screen name="match-health" options={ADMIN_OPTS["match-health"]} />
        <Stack.Screen name="match-engine" options={ADMIN_OPTS["match-engine"]} />
        <Stack.Screen name="match-rules" options={ADMIN_OPTS["match-rules"]} />
        <Stack.Screen name="ab" options={ADMIN_OPTS["ab"]} />
        <Stack.Screen name="match-preferences-edit" options={ADMIN_OPTS["match-preferences-edit"]} />
        <Stack.Screen name="negative-pref-patterns" options={ADMIN_OPTS["negative-pref-patterns"]} />
        <Stack.Screen name="ota" options={ADMIN_OPTS["ota"]} />
        <Stack.Screen name="maps" options={ADMIN_OPTS["maps"]} />
        <Stack.Screen name="routing-hub" options={ADMIN_OPTS["routing-hub"]} />
        <Stack.Screen name="routing-control" options={ADMIN_OPTS["routing-control"]} />
        <Stack.Screen name="routing-health" options={ADMIN_OPTS["routing-health"]} />
        <Stack.Screen name="routing-areas" options={ADMIN_OPTS["routing-areas"]} />
        <Stack.Screen name="routing-functions" options={ADMIN_OPTS["routing-functions"]} />
        <Stack.Screen name="device-stats" options={ADMIN_OPTS["device-stats"]} />
        <Stack.Screen name="tags" options={ADMIN_OPTS["tags"]} />
        <Stack.Screen name="text-aliases" options={ADMIN_OPTS["text-aliases"]} />
        <Stack.Screen name="ai-moderation-stats" options={ADMIN_OPTS["ai-moderation-stats"]} />
        <Stack.Screen name="ai-moderation-settings" options={ADMIN_OPTS["ai-moderation-settings"]} />
        <Stack.Screen name="ai-moderation-digest" options={ADMIN_OPTS["ai-moderation-digest"]} />
        <Stack.Screen name="db-integrity" options={ADMIN_OPTS["db-integrity"]} />
        <Stack.Screen name="db-integrity-quarantine" options={ADMIN_OPTS["db-integrity-quarantine"]} />
        <Stack.Screen name="app-integrity" options={ADMIN_OPTS["app-integrity"]} />
        <Stack.Screen name="ai-console" options={ADMIN_OPTS["ai-console"]} />
        <Stack.Screen name="ai-pinned" options={ADMIN_OPTS["ai-pinned"]} />
        <Stack.Screen name="ai-layer" options={ADMIN_OPTS["ai-layer"]} />
        <Stack.Screen name="ai-hub" options={ADMIN_OPTS["ai-hub"]} />
        <Stack.Screen name="nadir" options={ADMIN_OPTS["nadir"]} />
        <Stack.Screen name="horus-scan" options={ADMIN_OPTS["horus-scan"]} />
        <Stack.Screen name="ares-jobs" options={ADMIN_OPTS["ares-jobs"]} />
        <Stack.Screen name="whisper-config" options={ADMIN_OPTS["whisper-config"]} />
        <Stack.Screen name="telemetry-users" options={ADMIN_OPTS["telemetry-users"]} />
        <Stack.Screen name="telemetry-user/[userId]" options={ADMIN_OPTS["telemetry-user/[userId]"]} />
        <Stack.Screen name="boot-log" options={ADMIN_OPTS["boot-log"]} />
        <Stack.Screen name="boot-gate" options={ADMIN_OPTS["boot-gate"]} />
        <Stack.Screen name="metro-crashes" options={ADMIN_OPTS["metro-crashes"]} />
        <Stack.Screen name="ai-assistant" options={ADMIN_OPTS["ai-assistant"]} />
        <Stack.Screen name="bowie-standalone" options={ADMIN_OPTS["bowie-standalone"]} />
        <Stack.Screen name="ai-group-chat" options={ADMIN_OPTS["ai-group-chat"]} />
        <Stack.Screen name="match-explain" options={ADMIN_OPTS["match-explain"]} />
        <Stack.Screen name="ai-assistant-config" options={ADMIN_OPTS["ai-assistant-config"]} />
        <Stack.Screen name="background-location" options={ADMIN_OPTS["background-location"]} />
        <Stack.Screen name="db-monitor" options={ADMIN_OPTS["db-monitor"]} />
      </Stack>
    </View>
  );
}
