import { Stack } from "expo-router";
import Colors from "@/constants/colors";

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.surface },
        headerTintColor: Colors.text,
        contentStyle: { backgroundColor: Colors.background },
      }}
    >
      <Stack.Screen name="login" options={{ headerTitle: "Accedi" }} />
      <Stack.Screen name="register" options={{ headerTitle: "Registrati" }} />
      <Stack.Screen name="forgot-password" options={{ headerTitle: "Recupera Password" }} />
      <Stack.Screen name="eula" options={{ headerTitle: "Termini e Condizioni", presentation: "modal" }} />
    </Stack>
  );
}
