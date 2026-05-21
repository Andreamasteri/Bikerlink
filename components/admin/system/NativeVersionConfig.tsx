import React from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { UpdateOutcome } from "@/lib/semver";

interface NativeVersionConfigProps {
  android: { latestVersion: string; minVersion: string; storeUrl: string };
  ios: { latestVersion: string; minVersion: string; storeUrl: string };
  setNativeAndroidLatest: (v: string) => void;
  setNativeAndroidMin: (v: string) => void;
  setNativeAndroidUrl: (v: string) => void;
  setNativeIosLatest: (v: string) => void;
  setNativeIosMin: (v: string) => void;
  setNativeIosUrl: (v: string) => void;
  savingNative: boolean;
  saveNativeVersion: () => void;
  isRechecking: boolean;
  handleForceRecheck: () => void;
  checkOutcome: UpdateOutcome | null;
  outcomeMeta: (o: UpdateOutcome, t: (key: string) => string) => { label: string; color: string; icon: keyof typeof Ionicons.glyphMap };
  t: (key: string) => string;
}

export const NativeVersionConfig: React.FC<NativeVersionConfigProps> = ({
  android,
  ios,
  setNativeAndroidLatest,
  setNativeAndroidMin,
  setNativeAndroidUrl,
  setNativeIosLatest,
  setNativeIosMin,
  setNativeIosUrl,
  savingNative,
  saveNativeVersion,
  isRechecking,
  handleForceRecheck,
  checkOutcome,
  outcomeMeta,
  t,
}) => {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Ionicons name="apps-outline" size={18} color={Colors.accent} />
        <Text style={styles.cardTitle}>{t("admin.nativeVersionConfig")}</Text>
      </View>

      <Text style={styles.nativeLabel}>Android</Text>
      <View style={styles.nativeRow}>
        <View style={styles.nativeField}>
          <Text style={styles.nativeFieldLabel}>Ultima (Store)</Text>
          <TextInput
            style={styles.nativeInput}
            value={android.latestVersion}
            onChangeText={setNativeAndroidLatest}
            placeholder="e.g. 1.2.3"
            placeholderTextColor={Colors.textMuted ?? "#666"}
          />
        </View>
        <View style={styles.nativeField}>
          <Text style={styles.nativeFieldLabel}>Minima (Blocco)</Text>
          <TextInput
            style={styles.nativeInput}
            value={android.minVersion}
            onChangeText={setNativeAndroidMin}
            placeholder="e.g. 1.0.0"
            placeholderTextColor={Colors.textMuted ?? "#666"}
          />
        </View>
      </View>
      <View style={[styles.nativeField, { marginBottom: 12 }]}>
        <Text style={styles.nativeFieldLabel}>Play Store URL</Text>
        <TextInput
          style={styles.nativeInput}
          value={android.storeUrl}
          onChangeText={setNativeAndroidUrl}
          placeholder="https://play.google.com/..."
          placeholderTextColor={Colors.textMuted ?? "#666"}
        />
      </View>

      <Text style={styles.nativeLabel}>iOS</Text>
      <View style={styles.nativeRow}>
        <View style={styles.nativeField}>
          <Text style={styles.nativeFieldLabel}>Ultima (Store)</Text>
          <TextInput
            style={styles.nativeInput}
            value={ios.latestVersion}
            onChangeText={setNativeIosLatest}
            placeholder="e.g. 1.2.3"
            placeholderTextColor={Colors.textMuted ?? "#666"}
          />
        </View>
        <View style={styles.nativeField}>
          <Text style={styles.nativeFieldLabel}>Minima (Blocco)</Text>
          <TextInput
            style={styles.nativeInput}
            value={ios.minVersion}
            onChangeText={setNativeIosMin}
            placeholder="e.g. 1.0.0"
            placeholderTextColor={Colors.textMuted ?? "#666"}
          />
        </View>
      </View>
      <View style={[styles.nativeField, { marginBottom: 16 }]}>
        <Text style={styles.nativeFieldLabel}>App Store URL</Text>
        <TextInput
          style={styles.nativeInput}
          value={ios.storeUrl}
          onChangeText={setNativeIosUrl}
          placeholder="https://apps.apple.com/..."
          placeholderTextColor={Colors.textMuted ?? "#666"}
        />
      </View>

      <TouchableOpacity
        style={[styles.nativeSaveBtn, savingNative && styles.actionBtnDisabled]}
        onPress={saveNativeVersion}
        disabled={savingNative}
      >
        {savingNative ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.nativeSaveBtnText}>Salva Configurazione</Text>
        )}
      </TouchableOpacity>

      {checkOutcome && (
        <View style={[styles.outcomeRow, { backgroundColor: outcomeMeta(checkOutcome, t).color + "20" }]}>
          <Ionicons name={outcomeMeta(checkOutcome, t).icon} size={18} color={outcomeMeta(checkOutcome, t).color} />
          <Text style={[styles.outcomeText, { color: outcomeMeta(checkOutcome, t).color }]}>
            {outcomeMeta(checkOutcome, t).label}
          </Text>
          <TouchableOpacity
            onPress={handleForceRecheck}
            disabled={isRechecking}
            style={{ padding: 4 }}
          >
            {isRechecking ? (
              <ActivityIndicator size="small" color={outcomeMeta(checkOutcome, t).color} />
            ) : (
              <Ionicons name="refresh" size={16} color={outcomeMeta(checkOutcome, t).color} />
            )}
          </TouchableOpacity>
        </View>
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
  nativeLabel: {
    color: Colors.accent,
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
    marginTop: 4,
  },
  nativeRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 8,
  },
  nativeField: {
    flex: 1,
  },
  nativeFieldLabel: {
    color: Colors.textMuted ?? "#888",
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    marginBottom: 4,
  },
  nativeInput: {
    backgroundColor: Colors.background,
    color: Colors.text,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.border ?? "#333",
  },
  nativeSaveBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
  },
  nativeSaveBtnText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  actionBtnDisabled: {
    opacity: 0.4,
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
});
