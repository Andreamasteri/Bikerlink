import { Stack } from "expo-router";
import { useColors } from "@/hooks/useColors";

export default function AdminLayout() {
  const colors = useColors();
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.accent,
        headerTitleStyle: { color: colors.text, fontFamily: "Inter_600SemiBold" },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
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
      <Stack.Screen name="ota-history" options={{ title: "Storico OTA" }} />
      <Stack.Screen name="motoclubs" options={{ title: "Clubs" }} />
      <Stack.Screen name="invite-codes" options={{ title: "Codici Invito" }} />
      <Stack.Screen name="backup" options={{ title: "Backup automatici" }} />
      <Stack.Screen name="system" options={{ title: "System Monitor" }} />
      <Stack.Screen name="eventi" options={{ title: "Raduni — Moderazione" }} />
      <Stack.Screen name="traduzioni" options={{ title: "Sistema Traduzioni" }} />
      <Stack.Screen name="gps-errors" options={{ title: "GPS Error Log" }} />
      <Stack.Screen name="sensors" options={{ headerShown: false }} />
      <Stack.Screen name="moderator-logs" options={{ title: "Log Moderatori" }} />
      <Stack.Screen name="blocks" options={{ title: "Blocchi tra utenti" }} />
      <Stack.Screen name="crash-logs" options={{ title: "Log Riavvii App" }} />
      <Stack.Screen name="newsletter" options={{ title: "Iscritti Newsletter" }} />
      <Stack.Screen name="match-inspector" options={{ title: "Match Inspector" }} />
      <Stack.Screen name="match-inspector-detail" options={{ title: "Dettaglio Match" }} />
      <Stack.Screen name="match-control" options={{ title: "Controllo Matching" }} />
      <Stack.Screen name="match-health" options={{ title: "Match Engine Health" }} />
    </Stack>
  );
}
