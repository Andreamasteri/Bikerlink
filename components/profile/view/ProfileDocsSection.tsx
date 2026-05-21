import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

interface ProfileDocsSectionProps {
  nickname?: string;
  t: (key: string) => string;
}

export const ProfileDocsSection: React.FC<ProfileDocsSectionProps> = ({
  nickname,
  t,
}) => {
  const [docsExpanded, setDocsExpanded] = useState(false);
  const [isDownloadingManual, setIsDownloadingManual] = useState(false);
  const [isDownloadingEula, setIsDownloadingEula] = useState(false);
  const [isDownloadingPrivacy, setIsDownloadingPrivacy] = useState(false);
  const [isExportingData, setIsExportingData] = useState(false);

  const handleDownloadManual = useCallback(async () => {
    if (isDownloadingManual) return;
    setIsDownloadingManual(true);
    try {
      const url = new URL("/api/manual/download", getApiUrl()).toString();
      const fileUri = (FileSystem.cacheDirectory || FileSystem.documentDirectory) + "BikerLink-Manual.pdf";
      const result = await FileSystem.downloadAsync(url, fileUri);
      if (result.status === 200) {
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) await Sharing.shareAsync(fileUri, { mimeType: "application/pdf" });
        else Alert.alert("Download", t("profile.downloadManual") + " ✓");
      } else {
        Alert.alert(t("common.error"), t("profile.downloadFailed"));
      }
    } catch { Alert.alert("Errore", "Impossibile scaricare il manuale. Controlla la connessione."); }
    finally { setIsDownloadingManual(false); }
  }, [isDownloadingManual, t]);

  const handleDownloadEula = useCallback(async () => {
    if (isDownloadingEula) return;
    setIsDownloadingEula(true);
    try {
      const url = new URL("/api/eula/download", getApiUrl()).toString();
      const fileUri = (FileSystem.cacheDirectory || FileSystem.documentDirectory) + "BikerLink-EULA.pdf";
      const result = await FileSystem.downloadAsync(url, fileUri);
      if (result.status === 200) {
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) await Sharing.shareAsync(fileUri, { mimeType: "application/pdf" });
        else Alert.alert("Download", t("profile.downloadEula") + " ✓");
      } else if (result.status === 404) {
        Alert.alert("Info", t("profile.eulaNotAvailable"));
      } else {
        Alert.alert(t("common.error"), t("profile.downloadFailed"));
      }
    } catch { Alert.alert("Errore", t("profile.eulaNotAvailable")); }
    finally { setIsDownloadingEula(false); }
  }, [isDownloadingEula, t]);

  const handleDownloadPrivacyPolicy = useCallback(async () => {
    if (isDownloadingPrivacy) return;
    setIsDownloadingPrivacy(true);
    try {
      const url = new URL("/api/privacy-policy/download", getApiUrl()).toString();
      const fileUri = (FileSystem.cacheDirectory || FileSystem.documentDirectory) + "BikerLink-PrivacyPolicy.pdf";
      const result = await FileSystem.downloadAsync(url, fileUri);
      if (result.status === 200) {
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) await Sharing.shareAsync(fileUri, { mimeType: "application/pdf" });
        else Alert.alert("Download", t("profile.downloadPrivacyPolicy") + " ✓");
      } else if (result.status === 404) {
        Alert.alert("Info", t("profile.privacyNotAvailable"));
      } else {
        Alert.alert(t("common.error"), t("profile.downloadFailed"));
      }
    } catch { Alert.alert("Errore", t("profile.privacyNotAvailable")); }
    finally { setIsDownloadingPrivacy(false); }
  }, [isDownloadingPrivacy, t]);

  const handleExportUserData = useCallback(async () => {
    if (isExportingData) return;
    setIsExportingData(true);
    try {
      const url = new URL("/api/user/export-data", getApiUrl()).toString();
      const response = await globalThis.fetch(url, { credentials: "include" });
      if (!response.ok) { Alert.alert("Errore", t("profile.exportDataError")); return; }
      const json = await response.text();
      const userNickname = nickname || "user";
      const date = new Date().toISOString().split("T")[0];
      const fileUri = (FileSystem.cacheDirectory || FileSystem.documentDirectory) + `BikerLink-UserData-${userNickname}-${date}.json`;
      await FileSystem.writeAsStringAsync(fileUri, json, { encoding: FileSystem.EncodingType.UTF8 });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) await Sharing.shareAsync(fileUri, { mimeType: "application/json" });
      else Alert.alert("Export", t("profile.exportUserData") + " ✓");
    } catch { Alert.alert("Errore", t("profile.exportDataError")); }
    finally { setIsExportingData(false); }
  }, [isExportingData, t, nickname]);

  const MenuItem = ({ icon, label, onPress, color }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; color?: string }) => (
    <Pressable style={styles.menuItem} onPress={onPress}>
      <Ionicons name={icon} size={22} color={color || Colors.text} />
      <Text style={[styles.menuLabel, color ? { color } : {}]}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
    </Pressable>
  );

  return (
    <View style={styles.section}>
      <Pressable style={styles.accordionHeader} onPress={() => setDocsExpanded(v => !v)}>
        <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>{t("profile.documentation")}</Text>
        <Ionicons name={docsExpanded ? "chevron-up" : "chevron-down"} size={18} color={Colors.textSecondary} />
      </Pressable>
      {docsExpanded && (
        <>
          <MenuItem icon="document-text" label={isDownloadingManual ? t("profile.downloading") : t("profile.downloadManual")} onPress={handleDownloadManual} color={Colors.accent} />
          <MenuItem icon="shield-checkmark-outline" label={isDownloadingEula ? t("profile.downloading") : t("profile.downloadEula")} onPress={handleDownloadEula} color={Colors.accent} />
          <MenuItem icon="document-text-outline" label={isDownloadingPrivacy ? t("profile.downloading") : t("profile.downloadPrivacyPolicy")} onPress={handleDownloadPrivacyPolicy} color={Colors.accent} />
          <MenuItem icon="cloud-download-outline" label={isExportingData ? t("profile.downloading") : t("profile.exportUserData")} onPress={handleExportUserData} color={Colors.accent} />
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: 16,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginBottom: 12,
  },
  accordionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  menuLabel: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
  },
});
