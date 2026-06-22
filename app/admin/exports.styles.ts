import { StyleSheet } from "react-native";
import Colors from "@/constants/colors";

export const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 16 },
  card: {
    backgroundColor: Colors.surface, borderRadius: 16,
    padding: 16, borderWidth: 1, borderColor: Colors.border,
  },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  cardTitle: { flex: 1, fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.text },
  storageInfo: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, marginBottom: 6 },
  storagePath: { fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.accent },
  scheduleOption: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 10, paddingHorizontal: 4,
    borderRadius: 10, marginBottom: 2,
  },
  scheduleOptionActive: { backgroundColor: Colors.accent + "12" },
  scheduleRadio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: Colors.border,
    alignItems: "center", justifyContent: "center",
  },
  scheduleRadioActive: { borderColor: Colors.accent },
  scheduleRadioDot: {
    width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.accent,
  },
  scheduleTextGroup: { flex: 1 },
  scheduleLabel: { fontFamily: "Inter_500Medium", fontSize: 14, color: Colors.text },
  scheduleLabelActive: { color: Colors.accent },
  scheduleDesc: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary },
  nextScheduledText: {
    fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary,
    marginTop: 8, marginLeft: 4,
  },
  optionRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  optionLabel: { fontFamily: "Inter_500Medium", fontSize: 14, color: Colors.text },
  optionDesc: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  runBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, backgroundColor: Colors.accent,
    borderRadius: 14, paddingVertical: 16,
  },
  runBtnText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 16 },
  btnDisabled: { opacity: 0.5 },
  errorBanner: {
    backgroundColor: Colors.error + "20", borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: Colors.error + "40",
  },
  errorText: { color: Colors.error, fontSize: 13, fontFamily: "Inter_400Regular" },
  progressPctText: { fontFamily: "Inter_700Bold", fontSize: 16, color: Colors.accent },
  progressBarTrack: {
    height: 8, borderRadius: 4, backgroundColor: Colors.border,
    overflow: "hidden", marginBottom: 10,
  },
  progressBarFill: { height: 8, borderRadius: 4, backgroundColor: Colors.accent },
  progressPhaseText: {
    fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.textSecondary, marginBottom: 12,
  },
  progressTableRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  progressTableName: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 14, color: Colors.text },
  progressTableNameActive: { color: Colors.accent, fontFamily: "Inter_600SemiBold" },
  progressTableRows: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary },
  progressTotalText: {
    fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.text,
    marginTop: 10, textAlign: "center",
  },
  metaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 14 },
  metaItem: { width: "45%" },
  metaLabel: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginBottom: 2 },
  metaValue: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text },
  downloadBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: 10, borderWidth: 1, borderColor: Colors.accent + "50",
    backgroundColor: Colors.accent + "10",
  },
  downloadBtnText: {
    color: Colors.accent, fontFamily: "Inter_600SemiBold", fontSize: 13,
    flex: 1, flexShrink: 1,
  },
  historyToggle: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 12,
  },
  historyToggleText: { color: Colors.accent, fontFamily: "Inter_500Medium", fontSize: 14 },
  historyItem: { paddingVertical: 12 },
  historyItemBorder: { borderTopWidth: 1, borderTopColor: Colors.border },
  historyItemHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6,
  },
  historyDate: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.text, flex: 1 },
  historyMeta: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right" },
  historyActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  historyDuration: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary },
  historyDownloadBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 8, borderWidth: 1, borderColor: Colors.accent + "40",
  },
  historyDownloadText: { color: Colors.accent, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  emptyState: { alignItems: "center", paddingVertical: 32, gap: 12 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary },
});
