import React from "react";
import {
  View, Text, TouchableOpacity, Modal, StyleSheet, Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

const SHIP_TYPE_LABELS: Record<number, string> = {
  0: "Non specificato",
  20: "WIG",
  21: "WIG — pericolo A",
  22: "WIG — pericolo B",
  23: "WIG — pericolo C",
  24: "WIG — pericolo D",
  30: "Pesca",
  31: "Traino",
  32: "Traino lungo/largo",
  33: "Dragaggio",
  34: "Operazioni subacquee",
  35: "Operazioni militari",
  36: "Vela",
  37: "Imbarcazione da diporto",
  40: "Nave ad alta velocità (HSC)",
  41: "HSC — pericolo A",
  42: "HSC — pericolo B",
  43: "HSC — pericolo C",
  44: "HSC — pericolo D",
  50: "Pilotina",
  51: "Ricerca e soccorso",
  52: "Rimorchiatore",
  53: "Nave appoggio porto",
  54: "Antinquinamento",
  55: "Ente di controllo",
  56: "Locale",
  57: "Locale",
  58: "Materiali medicali",
  59: "Nave non combattente",
  60: "Passeggeri",
  61: "Passeggeri — pericolo A",
  62: "Passeggeri — pericolo B",
  63: "Passeggeri — pericolo C",
  64: "Passeggeri — pericolo D",
  70: "Cargo",
  71: "Cargo — pericolo A",
  72: "Cargo — pericolo B",
  73: "Cargo — pericolo C",
  74: "Cargo — pericolo D",
  80: "Petroliera",
  81: "Petroliera — pericolo A",
  82: "Petroliera — pericolo B",
  83: "Petroliera — pericolo C",
  84: "Petroliera — pericolo D",
  90: "Altro",
  91: "Altro — pericolo A",
  92: "Altro — pericolo B",
  93: "Altro — pericolo C",
  94: "Altro — pericolo D",
};

function shipTypeLabel(typeCode: number | null | undefined): string {
  if (typeCode == null) return "Non specificato";
  const exact = SHIP_TYPE_LABELS[typeCode];
  if (exact) return exact;
  const rangeBase = Math.floor(typeCode / 10) * 10;
  return SHIP_TYPE_LABELS[rangeBase] ?? `Tipo ${typeCode}`;
}

function formatSpeed(speed: number | null | undefined): string {
  if (speed == null) return "N/D";
  return (speed / 10).toFixed(1) + " kn";
}

function formatLastSeen(timestamp: number | null | undefined): string {
  if (timestamp == null) return "N/D";
  const ts = timestamp > 1e12 ? timestamp : timestamp * 1000;
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return "adesso";
  if (diff < 3600) return `${Math.floor(diff / 60)} min fa`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h fa`;
  return `${Math.floor(diff / 86400)}g fa`;
}

export interface VesselData {
  mmsi: number;
  name?: string | null;
  lat: number;
  lng: number;
  cog: number;
  sog: number | null;
  shipType?: number | null;
  updatedAt?: number | null;
  trueHeading?: number;
}

interface VesselDetailSheetProps {
  vessel: VesselData | null;
  onClose: () => void;
}

export function VesselDetailSheet({ vessel, onClose }: VesselDetailSheetProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const visible = !!vessel;
  const displayName = vessel ? (vessel.name?.trim() || `MMSI ${vessel.mmsi}`) : "";
  const typeLabel = vessel ? shipTypeLabel(vessel.shipType) : "";
  const marineUrl = vessel
    ? `https://www.marinetraffic.com/en/ais/details/ships/mmsi:${vessel.mmsi}`
    : "";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16, elevation: 20, zIndex: 9999 }]}>
        <View style={[styles.handle, { backgroundColor: colors.border }]} />

        {vessel && (
          <>
            <View style={[styles.headerRow, { borderBottomColor: colors.border }]}>
              <View style={[styles.iconBadge, { backgroundColor: "#0284c7" }]}>
                <Text style={styles.iconEmoji}>🚢</Text>
              </View>
              <View style={styles.headerMeta}>
                <Text style={[styles.vesselName, { color: colors.text }]} numberOfLines={1}>
                  {displayName}
                </Text>
                <Text style={[styles.vesselType, { color: colors.textMuted }]} numberOfLines={1}>
                  {typeLabel}
                </Text>
              </View>
              <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={10}>
                <Text style={[styles.closeBtnText, { color: colors.textMuted }]}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.rows}>
              <Row label="MMSI" value={String(vessel.mmsi)} colors={colors} />
              <Row label="Velocità" value={formatSpeed(vessel.sog)} colors={colors} />
              <Row label="Rotta" value={vessel.cog != null ? `${vessel.cog}°` : "N/D"} colors={colors} />
              <Row label="Ultima posizione" value={formatLastSeen(vessel.updatedAt)} colors={colors} />
            </View>

            <TouchableOpacity
              style={[styles.marineBtn, { borderColor: "#0284c7" }]}
              activeOpacity={0.8}
              onPress={() => Linking.openURL(marineUrl).catch(() => null)}
            >
              <Text style={[styles.marineBtnText, { color: "#0284c7" }]}>
                🔗 Apri su MarineTraffic
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </Modal>
  );
}

function Row({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <Text style={[styles.rowLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 12,
    paddingHorizontal: 16,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 6,
  },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  iconEmoji: {
    fontSize: 22,
  },
  headerMeta: {
    flex: 1,
    gap: 2,
  },
  vesselName: {
    fontSize: 16,
    fontWeight: "700",
  },
  vesselType: {
    fontSize: 12,
  },
  closeBtn: {
    padding: 4,
    flexShrink: 0,
  },
  closeBtnText: {
    fontSize: 18,
    fontWeight: "600",
  },
  rows: {
    marginTop: 4,
    marginBottom: 16,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: {
    fontSize: 13,
  },
  rowValue: {
    fontSize: 14,
    fontWeight: "600",
  },
  marineBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 4,
  },
  marineBtnText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
