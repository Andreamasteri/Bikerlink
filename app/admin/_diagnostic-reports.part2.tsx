import React from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { styles } from "@/components/admin/diagnostic-reports.styles";
import type { DiagFileEntry } from "./diagnostic-reports";

export function DiagFilesList({
  files,
  downloadingFile,
  downloadFile,
  deleteFileMutation
}: {
  files: DiagFileEntry[];
  downloadingFile: string | null;
  downloadFile: (filename: string) => void;
  deleteFileMutation: { isPending: boolean; variables: string | undefined; mutate: (filename: string) => void };
}) {
  return (
    <>
      {files.map((f) => {
        const sizeKb = (f.sizeBytes / 1024).toFixed(1);
        const ts = new Date(f.timestamp).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
        const shortUser = f.userId.slice(0, 8) + "…";
        const isDeleting = deleteFileMutation.isPending && deleteFileMutation.variables === f.filename;
        return (
          <View key={f.filename} style={styles.fileRow}>
            <View style={styles.fileInfo}>
              <Text style={styles.fileNameText} numberOfLines={1}>{f.filename}</Text>
              <Text style={styles.fileMeta}>👤 {shortUser} · 🕐 {ts} · 📦 {sizeKb} KB</Text>
            </View>
            <TouchableOpacity
              style={[styles.downloadBtn, downloadingFile === f.filename && styles.triggerBtnDisabled]}
              disabled={downloadingFile === f.filename}
              onPress={() => downloadFile(f.filename)}
            >
              {downloadingFile === f.filename
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="download-outline" size={16} color="#fff" />}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.deleteFileBtn, isDeleting && styles.triggerBtnDisabled]}
              disabled={isDeleting}
              onPress={() => {
                // Alert handled in parent usually, or we pass a callback
                deleteFileMutation.mutate(f.filename);
              }}
            >
              {isDeleting
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="trash-outline" size={16} color="#fff" />}
            </TouchableOpacity>
          </View>
        );
      })}
    </>
  );
}
