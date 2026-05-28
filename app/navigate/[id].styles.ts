import { StyleSheet } from "react-native";
import { useColors } from "@/hooks/useColors";

export const makeStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    progressBg: { height: 4, backgroundColor: colors.border },
    progressFill: { height: 4, backgroundColor: colors.accent, borderRadius: 2 },
    offlineBanner: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      backgroundColor: "#c0392b",
      paddingVertical: 6,
      paddingHorizontal: 12,
    },
    offlineBannerText: { fontFamily: "Inter_500Medium", fontSize: 12, color: "#fff" },
    downloadBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: "rgba(0,0,0,0.72)",
      paddingVertical: 7,
      paddingHorizontal: 14,
    },
    downloadBannerText: { fontFamily: "Inter_500Medium", fontSize: 12, color: "#fff", flex: 1 },
    downloadProgressWrap: { flex: 1, gap: 4 },
    downloadProgressBg: { height: 3, backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 2, overflow: "hidden" },
    downloadProgressFill: { height: 3, backgroundColor: colors.accent, borderRadius: 2 },
    staleBanner: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      backgroundColor: "#e67e22",
      paddingVertical: 6,
      paddingHorizontal: 12,
    },
    staleBannerText: { fontFamily: "Inter_500Medium", fontSize: 12, color: "#fff" },
    offlineAvailableBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: "rgba(34,197,94,0.15)",
      paddingVertical: 7,
      paddingHorizontal: 14,
    },
    offlineAvailableBannerText: { fontFamily: "Inter_500Medium", fontSize: 12, color: "#22c55e", flex: 1 },
  });
