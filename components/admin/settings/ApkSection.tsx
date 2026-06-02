import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { appendFileToForm } from "@/lib/image-picker-utils";
import { useQuery } from "@tanstack/react-query";

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
  urlText: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 6,
    fontFamily: "Inter_400Regular",
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  uploadBtn: {
    backgroundColor: Colors.warning,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
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
  btnText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
});

function formatSize(bytes?: number | null): string {
  if (!bytes) return "—";
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function formatDate(iso?: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ApkSection() {
  const [uploading, setUploading] = useState(false);

  const { data: apkInfo, refetch } = useQuery<{
    url: string;
    size: number | null;
    uploadedAt: string | null;
  }>({
    queryKey: ["/api/admin/settings/apk-info"],
  });

  const hasApk = !!(apkInfo?.url);

  const handleUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/vnd.android.package-archive", "application/octet-stream", "*/*"],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const file = result.assets[0];
      const name = file.name || "bikerlink.apk";
      if (!name.toLowerCase().endsWith(".apk")) {
        Alert.alert("Errore", "Seleziona un file con estensione .apk");
        return;
      }
      setUploading(true);
      const formData = new FormData();
      await appendFileToForm(
        formData,
        "file",
        file.uri,
        file.mimeType || "application/vnd.android.package-archive",
        name
      );
      const res = await fetch(
        new URL("/api/admin/settings/apk-upload", getApiUrl()).toString(),
        { method: "POST", body: formData, credentials: "include" }
      );
      const data = await res.json();
      if (res.ok) {
        Alert.alert("Successo", `APK caricato correttamente (${formatSize(data.size)})`);
        refetch();
      } else {
        Alert.alert("Errore", data.message || "Errore durante il caricamento");
      }
    } catch (e: unknown) {
      Alert.alert("Errore", (e as Error).message || "Errore sconosciuto");
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = () => {
    if (!apkInfo?.url) return;
    const { Linking } = require("react-native");
    Linking.openURL(apkInfo.url);
  };

  const subtitle = hasApk
    ? `${formatSize(apkInfo?.size)} — ${formatDate(apkInfo?.uploadedAt)}`
    : "Nessun APK caricato";

  return (
    <View style={s.card}>
      <View style={s.row}>
        <Ionicons name="logo-android" size={32} color={Colors.accent} />
        <View style={s.info}>
          <Text style={s.title}>bikerlink-latest.apk</Text>
          <Text style={s.subtitle}>{subtitle}</Text>
          {hasApk && (
            <Text style={s.urlText} numberOfLines={1}>
              {apkInfo?.url}
            </Text>
          )}
        </View>
      </View>
      <View style={s.actions}>
        {hasApk && (
          <TouchableOpacity style={s.downloadBtn} onPress={handleDownload}>
            <Ionicons name="download-outline" size={18} color="#fff" />
            <Text style={s.btnText}>Scarica</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[s.uploadBtn, uploading && { opacity: 0.6 }]}
          onPress={handleUpload}
          disabled={uploading}
        >
          {uploading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
              <Text style={s.btnText}>Carica APK</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}
