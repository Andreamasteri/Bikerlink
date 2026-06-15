import { StyleSheet } from "react-native";
import Colors from "@/constants/colors";

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  tabBar: {
    flexDirection: "row",
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    gap: 3,
  },
  tabItemActive: { borderBottomWidth: 2, borderBottomColor: Colors.accent },
  tabLabel: { fontSize: 11, color: Colors.textSecondary },
  tabLabelActive: { color: Colors.accent, fontWeight: "600" },
  tabBadge: {
    position: "absolute", top: -4, right: -8,
    backgroundColor: "#ef4444", borderRadius: 8,
    minWidth: 16, height: 16, alignItems: "center", justifyContent: "center",
    paddingHorizontal: 3,
  },
  tabBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },

  tabContent2: { flex: 1 },
  tabContent: { padding: 12, gap: 10 },

  controlRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  runButton: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: Colors.accent, paddingHorizontal: 16, paddingVertical: 9,
    borderRadius: 8,
  },
  runButtonDisabled: { opacity: 0.6 },
  runButtonText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  scopeScroll: { flex: 1 },
  scopeChip: {
    borderRadius: 16, paddingHorizontal: 12, paddingVertical: 5,
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border,
    marginRight: 6,
  },
  scopeChipActive: { borderColor: Colors.accent, backgroundColor: Colors.accent + "22" },
  scopeChipText: { fontSize: 12, color: Colors.textSecondary },
  scopeChipTextActive: { color: Colors.accent, fontWeight: "600" },

  runMeta: { flexDirection: "row", alignItems: "center", gap: 10 },
  overallBadge: {
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6, borderWidth: 1,
  },
  overallBadgeText: { fontSize: 12, fontWeight: "700" },
  runMetaText: { fontSize: 12, color: Colors.textSecondary },

  pipelineCard: {
    backgroundColor: Colors.card, borderRadius: 10,
    borderLeftWidth: 4, overflow: "hidden",
  },
  pipelineHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    padding: 12,
  },
  pipelineHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  pipelineHeaderRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  pipelineLabel: { fontSize: 14, fontWeight: "600", color: Colors.text },
  pipelineDur: { fontSize: 12, color: Colors.textSecondary },

  pipelineBody: { paddingHorizontal: 12, paddingBottom: 12, gap: 6 },

  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  stepDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  stepName: { fontSize: 12, fontWeight: "500", color: Colors.text },
  stepMsg: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  stepDur: { fontSize: 11, minWidth: 48, textAlign: "right" },

  suggestedFix: {
    flexDirection: "row", gap: 6, alignItems: "flex-start",
    backgroundColor: "#f59e0b18", borderRadius: 6, padding: 8, marginTop: 4,
  },
  suggestedFixText: { flex: 1, fontSize: 11, color: "#d97706" },

  sectionHeader: {
    flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4,
  },
  sectionTitle: { fontSize: 13, fontWeight: "600", color: Colors.text },

  noHoles: {
    flexDirection: "row", alignItems: "center", gap: 8,
    padding: 14, backgroundColor: Colors.card, borderRadius: 10,
  },
  noHolesText: { fontSize: 13, color: Colors.textSecondary },

  holeRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: Colors.card, borderRadius: 10, padding: 12,
    borderLeftWidth: 3, borderLeftColor: "#f59e0b",
  },
  holeLeft: { flex: 1, gap: 2 },
  holePipeline: { fontSize: 13, fontWeight: "600", color: Colors.text, textTransform: "capitalize" },
  holeCheckpoint: { fontSize: 11, color: Colors.textSecondary },
  holeAge: { fontSize: 11, color: Colors.textSecondary },
  holeRight: { alignItems: "flex-end" },
  holeAgeLabel: { fontSize: 16, fontWeight: "700", color: "#f59e0b" },
  holeAgeSub: { fontSize: 10, color: Colors.textSecondary },

  deviceCard: {
    backgroundColor: Colors.card, borderRadius: 10, padding: 12,
  },
  deviceCardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  deviceCardUser: { fontSize: 13, fontWeight: "600", color: Colors.text },
  deviceCardMeta: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  failBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  failBadgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  deviceCardBody: { marginTop: 10, gap: 2, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border },
  deviceSummaryLine: { fontSize: 12, color: Colors.text },

  liveDashboardBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  liveDashboardBtnText: { fontSize: 11, color: Colors.accent, fontWeight: "600", flex: 1 },

  centered: { flex: 1, justifyContent: "center", alignItems: "center", minHeight: 200 },
  emptyState: { alignItems: "center", padding: 40, gap: 10 },
  emptyStateText: { fontSize: 16, fontWeight: "600", color: Colors.text },
  emptyStateSub: { fontSize: 13, color: Colors.textSecondary, textAlign: "center" },

  deviceTabHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginBottom: 4,
  },
  deviceTabTitle: { fontSize: 13, fontWeight: "600", color: Colors.text },
  exportButton: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: Colors.accent, paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 8,
  },
  exportButtonDisabled: { opacity: 0.6 },
  exportButtonText: { color: "#fff", fontWeight: "600", fontSize: 13 },
});

export default s;
