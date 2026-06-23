import { Redirect, type Href } from "expo-router";
import { View } from "react-native";
import { useAuth } from "@/lib/auth-context";

export default function NotFoundScreen() {
  const { isAuthenticated, isLoading } = useAuth();

  // Safety-net per il loop "This screen doesn't exist": quando il boot atterra
  // momentaneamente sulla route not-found, reindirizziamo in modo DICHIARATIVO.
  //
  // Niente router.replace imperativo dentro useEffect e niente
  // <Stack.Screen options={...}>: quella combinazione rigenerava l'oggetto
  // options a ogni render e rilanciava navigation.setOptions in loop, causando
  // "Maximum update depth exceeded" -> ErrorBoundary. <Redirect> naviga durante
  // il render senza setState ciclico.
  if (isLoading) {
    // Auth ancora in caricamento: non mostrare la schermata rotta, attendi.
    return <View style={{ flex: 1 }} />;
  }

  return <Redirect href={(isAuthenticated ? "/(tabs)" : "/") as Href} />;
}
