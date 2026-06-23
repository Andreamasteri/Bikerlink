import React, { useState, useEffect, useRef } from "react";
import { reloadAppAsync } from "expo";
import {
  StyleSheet,
  View,
  Pressable,
  ScrollView,
  Text,
  Modal,
  ActivityIndicator,
  useColorScheme,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

export type ErrorFallbackProps = {
  error: Error;
  resetError: () => void;
  autoRetry?: () => void;
  autoRetryCount?: number;
};

const MAX_AUTO_RETRIES = 3;
const AUTO_RETRY_SECONDS = 5;

function isNetworkError(error: Error): boolean {
  const msg = ((error as Error).message ?? "").toLowerCase();
  const name = (error.name ?? "").toLowerCase();
  return (
    name === "networkerror" ||
    msg.includes("network request failed") ||
    msg.includes("failed to fetch") ||
    msg.includes("network error") ||
    msg.includes("networkerror") ||
    msg.includes("backend unavailable") ||
    msg.includes("econnrefused") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("fetch")
  );
}

export function ErrorFallback({
  error,
  resetError,
  autoRetry,
  autoRetryCount = 0,
}: ErrorFallbackProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const insets = useSafeAreaInsets();

  const theme = {
    background: isDark ? "#000000" : "#FFFFFF",
    backgroundSecondary: isDark ? "#1C1C1E" : "#F2F2F7",
    text: isDark ? "#FFFFFF" : "#000000",
    textSecondary: isDark ? "rgba(255, 255, 255, 0.7)" : "rgba(0, 0, 0, 0.7)",
    link: "#007AFF",
    buttonText: "#FFFFFF",
  };

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [countdown, setCountdown] = useState(AUTO_RETRY_SECONDS);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const networkError = isNetworkError(error);
  const canAutoRetry = networkError && autoRetryCount < MAX_AUTO_RETRIES && !!autoRetry;

  useEffect(() => {
    if (!canAutoRetry) return;

    setCountdown(AUTO_RETRY_SECONDS);

    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          autoRetry!();
          return AUTO_RETRY_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAutoRetry, autoRetryCount]);

  const handleRetryNow = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    autoRetry!();
  };

  const handleRestart = async () => {
    try {
      await reloadAppAsync();
    } catch (restartError) {
      console.error("Failed to restart app:", restartError);
      resetError();
    }
  };

  const formatErrorDetails = (): string => {
    let details = `Errore: ${(error as Error).message}\n\n`;
    if (error.stack) {
      details += `Stack Trace:\n${error.stack}`;
    }
    return details;
  };

  const monoFont = Platform.select({
    ios: "Menlo",
    android: "monospace",
    default: "monospace",
  });

  const devButton = __DEV__ ? (
    <Pressable
      onPress={() => setIsModalVisible(true)}
      accessibilityLabel="Vedi dettagli errore"
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.topButton,
        {
          top: insets.top + 16,
          backgroundColor: theme.backgroundSecondary,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <Feather name="alert-circle" size={20} color={theme.text} />
    </Pressable>
  ) : null;

  const devModal = __DEV__ ? (
    <Modal
      visible={isModalVisible}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setIsModalVisible(false)}
    >
      <View style={styles.modalOverlay}>
        <View
          style={[styles.modalContainer, { backgroundColor: theme.background }]}
        >
          <View
            style={[
              styles.modalHeader,
              {
                borderBottomColor: isDark
                  ? "rgba(255, 255, 255, 0.1)"
                  : "rgba(0, 0, 0, 0.1)",
              },
            ]}
          >
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              Dettagli errore
            </Text>
            <Pressable
              onPress={() => setIsModalVisible(false)}
              accessibilityLabel="Chiudi dettagli errore"
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.closeButton,
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Feather name="x" size={24} color={theme.text} />
            </Pressable>
          </View>
          <ScrollView
            style={styles.modalScrollView}
            contentContainerStyle={[
              styles.modalScrollContent,
              { paddingBottom: insets.bottom + 16 },
            ]}
            showsVerticalScrollIndicator
          >
            <View
              style={[
                styles.errorContainer,
                { backgroundColor: theme.backgroundSecondary },
              ]}
            >
              <Text
                style={[
                  styles.errorText,
                  { color: theme.text, fontFamily: monoFont },
                ]}
                selectable
              >
                {formatErrorDetails()}
              </Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  ) : null;

  const prodErrorBox = !__DEV__ && !networkError ? (
    <ScrollView
      style={[styles.prodErrorScroll, { backgroundColor: theme.backgroundSecondary }]}
      contentContainerStyle={styles.prodErrorContent}
      showsVerticalScrollIndicator
    >
      <Text style={[styles.errorText, { color: theme.text, fontFamily: monoFont }]} selectable>
        {`${error.name}: ${error.message}\n\n${(error.stack ?? "").split("\n").slice(0, 12).join("\n")}`}
      </Text>
    </ScrollView>
  ) : null;

  if (canAutoRetry) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        {devButton}
        <View style={styles.content}>
          <ActivityIndicator size="large" color={theme.link} />
          <Text style={[styles.title, { color: theme.text }]}>
            Connessione persa
          </Text>
          <Text style={[styles.message, { color: theme.textSecondary }]}>
            {`Riprovo automaticamente in ${countdown}s...`}
          </Text>
          <Text style={[styles.retryInfo, { color: theme.textSecondary }]}>
            {`Tentativo ${autoRetryCount + 1} di ${MAX_AUTO_RETRIES}`}
          </Text>
          <Pressable
            onPress={handleRetryNow}
            style={({ pressed }) => [
              styles.button,
              {
                backgroundColor: theme.link,
                opacity: pressed ? 0.9 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              },
            ]}
          >
            <Text style={[styles.buttonText, { color: theme.buttonText }]}>
              Riprova ora
            </Text>
          </Pressable>
        </View>
        {devModal}
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {devButton}
      <View style={styles.content}>
        <Text style={[styles.title, { color: theme.text }]}>
          {networkError ? "Connessione persa" : "Qualcosa è andato storto"}
        </Text>
        <Text style={[styles.message, { color: theme.textSecondary }]}>
          {networkError
            ? "Controlla la connessione e riprova."
            : "Ricarica l'app per continuare."}
        </Text>
        {prodErrorBox}
        <Pressable
          onPress={handleRestart}
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: theme.link,
              opacity: pressed ? 0.9 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            },
          ]}
        >
          <Text style={[styles.buttonText, { color: theme.buttonText }]}>
            Riprova
          </Text>
        </Pressable>
      </View>
      {devModal}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  content: {
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    width: "100%",
    maxWidth: 600,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 40,
  },
  message: {
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
  },
  retryInfo: {
    fontSize: 13,
    textAlign: "center",
  },
  topButton: {
    position: "absolute",
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  button: {
    paddingVertical: 16,
    borderRadius: 8,
    paddingHorizontal: 24,
    minWidth: 200,
    elevation: 3,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {},
      web: { boxShadow: "0px 2px 4px rgba(0,0,0,0.1)" },
    }),
  },
  buttonText: {
    fontWeight: "600",
    textAlign: "center",
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContainer: {
    width: "100%",
    height: "90%",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "600",
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  modalScrollView: {
    flex: 1,
  },
  modalScrollContent: {
    padding: 16,
  },
  errorContainer: {
    width: "100%",
    borderRadius: 8,
    overflow: "hidden",
    padding: 16,
  },
  errorText: {
    fontSize: 12,
    lineHeight: 18,
    width: "100%",
  },
  prodErrorScroll: {
    width: "100%",
    maxHeight: 220,
    borderRadius: 8,
  },
  prodErrorContent: {
    padding: 12,
  },
});
