import { Stack } from "expo-router";
import Colors from "@/constants/colors";

export default function AdminLayout() {
  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.text, contentStyle: { backgroundColor: Colors.background } }}>
      <Stack.Screen name="index" options={{ headerTitle: "Pannello Admin" }} />
      <Stack.Screen name="users" options={{ headerTitle: "Gestione Utenti" }} />
      <Stack.Screen name="ads" options={{ headerTitle: "Gestione Annunci" }} />
      <Stack.Screen name="workshops" options={{ headerTitle: "Gestione Officine" }} />
      <Stack.Screen name="settings" options={{ headerTitle: "Impostazioni App" }} />
      <Stack.Screen name="easter-eggs" options={{ headerTitle: "Easter Eggs" }} />
      <Stack.Screen name="reports" options={{ headerTitle: "Segnalazioni" }} />
      <Stack.Screen name="moderator-logs" options={{ headerTitle: "Log Moderatori" }} />
      <Stack.Screen name="analytics" options={{ headerTitle: "Analytics" }} />
      <Stack.Screen name="invitation-codes" options={{ headerTitle: "Codici Invito" }} />
      <Stack.Screen name="feedback" options={{ headerTitle: "Bug & Richieste" }} />
    </Stack>
  );
}
