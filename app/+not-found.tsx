import { Link, Stack, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";

export default function NotFoundScreen() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  // Safety-net auto-redirect: se l'utente è autenticato naviga subito a /(tabs).
  // Questo spezza il loop "stuck on not-found" che si verifica quando la Stack
  // viene smontata durante il boot (MapReadyGate overlay) e Expo Router non
  // torna automaticamente alla route corretta quando la Stack rimonta.
  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) {
      router.replace("/(tabs)" as never);
      return;
    }
    // Utente non autenticato: reindirizza alla root dopo 2 secondi
    const timer = setTimeout(() => {
      router.replace("/" as never);
    }, 2000);
    return () => clearTimeout(timer);
  }, [isAuthenticated, isLoading, router]);

  return (
    <>
      <Stack.Screen options={{ title: "Oops!" }} />
      <View style={styles.container}>
        <Text style={styles.title}>This screen doesn&apos;t exist.</Text>

        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>Go to home screen!</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
  linkText: {
    fontSize: 14,
    color: "#2e78b7",
  },
});
