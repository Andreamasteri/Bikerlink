import React from "react";
import { View } from "react-native";
import { Stack } from "expo-router";
import { useColors } from "@/hooks/useColors";

export default function AdminLayout() {
  const colors = useColors();
  const adminScreenOptions = React.useMemo(() => ({
    headerShown: true,
    headerStyle: { backgroundColor: colors.surface },
    headerTintColor: colors.accent,
    headerTitleStyle: { color: colors.text, fontFamily: "Inter_600SemiBold" },
    contentStyle: { backgroundColor: colors.background },
  }), [colors.surface, colors.accent, colors.text, colors.background]);
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack screenOptions={adminScreenOptions}>
        <Stack.Screen name="index" options={{ title: "Pannello Admin" }} />
        <Stack.Screen name="users" options={{ title: "Gestione Utenti" }} />
        <Stack.Screen name="workshops" options={{ title: "Gestione Officine" }} />
        <Stack.Screen name="easter-eggs" options={{ title: "Easter Eggs" }} />
        <Stack.Screen name="ads" options={{ title: "Campagne" }} />
        <Stack.Screen name="reports" options={{ title: "Bugs & Co" }} />
        <Stack.Screen name="analytics" options={{ title: "Analytics" }} />
        <Stack.Screen name="settings" options={{ title: "Impostazioni" }} />
        <Stack.Screen name="privacy" options={{ title: "Gestione Privacy" }} />
        <Stack.Screen name="performance" options={{ title: "Record Performance" }} />
        <Stack.Screen name="stregatti" options={{ title: "Stregatti" }} />
        <Stack.Screen name="db-debug" options={{ title: "DB Debug" }} />
        <Stack.Screen name="db-tables" options={{ title: "Dimensioni DB" }} />
        <Stack.Screen name="motoclubs" options={{ title: "Clubs" }} />
        <Stack.Screen name="invite-codes" options={{ title: "Codici Invito" }} />
        <Stack.Screen name="backup" options={{ title: "Backup automatici" }} />
        <Stack.Screen name="exports" options={{ title: "Export Dati" }} />
        <Stack.Screen name="system" options={{ title: "System Monitor" }} />
        <Stack.Screen name="resource-monitor" options={{ title: "Risorse & Salute App" }} />
        <Stack.Screen name="eventi" options={{ title: "Raduni — Moderazione" }} />
        <Stack.Screen name="tabella-lingue" options={{ title: "Tabella Lingue" }} />
        <Stack.Screen name="gps-errors" options={{ title: "GPS Error Log" }} />
        <Stack.Screen name="gps-rejections" options={{ title: "GPS Rifiutati" }} />
        <Stack.Screen name="sensors" options={{ headerShown: false }} />
        <Stack.Screen name="moderator-logs" options={{ title: "Log Moderatori" }} />
        <Stack.Screen name="false-reports" options={{ title: "False Segnalazioni" }} />
        <Stack.Screen name="reports-hub" options={{ title: "Hub Report" }} />
        <Stack.Screen name="reports-by-category" options={{ title: "Report per Categoria" }} />
        <Stack.Screen name="reports-by-role" options={{ title: "Report per Ruolo" }} />
        <Stack.Screen name="reports-patterns" options={{ title: "Pattern Segnalazioni" }} />
        <Stack.Screen name="active-bans" options={{ title: "Ban Attivi" }} />
        <Stack.Screen name="reports-thresholds" options={{ title: "Soglie & Policy" }} />
        <Stack.Screen name="blocks" options={{ title: "Blocchi tra utenti" }} />
        <Stack.Screen name="crash-logs" options={{ title: "Log Riavvii App" }} />
        <Stack.Screen name="restart-history" options={{ title: "Storico Riavvii" }} />
        <Stack.Screen name="newsletter" options={{ title: "Iscritti Newsletter" }} />
        <Stack.Screen name="visitatori" options={{ title: "Counter Visitatori Sito" }} />
        <Stack.Screen name="matching-hub" options={{ title: "Hub Matching" }} />
        <Stack.Screen name="matching-telemetry" options={{ title: "Telemetria Matching" }} />
        <Stack.Screen name="match-inspector" options={{ title: "Match Inspector" }} />
        <Stack.Screen name="match-inspector-detail" options={{ title: "Dettaglio Match" }} />
        <Stack.Screen name="match-control" options={{ title: "Controllo Matching" }} />
        <Stack.Screen name="match-health" options={{ title: "Match Engine Health" }} />
        <Stack.Screen name="match-engine" options={{ title: "Motore Matching" }} />
        <Stack.Screen name="match-rules" options={{ title: "Regole Matching" }} />
        <Stack.Screen name="ab" options={{ title: "A/B Esperimenti" }} />
        <Stack.Screen name="match-preferences-edit" options={{ title: "Preferenze Matching" }} />
        <Stack.Screen name="negative-pref-patterns" options={{ title: "Pattern Pref. Negative" }} />
        <Stack.Screen name="ota" options={{ title: "Controllo OTA" }} />
        <Stack.Screen name="maps" options={{ title: "Sistema Mappe" }} />
        <Stack.Screen name="routing-hub" options={{ title: "Hub Routing" }} />
        <Stack.Screen name="routing-control" options={{ title: "Controllo Routing" }} />
        <Stack.Screen name="routing-health" options={{ title: "Routing Health" }} />
        <Stack.Screen name="routing-areas" options={{ title: "Aree di routing" }} />
        <Stack.Screen name="routing-functions" options={{ title: "Funzioni per engine" }} />
        <Stack.Screen name="device-stats" options={{ title: "Dispositivi Utenti" }} />
        <Stack.Screen name="tags" options={{ title: "Sistema Tag" }} />
        <Stack.Screen name="text-aliases" options={{ title: "Alias Testo" }} />
        <Stack.Screen name="ai-moderation-stats" options={{ title: "Co-Pilot AI — Stats" }} />
        <Stack.Screen name="ai-moderation-settings" options={{ title: "Co-Pilot AI — Settings" }} />
        <Stack.Screen name="ai-moderation-digest" options={{ title: "Co-Pilot AI — Digest" }} />
        <Stack.Screen name="db-integrity" options={{ title: "AI DB Integrity" }} />
        <Stack.Screen name="db-integrity-quarantine" options={{ title: "DB Integrity — Quarantena" }} />
        <Stack.Screen name="app-integrity" options={{ title: "AI App Integrity" }} />
        <Stack.Screen name="ai-console" options={{ title: "AI Console" }} />
        <Stack.Screen name="ai-pinned" options={{ title: "AI — Insight Pinnati" }} />
        <Stack.Screen name="ai-layer" options={{ title: "AI Layer" }} />
        <Stack.Screen name="ai-hub" options={{ title: "Hub AI" }} />
        <Stack.Screen name="whisper-config" options={{ title: "Voce & Trascrizione" }} />
        <Stack.Screen name="telemetry-users" options={{ title: "Sessioni Utenti" }} />
        <Stack.Screen name="telemetry-user/[userId]" options={{ title: "Dettaglio Sessioni" }} />
        <Stack.Screen name="boot-log" options={{ title: "Boot Log Avvio" }} />
        <Stack.Screen name="metro-crashes" options={{ title: "Crash Metro" }} />
      </Stack>
    </View>
  );
}
