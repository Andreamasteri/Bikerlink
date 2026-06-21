import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

const PAGE_SIZE = 100;

export type LapSample = {
  ts: number;
  speedKmh: number | null;
  leanAngle: number | null;
  gforce: number | null;
  lat: number | null;
  lon: number | null;
};

export { PAGE_SIZE };

// ── SpeedSparkline ──────────────────────────────────────────────────────────

export function SpeedSparkline({ samples }: { samples: LapSample[] }) {
  const colors = useColors();
  const s = sparkStyles(colors);
  const speeds = samples.map((s) => s.speedKmh ?? 0).filter((v) => v > 0);
  if (speeds.length === 0) return null;

  const maxSpeed = Math.max(...speeds);
  const BAR_COUNT = Math.min(60, speeds.length);
  const step = Math.max(1, Math.floor(speeds.length / BAR_COUNT));
  const buckets: number[] = [];
  for (let i = 0; i < speeds.length; i += step) {
    const slice = speeds.slice(i, i + step);
    buckets.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }

  return (
    <View style={s.container}>
      <Text style={s.label}>Velocità nel tempo</Text>
      <View style={s.chart}>
        {buckets.map((val, idx) => {
          const height = maxSpeed > 0 ? Math.max(2, Math.round((val / maxSpeed) * 48)) : 2;
          return (
            <View key={idx} style={[s.bar, { height, backgroundColor: colors.accent + "CC" }]} />
          );
        })}
      </View>
      <View style={s.axisRow}>
        <Text style={s.axisLabel}>0 km/h</Text>
        <Text style={s.axisLabel}>{maxSpeed.toFixed(0)} km/h max</Text>
      </View>
    </View>
  );
}

// ── SampleTable ─────────────────────────────────────────────────────────────

export function SampleTable({ samples, page, onLoadMore }: { samples: LapSample[]; page: number; onLoadMore: () => void }) {
  const colors = useColors();
  const s = tableStyles(colors);
  const visible = samples.slice(0, page * PAGE_SIZE);
  const hasMore = visible.length < samples.length;
  const startTs = samples[0]?.ts ?? 0;

  return (
    <View style={s.container}>
      <Text style={s.title}>Campioni ({samples.length})</Text>
      <View style={s.headerRow}>
        <Text style={[s.cell, s.headerCell, s.tsCell]}>Tempo</Text>
        <Text style={[s.cell, s.headerCell, s.valCell]}>km/h</Text>
        <Text style={[s.cell, s.headerCell, s.valCell]}>Piega°</Text>
        <Text style={[s.cell, s.headerCell, s.valCell]}>G</Text>
        <Text style={[s.cell, s.headerCell, s.gpsCell]}>Lat</Text>
        <Text style={[s.cell, s.headerCell, s.gpsCell]}>Lon</Text>
      </View>
      {visible.map((sample, idx) => {
        const elapsed = ((sample.ts - startTs) / 1000).toFixed(1);
        return (
          <View key={idx} style={[s.row, idx % 2 === 0 && s.rowAlt]}>
            <Text style={[s.cell, s.tsCell]}>{elapsed}s</Text>
            <Text style={[s.cell, s.valCell]}>{sample.speedKmh != null ? sample.speedKmh.toFixed(1) : "—"}</Text>
            <Text style={[s.cell, s.valCell]}>{sample.leanAngle != null ? sample.leanAngle.toFixed(1) : "—"}</Text>
            <Text style={[s.cell, s.valCell]}>{sample.gforce != null ? sample.gforce.toFixed(2) : "—"}</Text>
            <Text style={[s.cell, s.gpsCell]}>{sample.lat != null ? sample.lat.toFixed(5) : "—"}</Text>
            <Text style={[s.cell, s.gpsCell]}>{sample.lon != null ? sample.lon.toFixed(5) : "—"}</Text>
          </View>
        );
      })}
      {hasMore && (
        <TouchableOpacity style={s.loadMore} onPress={onLoadMore}>
          <Text style={s.loadMoreText}>Carica altri ({samples.length - visible.length} rimanenti)</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── StatTile ────────────────────────────────────────────────────────────────

export function StatTile({
  icon,
  iconColor,
  iconComponent,
  value,
  unit,
  label,
  colors,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  iconComponent?: React.ReactNode;
  value: string;
  unit?: string;
  label: string;
  colors: ReturnType<typeof useColors>;
}) {
  const s = tileStyles(colors);
  return (
    <View style={s.tile}>
      {iconComponent ?? (icon ? <Ionicons name={icon} size={18} color={iconColor ?? colors.accent} /> : null)}
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 2 }}>
        <Text style={s.value}>{value}</Text>
        {unit ? <Text style={s.unit}>{unit}</Text> : null}
      </View>
      <Text style={s.label}>{label}</Text>
    </View>
  );
}

// ── RenameModal ─────────────────────────────────────────────────────────────

export function RenameModal({
  visible,
  renameText,
  onChangeText,
  onClose,
  onConfirm,
  isPending,
}: {
  visible: boolean;
  renameText: string;
  onChangeText: (t: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  isPending: boolean;
}) {
  const colors = useColors();
  const s = modalStyles(colors);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={s.overlay}>
        <View style={s.card}>
          <Text style={s.title}>Rinomina giro</Text>
          <TextInput
            style={s.input}
            value={renameText}
            onChangeText={onChangeText}
            placeholder="Nome del giro"
            placeholderTextColor={colors.textSecondary}
            maxLength={40}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={onConfirm}
          />
          <Text style={s.counter}>{renameText.length}/40</Text>
          <View style={s.btns}>
            <TouchableOpacity style={[s.btn, s.btnCancel]} onPress={onClose} disabled={isPending}>
              <Text style={s.btnCancelText}>Annulla</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.btn, s.btnConfirm]}
              onPress={onConfirm}
              disabled={isPending || !renameText.trim()}
            >
              {isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={s.btnConfirmText}>Salva</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const tileStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    tile: { flex: 1, minWidth: "28%", alignItems: "center", paddingVertical: 10, gap: 4 },
    value: { fontSize: 16, fontFamily: "Inter_700Bold", color: colors.text },
    unit: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.textSecondary },
    label: { fontSize: 10, fontFamily: "Inter_400Regular", color: colors.textSecondary, textAlign: "center" },
  });

const sparkStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    container: { backgroundColor: colors.surface, borderRadius: 10, padding: 12, marginBottom: 12 },
    label: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.text, marginBottom: 8 },
    chart: { flexDirection: "row", alignItems: "flex-end", height: 52, gap: 2 },
    bar: { flex: 1, borderRadius: 2, minWidth: 3 },
    axisRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
    axisLabel: { fontSize: 10, fontFamily: "Inter_400Regular", color: colors.textSecondary },
  });

const tableStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    container: { backgroundColor: colors.surface, borderRadius: 10, padding: 12, marginBottom: 12 },
    title: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.text, marginBottom: 8 },
    headerRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 4, marginBottom: 2 },
    row: { flexDirection: "row", paddingVertical: 3 },
    rowAlt: { backgroundColor: colors.background },
    cell: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.text },
    headerCell: { fontFamily: "Inter_600SemiBold", color: colors.textSecondary },
    tsCell: { width: 48 },
    valCell: { flex: 1, textAlign: "right" },
    gpsCell: { width: 28, textAlign: "center" },
    loadMore: { alignItems: "center", paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border, marginTop: 4 },
    loadMoreText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.accent },
  });

const modalStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", paddingHorizontal: 24 },
    card: { backgroundColor: colors.surface, borderRadius: 14, padding: 20, width: "100%" },
    title: { fontSize: 16, fontFamily: "Inter_700Bold", color: colors.text, marginBottom: 14 },
    input: {
      backgroundColor: colors.background, borderRadius: 8, borderWidth: 1, borderColor: colors.border,
      paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, fontFamily: "Inter_400Regular", color: colors.text,
    },
    counter: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.textSecondary, textAlign: "right", marginTop: 4, marginBottom: 16 },
    btns: { flexDirection: "row", gap: 10 },
    btn: { flex: 1, borderRadius: 8, paddingVertical: 12, alignItems: "center", justifyContent: "center" },
    btnCancel: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    btnCancelText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.text },
    btnConfirm: { backgroundColor: colors.accent },
    btnConfirmText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
  });

export const lapDetailStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    center: { flex: 1, justifyContent: "center", alignItems: "center" },
    errorText: { fontSize: 14, fontFamily: "Inter_400Regular", color: colors.accentRed },
    header: {
      flexDirection: "row", alignItems: "center", paddingHorizontal: 12,
      paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 10,
    },
    backBtn: { padding: 4 },
    shareBtn: { padding: 4 },
    headerTitleArea: { flex: 1 },
    titleRow: { flexDirection: "row", alignItems: "center" },
    headerTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: colors.text, flexShrink: 1 },
    headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.textSecondary, marginTop: 2 },
    scroll: { padding: 16 },
    statsCard: { backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 12 },
    statsGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-around" },
    loadingRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 20 },
    loadingText: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.textSecondary },
    emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.textSecondary, paddingVertical: 16, textAlign: "center" },
    errorRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 16, flexWrap: "wrap" },
    errorRowText: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.accentRed, flex: 1 },
    retryText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.accent, paddingHorizontal: 4 },
    deleteBtn: {
      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
      backgroundColor: colors.accentRed, borderRadius: 10, paddingVertical: 14, marginTop: 8,
    },
    deleteBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
  });
