import { StyleSheet } from "react-native";
import Colors from "@/constants/colors";

export const styles = StyleSheet.create({
  summaryOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "flex-end"
  },
  summaryModal: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20
  },
  scrollContent: {
    flexShrink: 1
  },
  scrollContentContainer: {
    paddingBottom: 8
  },
  summaryTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    gap: 10
  },
  summaryTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.text
  },
  liveRunBadge: {
    backgroundColor: Colors.success + "20",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.success + "40"
  },
  liveRunText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    color: Colors.success
  },
  syncWarningBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.warning + "18",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.warning + "40",
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 14
  },
  syncWarningText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.warning,
    lineHeight: 16
  },
  kmGainedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.success + "15",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.success + "35",
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14
  },
  kmGainedBannerOffline: {
    backgroundColor: Colors.textSecondary + "12",
    borderColor: Colors.textSecondary + "25"
  },
  kmGainedText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: Colors.success
  },
  kmGainedTextOffline: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary
  },
  rideTitleInput: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: Colors.text,
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10
  },
  statCardPlaceholder: {
    flex: 1
  },
  summaryRecordBadge: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FFD700" + "20",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#FFD700" + "40"
  },
  summaryRecordText: {
    color: "#FFD700",
    fontSize: 14,
    fontFamily: "Inter_700Bold"
  },
  summaryRouteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.accent + "15",
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: Colors.accent + "30"
  },
  summaryRouteBtnText: {
    color: Colors.accent,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold"
  },
  summaryNote: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 20,
    marginBottom: 8,
    lineHeight: 18
  },
  autoSaveRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginBottom: 20
  },
  autoSaveText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: "Inter_400Regular"
  },
  summaryActions: {
    flexDirection: "row",
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border
  },
  summarySaveBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.success,
    borderRadius: 12,
    paddingVertical: 14
  },
  summarySaveText: {
    color: "#ffffff",
    fontSize: 15,
    fontFamily: "Inter_700Bold"
  },
  summaryPublishBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingVertical: 14
  },
  summaryPublishText: {
    color: "#ffffff",
    fontSize: 15,
    fontFamily: "Inter_700Bold"
  },
  summaryDeleteBtn: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ef4444" + "15",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ef4444" + "30"
  },
  summaryDeleteText: {
    display: "none"
  },
  summaryCloseBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: Colors.border
  },
  summaryCloseText: {
    color: Colors.textSecondary,
    fontSize: 15,
    fontFamily: "Inter_600SemiBold"
  },
  sensorOnlyBadge: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: Colors.warning + "12",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.warning + "35",
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginTop: 2,
  },
  sensorOnlyBadgeText: {
    flex: 1,
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.warning,
    lineHeight: 15,
  },
});
