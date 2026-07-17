import React from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export interface RepoDriftHealth {
  checked: boolean;
  driftDetected: boolean;
  behind: number | null;
  driftedFiles: string[];
  checkedAt: string | null;
  error?: string;
}

export function RepoDriftBanner({
  drift,
  onSync,
  syncing,
}: {
  drift: RepoDriftHealth;
  onSync?: () => void;
  syncing?: boolean;
}) {
  const fileList = drift.driftedFiles
    .map((f) => f.replace("scripts/ollama-modelfile/", "").replace("scripts/", ""))
    .join(", ");
  const behindStr = drift.behind != null && drift.behind > 0 ? ` · ${drift.behind} commit indietro` : "";

  return (
    <View style={repoDriftStyles.banner}>
      <Ionicons name="git-branch-outline" size={15} color="#f59e0b" style={{ marginTop: 1 }} />
      <View style={repoDriftStyles.body}>
        <Text style={repoDriftStyles.title}>⚠ App checkout in deriva rispetto a origin/main</Text>
        <Text style={repoDriftStyles.sub}>
          {"File build Ollama diversi: "}
          <Text style={repoDriftStyles.mono}>{fileList || "—"}</Text>
          {behindStr}
          {"\nNON buildare modelli finché non si riallineano i Modelfile."}
        </Text>
        {onSync && (
          <TouchableOpacity
            style={[repoDriftStyles.syncBtn, syncing && repoDriftStyles.syncBtnDisabled]}
            onPress={onSync}
            disabled={syncing}
            activeOpacity={0.7}
          >
            {syncing ? (
              <ActivityIndicator size="small" color="#92400e" />
            ) : (
              <Ionicons name="sync-outline" size={13} color="#92400e" />
            )}
            <Text style={repoDriftStyles.syncBtnLabel}>
              {syncing ? "Sincronizzazione…" : "Sincronizza"}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const repoDriftStyles = {
  banner: {
    flexDirection: "row" as const,
    gap: 8,
    backgroundColor: "#f59e0b18",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#f59e0b55",
    padding: 10,
    marginHorizontal: 10,
    marginBottom: 6,
    alignItems: "flex-start" as const,
  },
  body: { flex: 1, gap: 3 },
  title: { fontSize: 12, fontWeight: "700" as const, color: "#f59e0b" },
  sub:   { fontSize: 11, color: "#b45309", lineHeight: 16 },
  mono:  { fontFamily: "monospace" as const, fontWeight: "600" as const },
  syncBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    alignSelf: "flex-start" as const,
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "#fef3c7",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#fbbf24",
  },
  syncBtnDisabled: { opacity: 0.6 },
  syncBtnLabel: { fontSize: 12, fontWeight: "600" as const, color: "#92400e" },
};
