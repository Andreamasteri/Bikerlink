import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Switch,
  ActivityIndicator,
  Modal,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";
import { useToggleSettings } from "@/components/admin/settings/useToggleSettings";

export function AdsControlPanel() {
  const t = useT();

  const [protectedToggle, setProtectedToggle] = useState<string | null>(null);
  const [protectedPassword, setProtectedPassword] = useState("");
  const [pendingSynecoValue, setPendingSynecoValue] = useState<boolean | null>(null);

  const { protectedToggleMutation } = useToggleSettings(
    t,
    setProtectedToggle,
    setProtectedPassword
  );

  const { data: adsData, isLoading: adsLoading } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/ads-enabled"],
  });

  const { data: synecoData, isLoading: synecoLoading } = useQuery<{ visible: boolean }>({
    queryKey: ["/api/settings/syneco-branding"],
  });

  const adsEnabled = adsData?.enabled ?? true;
  const synecoVisible = synecoData?.visible ?? false;

  const handleAdsToggle = (val: boolean) => {
    // Uses toggle-protected (writes "ads_enabled") instead of disable-feature
    // (which writes "disable_ads_enabled") to keep write path consistent with
    // the read path GET /api/settings/ads-enabled → reads "ads_enabled".
    protectedToggleMutation.mutate({
      key: "ads_enabled",
      value: val ? "true" : "false",
    });
  };

  const handleSynecoToggle = (val: boolean) => {
    setPendingSynecoValue(val);
    setProtectedToggle("syneco_branding_visible");
    setProtectedPassword("");
  };

  const handlePasswordConfirm = () => {
    if (pendingSynecoValue === null) return;
    protectedToggleMutation.mutate({
      key: "syneco_branding_visible",
      value: pendingSynecoValue ? "true" : "false",
      adminPassword: protectedPassword,
    });
  };

  const handlePasswordCancel = () => {
    setProtectedToggle(null);
    setProtectedPassword("");
    setPendingSynecoValue(null);
  };

  const showModal = protectedToggle === "syneco_branding_visible";

  return (
    <View style={styles.container}>
      <View style={styles.sectionHeaderRow}>
        <Ionicons name="settings-outline" size={20} color={Colors.accent} />
        <Text style={styles.sectionTitle}>Controlli</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.labelGroup}>
            <Ionicons name="megaphone-outline" size={20} color="#FF9800" />
            <Text style={styles.label}>Sistema Campagne</Text>
          </View>
          {adsLoading || protectedToggleMutation.isPending ? (
            <ActivityIndicator size="small" color={Colors.textSecondary} />
          ) : (
            <Switch
              value={adsEnabled}
              onValueChange={handleAdsToggle}
              trackColor={{ false: Colors.border, true: "#FF9800" }}
              thumbColor={adsEnabled ? Colors.text : Colors.textSecondary}
            />
          )}
        </View>
        <Text style={styles.desc}>
          {adsEnabled
            ? "Le campagne pubblicitarie sono attive e visibili nell'app."
            : "Sistema ads disabilitato: nessuna pubblicità viene mostrata."}
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.labelGroup}>
            <Ionicons name="shield-checkmark-outline" size={20} color={Colors.accent} />
            <Text style={styles.label}>Branding Syneco</Text>
          </View>
          {synecoLoading || protectedToggleMutation.isPending ? (
            <ActivityIndicator size="small" color={Colors.textSecondary} />
          ) : (
            <Switch
              value={synecoVisible}
              onValueChange={handleSynecoToggle}
              trackColor={{ false: Colors.border, true: Colors.accent }}
              thumbColor={synecoVisible ? Colors.text : Colors.textSecondary}
            />
          )}
        </View>
        <Text style={styles.desc}>
          {synecoVisible
            ? "Il branding Syneco è visibile nell'app (richiede password admin)."
            : "Il branding Syneco è nascosto. Richiede password admin per attivarlo."}
        </Text>
      </View>

      <Modal
        visible={showModal}
        transparent
        animationType="fade"
        onRequestClose={handlePasswordCancel}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Ionicons name="lock-closed-outline" size={22} color={Colors.accent} />
              <Text style={styles.modalTitle}>Conferma password admin</Text>
            </View>
            <Text style={styles.modalDesc}>
              Inserisci la password admin per modificare il branding Syneco.
            </Text>
            <TextInput
              style={styles.passwordInput}
              placeholder="Password admin"
              placeholderTextColor={Colors.textSecondary}
              secureTextEntry
              value={protectedPassword}
              onChangeText={setProtectedPassword}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={handlePasswordCancel}>
                <Text style={styles.cancelBtnText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, !protectedPassword && styles.confirmBtnDisabled]}
                onPress={handlePasswordConfirm}
                disabled={!protectedPassword || protectedToggleMutation.isPending}
              >
                {protectedToggleMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.confirmBtnText}>Conferma</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  labelGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  label: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: Colors.text,
  },
  desc: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 360,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  modalTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
    color: Colors.text,
  },
  modalDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  passwordInput: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: Colors.text,
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
  },
  cancelBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.textSecondary,
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Colors.accent,
    alignItems: "center",
  },
  confirmBtnDisabled: {
    opacity: 0.5,
  },
  confirmBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: "#fff",
  },
});
