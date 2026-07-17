import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const s = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  info: {
    flex: 1,
    marginLeft: 12,
  },
  title: {
    color: Colors.text,
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
    fontFamily: "Inter_400Regular",
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  downloadBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  editBtn: {
    backgroundColor: Colors.warning,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  saveBtn: {
    backgroundColor: Colors.success ?? Colors.accent,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  cancelBtn: {
    backgroundColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  btnText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  cancelBtnText: {
    color: Colors.text,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  input: {
    backgroundColor: Colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.text,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 12,
  },
  urlText: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 6,
    fontFamily: "Inter_400Regular",
  },
});

export function TcTerminalApkSection() {
  const [editing, setEditing] = useState(false);
  const [inputUrl, setInputUrl] = useState("");
  const queryClient = useQueryClient();

  const { data } = useQuery<{ url: string }>({
    queryKey: ["/api/admin/settings/tc-terminal-apk-url"],
  });

  const saveMutation = useMutation({
    mutationFn: async (url: string) => {
      const res = await fetch(
        new URL("/api/admin/settings/tc-terminal-apk-url", getApiUrl()).toString(),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ url }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message || "Errore salvataggio");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/tc-terminal-apk-url"] });
      setEditing(false);
      Alert.alert("Salvato", "URL TC Terminal APK aggiornato.");
    },
    onError: (e: Error) => {
      Alert.alert("Errore", e.message);
    },
  });

  const hasUrl = !!(data?.url);

  const handleEdit = () => {
    setInputUrl(data?.url || "");
    setEditing(true);
  };

  const handleSave = () => {
    const trimmed = inputUrl.trim();
    if (trimmed && !trimmed.startsWith("http")) {
      Alert.alert("Errore", "Inserisci un URL valido (https://...)");
      return;
    }
    saveMutation.mutate(trimmed);
  };

  const handleDownload = () => {
    if (!data?.url) return;
    Linking.openURL(data.url);
  };

  return (
    <View style={s.card}>
      <View style={s.row}>
        <Ionicons name="terminal-outline" size={32} color={Colors.accent} />
        <View style={s.info}>
          <Text style={s.title}>TC Terminal APK</Text>
          <Text style={s.subtitle}>
            {hasUrl ? "Link disponibile" : "Nessun link configurato"}
          </Text>
          {hasUrl && !editing && (
            <Text style={s.urlText} numberOfLines={1}>
              {data?.url}
            </Text>
          )}
        </View>
      </View>

      {editing && (
        <TextInput
          style={s.input}
          value={inputUrl}
          onChangeText={setInputUrl}
          placeholder="https://expo.dev/artifacts/..."
          placeholderTextColor={Colors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
      )}

      <View style={s.actions}>
        {!editing && hasUrl && (
          <TouchableOpacity style={s.downloadBtn} onPress={handleDownload}>
            <Ionicons name="download-outline" size={18} color="#fff" />
            <Text style={s.btnText}>Scarica TC Terminal APK</Text>
          </TouchableOpacity>
        )}
        {!editing && (
          <TouchableOpacity style={s.editBtn} onPress={handleEdit}>
            <Ionicons name="link-outline" size={18} color="#fff" />
            <Text style={s.btnText}>{hasUrl ? "Modifica URL" : "Imposta URL"}</Text>
          </TouchableOpacity>
        )}
        {editing && (
          <>
            <TouchableOpacity
              style={[s.saveBtn, saveMutation.isPending && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saveMutation.isPending}
            >
              <Ionicons name="checkmark-outline" size={18} color="#fff" />
              <Text style={s.btnText}>Salva</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.cancelBtn}
              onPress={() => setEditing(false)}
              disabled={saveMutation.isPending}
            >
              <Ionicons name="close-outline" size={18} color={Colors.text} />
              <Text style={s.cancelBtnText}>Annulla</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}
