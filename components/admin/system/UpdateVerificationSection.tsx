import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { triggerSoftPreview, triggerForcedPreview } from "@/components/NativeUpdateChecker";
import { UpdateOutcome } from "@/lib/semver";

interface UpdateVerificationSectionProps {
  installedVersion: string;
  platformLabel: (p: string) => string;
  installedPlatform: "android" | "ios" | "web";
  nativeVerData?: {
    android: { latestVersion: string; minVersion: string; storeUrl: string };
    ios: { latestVersion: string; minVersion: string; storeUrl: string };
  };
  checkOutcome: UpdateOutcome | null;
  outcomeMeta: (o: UpdateOutcome, t: (key: string) => string) => { label: string; color: string; icon: keyof typeof Ionicons.glyphMap };
  isRechecking: boolean;
  isFetchingNativeVer: boolean;
  handleForceRecheck: () => void;
  t: (key: string) => string;
}

export const UpdateVerificationSection: React.FC<UpdateVerificationSectionProps> = ({
  installedVersion,
  platformLabel,
  installedPlatform,
  nativeVerData,
  checkOutcome,
  outcomeMeta,
  isRechecking,
  isFetchingNativeVer,
  handleForceRecheck,
  t,
}) => {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Ionicons name="shield-checkmark-outline" size={18} color={Colors.accent} />
        <Text style={styles.cardTitle}>Verifica aggiornamenti versione</Text>
        <TouchableOpacity onPress={handleForceRecheck} disabled={isRechecking || isFetchingNativeVer}>
          {(isRechecking || isFetchingNativeVer) ? (
            <ActivityIndicator size="small" color={Colors.accent} />
          ) : (
            <Ionicons name="refresh" size={18} color={Colors.accent} />
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.kvRow}>
        <Text style={styles.kvLabel}>Versione installata</Text>
        <Text style={styles.kvValue}>{installedVersion} · {platformLabel(installedPlatform)}</Text>
      </View>

      {nativeVerData && (
        <>
          <View style={styles.kvRow}>
            <Text style={styles.kvLabel}>Backend Android</Text>
            <Text style={styles.kvValue}>
              latest {nativeVerData.android.latestVersion} · min {nativeVerData.android.minVersion}
            </Text>
          </View>
          <View style={styles.kvRow}>
            <Text style={styles.kvLabel}>Store URL Android</Text>
            <Text style={styles.kvValue} numberOfLines={1}>{nativeVerData.android.storeUrl}</Text>
          </View>
          <View style={styles.kvRow}>
            <Text style={styles.kvLabel}>Backend iOS</Text>
            <Text style={styles.kvValue}>
              latest {nativeVerData.ios.latestVersion} · min {nativeVerData.ios.minVersion}
            </Text>
          </View>
          <View style={styles.kvRow}>
            <Text style={styles.kvLabel}>Store URL iOS</Text>
            <Text style={styles.kvValue} numberOfLines={1}>{nativeVerData.ios.storeUrl}</Text>
          </View>
        </>
      )}

      {installedPlatform === "web" ? (
        <View style={[styles.outcomeRow, { backgroundColor: "rgba(136,136,136,0.15)" }]}>
          <Ionicons name="information-circle" size={18} color={Colors.textMuted ?? "#888"} />
          <Text style={[styles.outcomeText, { color: Colors.textMuted ?? "#888" }]}>
            Il check di versione gira solo su Android/iOS.
          </Text>
        </View>
      ) : checkOutcome ? (
        (() => {
          const meta = outcomeMeta(checkOutcome, t);
          return (
            <View style={[styles.outcomeRow, { backgroundColor: `${meta.color}22` }]}>
              <Ionicons name={meta.icon} size={18} color={meta.color} />
              <Text style={[styles.outcomeText, { color: meta.color }]}>{meta.label}</Text>
            </View>
          );
        })()
      ) : (
        <View style={[styles.outcomeRow, { backgroundColor: "rgba(136,136,136,0.15)" }]}>
          <ActivityIndicator size="small" color={Colors.textMuted ?? "#888"} />
          <Text style={[styles.outcomeText, { color: Colors.textMuted ?? "#888" }]}>
            Caricamento configurazione…
          </Text>
        </View>
      )}

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actionBtn, installedPlatform === "web" && styles.actionBtnDisabled]}
          onPress={() => triggerSoftPreview()}
          disabled={installedPlatform === "web"}
        >
          <Ionicons name="arrow-up-circle-outline" size={16} color="#fff" />
          <Text style={styles.actionBtnText}>Simula popup soft</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: "#FF4444" }, installedPlatform === "web" && styles.actionBtnDisabled]}
          onPress={() => triggerForcedPreview()}
          disabled={installedPlatform === "web"}
        >
          <Ionicons name="alert-circle-outline" size={16} color="#fff" />
          <Text style={styles.actionBtnText}>Simula popup forzato</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        style={[styles.actionBtnWide, isRechecking && { opacity: 0.6 }]}
        onPress={handleForceRecheck}
        disabled={isRechecking}
      >
        {isRechecking ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <Ionicons name="refresh-circle-outline" size={16} color="#fff" />
            <Text style={styles.actionBtnText}>Forza re-check ora</Text>
          </>
        )}
      </TouchableOpacity>
      {installedPlatform === "web" && (
        <Text style={styles.hintText}>
          I pulsanti di simulazione sono disabilitati su web (il modale di update gira solo su mobile).
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  cardTitle: {
    color: Colors.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    flex: 1,
  },
  kvRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.border ?? "#333",
  },
  kvLabel: {
    color: Colors.textMuted ?? "#888",
    fontFamily: "Inter_400Regular",
    fontSize: 12,
  },
  kvValue: {
    color: Colors.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    flexShrink: 1,
    textAlign: "right",
    marginLeft: 8,
  },
  outcomeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 10,
    marginBottom: 12,
  },
  outcomeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    flex: 1,
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: Colors.accent,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  actionBtnWide: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#444",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  actionBtnDisabled: {
    opacity: 0.4,
  },
  actionBtnText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  hintText: {
    color: Colors.textMuted ?? "#888",
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    fontStyle: "italic",
    marginTop: 8,
    textAlign: "center",
  },
});
