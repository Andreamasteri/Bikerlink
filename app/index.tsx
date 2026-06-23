import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, Pressable, StyleSheet } from "react-native";
import { Redirect, type Href } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ONBOARDING_STORAGE_KEY } from "@/constants/onboarding";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";

export default function Index() {
  const [checked, setChecked] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(false);
  const { isLoading: authIsLoading, isAuthenticated, authFailed, retryAuth, hadPreviousSession } = useAuth();

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_STORAGE_KEY)
      .then((val) => {
        setOnboardingDone(val === "true");
        setChecked(true);
      })
      .catch(() => {
        setOnboardingDone(true);
        setChecked(true);
      });
  }, []);

  // Se non abbiamo ancora letto AsyncStorage locale, spinner brevissimo (ms)
  if (!checked) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  // Redirect ottimistico: se il device aveva già una sessione attiva, vai
  // subito alle tabs senza aspettare la verifica server (che può richiedere
  // 13-50s con DB lento). L'auth si risolve in background; se la sessione è
  // scaduta, il server risponde 401 → sessionExpired → redirect a /welcome.
  if (authIsLoading && hadPreviousSession) {
    return <Redirect href={"/(tabs)" as Href} />;
  }

  // Spinner solo per utenti nuovi (nessuna sessione salvata) — dura pochi secondi
  if (authIsLoading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  // Bootstrap auth fallito per rete/server (es. prod saturo, /api/auth/me in
  // timeout): invece di restare sullo spinner mostriamo uno stato leggibile con
  // "Riprova" che ri-tenta la query. Solo quando NON c'è un utente in cache.
  if (authFailed && !isAuthenticated) {
    return (
      <View style={styles.loader}>
        <Text style={styles.errorTitle}>Impossibile contattare il server</Text>
        <Text style={styles.errorSubtitle}>
          Controlla la connessione e riprova.
        </Text>
        <Pressable
          style={styles.retryButton}
          onPress={retryAuth}
          accessibilityRole="button"
          accessibilityLabel="Riprova a connetterti"
          testID="auth-retry-button"
        >
          <Text style={styles.retryButtonText}>Riprova</Text>
        </Pressable>
      </View>
    );
  }

  if (isAuthenticated) {
    return <Redirect href={"/(tabs)" as Href} />;
  }

  if (onboardingDone) {
    return <Redirect href="/welcome" />;
  }

  return <Redirect href="/onboarding" />;
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  errorTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: Colors.text,
    textAlign: "center",
    marginBottom: 8,
  },
  errorSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 24,
  },
  retryButtonText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: "#FFFFFF",
  },
});
