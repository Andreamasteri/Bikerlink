import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";
import { apiRequest } from "@/lib/query-client";

export function LastfmLoginModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const _t = useT();
  const [username, setUsername] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    if (!username.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiRequest("POST", "/api/lastfm/connect", { username: username.trim() });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Errore di connessione");
      }
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Collega Last.fm</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.description}>
            Inserisci il tuo nome utente Last.fm per sincronizzare la tua libreria musicale e trovare match con altri biker.
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Nome utente Last.fm"
            placeholderTextColor={Colors.textSecondary}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
          />

          {error && <Text style={styles.errorText}>{error}</Text>}

          <TouchableOpacity
            style={[styles.button, !username.trim() && styles.buttonDisabled]}
            onPress={handleConnect}
            disabled={isLoading || !username.trim()}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Connetti</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.helpLink}
            onPress={() => Linking.openURL("https://www.last.fm/join")}
          >
            <Text style={styles.helpLinkText}>Non hai un account? Registrati su Last.fm</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    width: "100%",
    maxWidth: 400,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: Colors.text,
  },
  description: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: 20,
  },
  input: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: 12,
    color: Colors.text,
    fontFamily: "Inter_400Regular",
    marginBottom: 12,
  },
  errorText: {
    color: Colors.accent,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    marginBottom: 12,
  },
  button: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
  },
  helpLink: {
    marginTop: 16,
    alignItems: "center",
  },
  helpLinkText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.accent,
  },
});
