import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { useT } from "@/lib/language-context";
import { useQuery } from "@tanstack/react-query";

const manualStyles = StyleSheet.create({
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
  title: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
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
  uploadBtn: {
    backgroundColor: Colors.warning,
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
    fontWeight: "600",
  },
});

interface PdfDocumentAdminSectionProps {
  title: string;
  fileName: string;
  infoEndpoint: string;
  downloadEndpoint: string;
  uploadEndpoint: string;
}

export function PdfDocumentAdminSection({
  title,
  fileName,
  infoEndpoint,
  downloadEndpoint,
  uploadEndpoint,
}: PdfDocumentAdminSectionProps) {
  const t = useT();
  const [uploading, setUploading] = useState(false);

  const { data: fileInfo, refetch } = useQuery<{
    available: boolean;
    fileName?: string;
    fileSize?: number;
    lastModified?: string;
  }>({
    queryKey: [infoEndpoint],
  });

  const handleDownload = () => {
    const url = new URL(downloadEndpoint, getApiUrl()).toString();
    const { Linking } = require("react-native");
    Linking.openURL(url);
  };

  const handleUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: "application/pdf" });
      if (result.canceled || !result.assets?.[0]) return;
      setUploading(true);
      const file = result.assets[0];
      const formData = new FormData();
      formData.append("file", {
        uri: file.uri,
        name: file.name || "document.pdf",
        type: "application/pdf",
      } as any);

      const res = await fetch(new URL(uploadEndpoint, getApiUrl()).toString(), {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert("Successo", data.message || "Documento aggiornato");
        refetch();
      } else {
        Alert.alert("Errore", data.message || "Errore upload");
      }
    } catch (e: any) {
      Alert.alert("Errore", e.message || "Errore upload");
    } finally {
      setUploading(false);
    }
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  return (
    <View style={manualStyles.card}>
      <View style={manualStyles.row}>
        <Ionicons name="document-text-outline" size={32} color={Colors.accent} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={manualStyles.title}>{fileName}</Text>
          <Text style={manualStyles.subtitle}>
            {fileInfo?.available
              ? `${formatSize(fileInfo.fileSize)} — ${fileInfo.lastModified ? new Date(fileInfo.lastModified).toLocaleDateString("it-IT") : ""}`
              : `Nessun ${title} caricato`}
          </Text>
        </View>
      </View>
      <View style={manualStyles.actions}>
        {fileInfo?.available && (
          <TouchableOpacity style={manualStyles.downloadBtn} onPress={handleDownload}>
            <Ionicons name="download-outline" size={18} color="#fff" />
            <Text style={manualStyles.btnText}>Scarica</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[manualStyles.uploadBtn, uploading && { opacity: 0.6 }]}
          onPress={handleUpload}
          disabled={uploading}
        >
          {uploading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
              <Text style={manualStyles.btnText}>Carica nuovo PDF</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}
