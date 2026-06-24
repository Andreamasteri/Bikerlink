import { StyleSheet, Platform } from "react-native";
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
  tabDot: {
    position: "absolute", top: -3, right: -5,
    width: 8, height: 8, borderRadius: 4,
  },

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

  sparklineRow: {
    flexDirection: "row" as const,
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 3,
    flexWrap: "wrap" as const,
  },
  sparklinkDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    opacity: 0.85,
  },

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

  probeCard: {
    backgroundColor: Colors.card, borderRadius: 10,
    borderLeftWidth: 4, overflow: "hidden", marginBottom: 4,
  },
  probeHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    padding: 12, paddingBottom: 8,
  },
  probeHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 7 },
  probeTitle: { fontSize: 15, fontWeight: "700", color: Colors.text },
  probeRunBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7,
    borderWidth: 1, borderColor: Colors.accent,
  },
  probeRunBtnText: { fontSize: 12, color: Colors.accent, fontWeight: "600" },
  probeStatusRow: {
    flexDirection: "row", alignItems: "center", gap: 7,
    paddingHorizontal: 12, paddingBottom: 10,
  },
  probeStatusText: { fontSize: 16, fontWeight: "800" },
  probeDur: { fontSize: 12, color: Colors.textSecondary },
  probeTimestamp: { fontSize: 12, color: Colors.textSecondary },
  probeSteps: { paddingHorizontal: 12, paddingBottom: 12, gap: 6 },
  probeStepRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  probeStepDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  probeStepName: { fontSize: 12, fontWeight: "500", color: Colors.text },
  probeStepMsg: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  probeStepDur: { fontSize: 11, minWidth: 48, textAlign: "right" as const },
  probeNoData: { fontSize: 12, color: Colors.textSecondary, padding: 12 },

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

  // ─── Stato AI card (Task #4825) ───
  aiStatusCard: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    paddingHorizontal: 12, paddingVertical: 8, gap: 6,
  },
  aiStatusHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  aiStatusTitle: { fontSize: 11, fontWeight: "700", color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 },
  aiStatusRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  aiStatusLoading: { fontSize: 12, color: Colors.textSecondary },
  aiStatusChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: Colors.card, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5,
    minWidth: "47%", flexGrow: 1,
  },
  aiStatusDot: { width: 9, height: 9, borderRadius: 4.5 },
  aiStatusName: { fontSize: 12, fontWeight: "600", color: Colors.text },
  aiStatusDetail: { fontSize: 10, color: Colors.textSecondary },

  // ─── Scan tab (Task #4825) ───
  scanLabel: { fontSize: 12, fontWeight: "700", color: Colors.text, marginTop: 6, marginBottom: 2 },
  scanChipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  scanChip: {
    borderRadius: 16, paddingHorizontal: 11, paddingVertical: 6,
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border,
  },
  scanChipOn: { borderColor: Colors.accent, backgroundColor: Colors.accent + "22" },
  scanChipDisabled: { opacity: 0.4 },
  scanChipText: { fontSize: 12, color: Colors.textSecondary },
  scanChipTextOn: { color: Colors.accent, fontWeight: "600" },
  scanChipTextDisabled: { color: Colors.textSecondary },

  scanProviderChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderRadius: 16, paddingHorizontal: 11, paddingVertical: 6,
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border,
  },
  scanProviderDot: { width: 8, height: 8, borderRadius: 4 },

  scanRunBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: Colors.accent, paddingVertical: 12, borderRadius: 10, marginTop: 10,
  },
  scanRunBtnDisabled: { opacity: 0.55 },
  scanRunBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },

  scanProgressRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  scanProgressItem: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: Colors.card, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  scanProgressText: { fontSize: 11, color: Colors.textSecondary },

  scanSummaryRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  scanSummaryPill: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 8, backgroundColor: Colors.card },
  scanSummaryNum: { fontSize: 20, fontWeight: "800" },
  scanSummaryLbl: { fontSize: 10, color: Colors.textSecondary, marginTop: 1 },

  scanGroupHeader: { fontSize: 13, fontWeight: "700", color: Colors.text, marginTop: 12, marginBottom: 4 },
  scanResultCard: {
    backgroundColor: Colors.card, borderRadius: 10, padding: 10, gap: 4,
    borderLeftWidth: 4, marginBottom: 6,
  },
  scanResultHeaderRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  scanResultCheckId: { fontSize: 11, fontWeight: "700", color: Colors.textSecondary },
  scanBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  scanBadgeText: { fontSize: 10, fontWeight: "700" },
  scanResultFile: { fontSize: 11, color: Colors.accent },
  scanResultDesc: { fontSize: 13, color: Colors.text },
  scanResultEvidence: {
    fontSize: 11, color: Colors.textSecondary, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    backgroundColor: Colors.surface, borderRadius: 6, padding: 6,
  },
  scanDiffToggle: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  scanDiffToggleText: { fontSize: 12, color: Colors.accent, fontWeight: "600" },
  scanDiffBox: {
    backgroundColor: "#0b0b0b", borderRadius: 6, padding: 8, marginTop: 4,
    borderWidth: 1, borderColor: Colors.border,
  },
  scanDiffText: { fontSize: 11, color: "#d1d5db", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },

  scanTaskBtn: {
    flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start",
    borderWidth: 1, borderColor: Colors.accent, borderRadius: 7, paddingHorizontal: 9, paddingVertical: 4, marginTop: 4,
  },
  scanTaskBtnText: { fontSize: 11, color: Colors.accent, fontWeight: "600" },
  scanReviewHint: { fontSize: 11, color: "#dc2626", marginTop: 4, fontStyle: "italic" },

  scanActionBar: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  scanActionBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: 11, paddingVertical: 8,
    backgroundColor: Colors.card,
  },
  scanActionBtnText: { fontSize: 12, color: Colors.text, fontWeight: "600" },

  scanAiBox: {
    backgroundColor: Colors.surface, borderRadius: 10, padding: 10, marginTop: 12,
    borderWidth: 1, borderColor: Colors.border, gap: 4,
  },
  scanAiTitle: { fontSize: 13, fontWeight: "700", color: Colors.text },
  scanAiProvider: { fontSize: 11, color: Colors.textSecondary },
  scanAiBody: { fontSize: 12, color: Colors.text, lineHeight: 18 },
});

export default s;
