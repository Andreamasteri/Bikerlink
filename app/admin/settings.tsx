import React, { useState, useEffect } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ScrollView, ActivityIndicator, Platform, Switch } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { apiRequest, queryClient } from "@/lib/query-client";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function AdminSettingsScreen() {
  const insets = useSafeAreaInsets();
  const { data, isLoading } = useQuery({ queryKey: ["/api/admin/settings"] });
  const settings = (data as any)?.settings || {};

  const [eulaText, setEulaText] = useState("");
  const [saving, setSaving] = useState(false);
  const synecoVisible = settings.syneco_branding_visible === "true";

  useEffect(() => {
    if (settings.eula_text) setEulaText(settings.eula_text);
  }, [settings.eula_text]);

  const saveSettings = async (updates: Record<string, string>) => {
    setSaving(true);
    try {
      await apiRequest("PUT", "/api/admin/settings", updates);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/syneco-branding"] });
      Alert.alert("Salvato", "Impostazioni aggiornate");
    } catch (err) {
      Alert.alert("Errore", "Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  };

  const toggleSynecoBranding = () => {
    saveSettings({ syneco_branding_visible: synecoVisible ? "false" : "true" });
  };

  if (isLoading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={Colors.accent} /></View>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 16 }]} keyboardShouldPersistTaps="handled">
      <Text style={styles.sectionTitle}>Branding Syneco</Text>
      <View style={styles.toggleRow}>
        <View style={styles.toggleInfo}>
          <Ionicons name="pricetag" size={20} color={Colors.syneco} />
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>Mostra scritta Syneco</Text>
            <Text style={styles.toggleDesc}>Mostra "by Syneco Lubrificanti" nella schermata di benvenuto</Text>
          </View>
        </View>
        <Switch
          value={synecoVisible}
          onValueChange={toggleSynecoBranding}
          trackColor={{ false: Colors.border, true: Colors.syneco + "80" }}
          thumbColor={synecoVisible ? Colors.syneco : Colors.textSecondary}
        />
      </View>

      <Text style={styles.sectionTitle}>EULA / Termini e Condizioni</Text>
      <TextInput style={[styles.input, styles.textArea]} value={eulaText} onChangeText={setEulaText} multiline numberOfLines={8} textAlignVertical="top" placeholderTextColor={Colors.textSecondary} />
      <Pressable style={styles.button} onPress={() => saveSettings({ eula_text: eulaText })} disabled={saving}>
        <Text style={styles.buttonText}>Salva EULA</Text>
      </Pressable>

      <Text style={styles.sectionTitle}>Integrazioni (Coming Soon)</Text>
      <View style={styles.integrationRow}>
        <Text style={styles.integrationLabel}>Foodtracker</Text>
        <Text style={styles.integrationStatus}>{settings.foodtracker_enabled === "true" ? "Attivo" : "Disattivo"}</Text>
      </View>
      <View style={styles.integrationRow}>
        <Text style={styles.integrationLabel}>PayPal</Text>
        <Text style={styles.integrationStatus}>{settings.paypal_enabled === "true" ? "Attivo" : "Disattivo"}</Text>
      </View>
      <View style={styles.integrationRow}>
        <Text style={styles.integrationLabel}>Google Drive Backup</Text>
        <Text style={styles.integrationStatus}>{settings.gdrive_backup_enabled === "true" ? "Attivo" : "Disattivo"}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 24, gap: 12 },
  loading: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background },
  sectionTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.accent, marginTop: 12 },
  input: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, padding: 14, fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.text },
  textArea: { minHeight: 160 },
  button: { backgroundColor: Colors.accent, paddingVertical: 14, borderRadius: 10, alignItems: "center" },
  buttonText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.background },
  toggleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: Colors.surface, borderRadius: 10, padding: 14 },
  toggleInfo: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  toggleLabel: { fontSize: 15, fontFamily: "Inter_500Medium", color: Colors.text },
  toggleDesc: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 2 },
  integrationRow: { flexDirection: "row", justifyContent: "space-between", backgroundColor: Colors.surface, borderRadius: 10, padding: 14, opacity: 0.6 },
  integrationLabel: { fontSize: 15, fontFamily: "Inter_500Medium", color: Colors.text },
  integrationStatus: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
});
