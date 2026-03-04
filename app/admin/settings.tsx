import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, Switch } from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import Colors from "@/constants/colors";
import { getApiUrl, queryClient, apiRequest } from "@/lib/query-client";
import { fetch } from "expo/fetch";

interface AppSetting {
  id: string;
  key: string;
  value: string | null;
  description: string | null;
}

const defaultSettings = [
  { key: "eula_text", label: "Testo EULA", placeholder: "Inserisci il testo EULA..." },
  { key: "splash_message", label: "Messaggio Splash", placeholder: "Messaggio da mostrare nello splash..." },
  { key: "maintenance_mode", label: "Modalita manutenzione", placeholder: "true / false" },
  { key: "min_app_version", label: "Versione minima app", placeholder: "1.0.0" },
  { key: "max_photos_zavorrina", label: "Max foto zavorrina", placeholder: "3" },
  { key: "max_daily_votes", label: "Max voti giornalieri", placeholder: "10" },
];

export default function AdminSettings() {
  const insets = useSafeAreaInsets();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const { data: settings = [], isLoading } = useQuery<AppSetting[]>({
    queryKey: ["/api/admin/settings"],
  });

  const { data: synecoData } = useQuery<{ visible: boolean }>({
    queryKey: ["/api/settings/syneco-branding"],
  });
  const synecoVisible = synecoData?.visible === true;

  const { data: emailVerifData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/email-verification"],
  });
  const emailVerifEnabled = emailVerifData?.enabled === true;

  const emailVerifMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/email_verification_enabled", baseUrl);
      const res = await fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: enabled ? "true" : "false" }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/email-verification"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
  });

  const synecoBrandingMutation = useMutation({
    mutationFn: async (visible: boolean) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/syneco_branding_visible", baseUrl);
      const res = await fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: visible ? "true" : "false" }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/syneco-branding"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
  });

  const [isUploadingEula, setIsUploadingEula] = useState(false);

  const updateMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const baseUrl = getApiUrl();
      const url = new URL(`/api/admin/settings/${key}`, baseUrl);
      const res = await fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      setEditingKey(null);
      setEditValue("");
    },
  });

  async function handleUploadEula() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "text/plain",
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];

      setIsUploadingEula(true);

      const formData = new FormData();
      formData.append("file", {
        uri: asset.uri,
        name: asset.name || "eula.txt",
        type: "text/plain",
      } as any);

      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/eula/upload", baseUrl);

      const res = await fetch(url.toString(), {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: "Errore durante l'upload" }));
        Alert.alert("Errore", errorData.message || "Errore durante l'upload");
        return;
      }

      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });

      if (editingKey === "eula_text" && data.value) {
        setEditValue(data.value);
      }

      Alert.alert("Successo", "EULA caricato con successo");
    } catch (error: any) {
      Alert.alert("Errore", error.message || "Errore durante l'upload del file");
    } finally {
      setIsUploadingEula(false);
    }
  }

  function getSettingValue(key: string): string {
    const setting = settings.find((s) => s.key === key);
    return setting?.value ?? "";
  }

  function startEditing(key: string) {
    setEditingKey(key);
    setEditValue(getSettingValue(key));
  }

  function handleSave() {
    if (!editingKey) return;
    updateMutation.mutate({ key: editingKey, value: editValue });
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}
    >
      <View style={styles.synecoCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="megaphone" size={20} color={Colors.syneco} />
            <Text style={styles.synecoLabel}>Branding Syneco</Text>
          </View>
          <Switch
            value={synecoVisible}
            onValueChange={(val) => synecoBrandingMutation.mutate(val)}
            trackColor={{ false: Colors.border, true: Colors.syneco }}
            thumbColor={synecoVisible ? Colors.text : Colors.textSecondary}
            disabled={synecoBrandingMutation.isPending}
          />
        </View>
        <Text style={styles.synecoDesc}>
          {synecoVisible ? "Il branding Syneco è visibile nell'app" : "Il branding Syneco è nascosto"}
        </Text>
      </View>

      <View style={styles.emailVerifCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="mail" size={20} color={Colors.accent} />
            <Text style={styles.synecoLabel}>Verifica Email</Text>
          </View>
          <Switch
            value={emailVerifEnabled}
            onValueChange={(val) => emailVerifMutation.mutate(val)}
            trackColor={{ false: Colors.border, true: Colors.accent }}
            thumbColor={emailVerifEnabled ? Colors.text : Colors.textSecondary}
            disabled={emailVerifMutation.isPending}
          />
        </View>
        <Text style={styles.synecoDesc}>
          {emailVerifEnabled ? "Attiva la verifica email per le nuove registrazioni" : "La verifica email è disattivata"}
        </Text>
      </View>

      {isLoading ? (
        <Text style={styles.loadingText}>Caricamento...</Text>
      ) : (
        defaultSettings.map((setting) => (
          <View key={setting.key} style={styles.settingCard}>
            <View style={styles.settingHeader}>
              <Text style={styles.settingLabel}>{setting.label}</Text>
              <View style={styles.settingActions}>
                {setting.key === "eula_text" && editingKey !== setting.key && (
                  <TouchableOpacity
                    style={styles.uploadBtn}
                    onPress={handleUploadEula}
                    disabled={isUploadingEula}
                  >
                    {isUploadingEula ? (
                      <ActivityIndicator size="small" color={Colors.accent} />
                    ) : (
                      <Ionicons name="cloud-upload" size={20} color={Colors.accent} />
                    )}
                  </TouchableOpacity>
                )}
                {editingKey !== setting.key && (
                  <TouchableOpacity onPress={() => startEditing(setting.key)}>
                    <Ionicons name="create" size={20} color={Colors.accent} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
            {editingKey === setting.key ? (
              <View>
                <TextInput
                  style={styles.input}
                  placeholder={setting.placeholder}
                  placeholderTextColor={Colors.textSecondary}
                  value={editValue}
                  onChangeText={setEditValue}
                  multiline={setting.key === "eula_text"}
                  numberOfLines={setting.key === "eula_text" ? 6 : 1}
                />
                <View style={styles.editActions}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditingKey(null)}>
                    <Text style={styles.cancelBtnText}>Annulla</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.saveBtn}
                    onPress={handleSave}
                    disabled={updateMutation.isPending}
                  >
                    <Text style={styles.saveBtnText}>{updateMutation.isPending ? "..." : "Salva"}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <Text style={styles.settingValue}>
                {getSettingValue(setting.key) || setting.placeholder}
              </Text>
            )}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16 },
  synecoCard: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: Colors.syneco,
  },
  synecoHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  synecoInfo: { flexDirection: "row", alignItems: "center", gap: 10 },
  synecoLabel: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.text },
  synecoDesc: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, marginTop: 8 },
  loadingText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center", marginTop: 40 },
  emailVerifCard: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: Colors.accent,
  },
  settingCard: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  settingHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  settingActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  uploadBtn: { padding: 4 },
  settingLabel: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: Colors.text },
  settingValue: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary },
  input: {
    backgroundColor: Colors.background, borderRadius: 10, padding: 12,
    fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text,
    borderWidth: 1, borderColor: Colors.border, textAlignVertical: "top" as const,
  },
  editActions: { flexDirection: "row", gap: 12, marginTop: 12, justifyContent: "flex-end" },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: Colors.surfaceLight },
  cancelBtnText: { fontFamily: "Inter_500Medium", fontSize: 14, color: Colors.textSecondary },
  saveBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: Colors.accent },
  saveBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.background },
});
