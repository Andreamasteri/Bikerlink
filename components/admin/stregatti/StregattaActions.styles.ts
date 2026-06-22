import { StyleSheet } from "react-native";
import Colors from "@/constants/colors";

export const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  controlsCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  controlRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  controlInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  controlLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.text,
  },
  controlDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 6,
  },
  lockedHint: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: Colors.error,
    marginTop: 4,
  },
  controlDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 14,
  },
  motionStats: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 4,
  },
  motionStatRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  motionStatText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
  },
  speedDistRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 2,
    marginBottom: 2,
  },
  speedChip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  speedChipText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    color: "#fff",
  },
  gridContainer: {
    flexDirection: "row",
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 6,
  },
  actionBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.text,
  },
  deleteAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.error,
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 16,
  },
  deleteAllBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: "#fff",
  },
  seedStatus: {
    marginTop: 10,
    padding: 8,
    backgroundColor: Colors.accent + "20",
    borderRadius: 8,
    alignItems: "center",
  },
  seedStatusText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.accent,
  },
  errorBanner: {
    marginTop: 10,
    padding: 8,
    backgroundColor: Colors.error + "20",
    borderRadius: 8,
    alignItems: "center",
  },
  errorText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.error,
  },
  bboxInfo: {
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: Colors.accent + "15",
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  bboxInfoText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.accent,
  },
});
