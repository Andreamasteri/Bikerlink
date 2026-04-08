import { Stack } from "expo-router";
import Colors from "@/constants/colors";

export default function AdminLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: Colors.surface },
        headerTintColor: Colors.accent,
        headerTitleStyle: { color: Colors.text, fontFamily: "Inter_600SemiBold" },
        contentStyle: { backgroundColor: Colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Pannello Admin" }} />
      <Stack.Screen name="users" options={{ title: "Gestione Utenti" }} />
      <Stack.Screen name="workshops" options={{ title: "Gestione Officine" }} />
      <Stack.Screen name="easter-eggs" options={{ title: "Easter Eggs" }} />
      <Stack.Screen name="ads" options={{ title: "Campagne" }} />
      <Stack.Screen name="reports" options={{ title: "Segnalazioni" }} />
      <Stack.Screen name="analytics" options={{ title: "Analytics" }} />
      <Stack.Screen name="settings" options={{ title: "Impostazioni" }} />
      <Stack.Screen name="performance" options={{ title: "Record Performance" }} />
      <Stack.Screen name="stregatti" options={{ title: "Stregatti" }} />
      <Stack.Screen name="db-debug" options={{ title: "DB Debug" }} />
      <Stack.Screen name="ota-history" options={{ title: "Storico OTA" }} />
      <Stack.Screen name="motoclubs" options={{ title: "Clubs" }} />
      <Stack.Screen name="invite-codes" options={{ title: "Codici Invito" }} />
      <Stack.Screen name="backup" options={{ title: "Backup automatici" }} />
      <Stack.Screen name="system" options={{ title: "Sistema" }} />
    </Stack>
  );
}
