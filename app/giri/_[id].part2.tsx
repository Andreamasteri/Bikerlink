/* eslint-disable @typescript-eslint/no-explicit-any */
import { StyleSheet } from "react-native";

export const makeStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: colors.textSecondary, textAlign: "center", paddingVertical: 8 },
  loadMoreBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.surface, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 20 },
  loadMoreText: { fontFamily: "Inter_500Medium", fontSize: 14, color: colors.accent },
  infoCard: { flexDirection: "row", alignItems: "flex-start", gap: 12, backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginTop: 4 },
  infoTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.text },
  infoDesc: { fontFamily: "Inter_400Regular", fontSize: 13, color: colors.textSecondary, marginTop: 2 },
});

export function weatherIcon(code: number): any {
  if (code === 0) return "sunny-outline";
  if (code <= 3) return "partly-sunny-outline";
  if (code <= 9) return "cloud-outline";
  if (code <= 59) return "rainy-outline";
  if (code <= 79) return "snow-outline";
  if (code <= 99) return "thunderstorm-outline";
  return "cloud-outline";
}

export function bikerScoreColor(score: number, colors: any): string {
  if (score >= 0.7) return "#22c55e";
  if (score >= 0.4) return colors.accent;
  return colors.textSecondary;
}

export function poiTypeLabel(type: string): string {
  const map: Record<string, string> = {
    fuel: "Distributore", restaurant: "Ristorante", cafe: "Bar",
    hotel: "Hotel", viewpoint: "Panorama",
  };
  return map[type] ?? type;
}

export function poiTypeIcon(type: string): any {
  if (type === "fuel") return "flame-outline";
  if (type === "restaurant") return "restaurant-outline";
  if (type === "cafe") return "cafe-outline";
  if (type === "hotel") return "bed-outline";
  if (type === "viewpoint") return "eye-outline";
  return "location-outline";
}

export function styleLabel(style: string): string {
  const map: Record<string, string> = {
    direct: "Diretto", fast: "Veloce", balanced: "Bilanciato",
    curvy: "Curvy", extra_curvy: "Extra Curvy",
  };
  return map[style] ?? style;
}
