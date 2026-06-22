/* eslint-disable @typescript-eslint/no-explicit-any */
import { StyleSheet } from "react-native";

export const makeStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  headerBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 12, backgroundColor: colors.background, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { fontSize: 18, fontWeight: "700", color: colors.text },
  scrollContent: { padding: 20 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center" },
  modalContent: { backgroundColor: colors.surface, borderRadius: 16, padding: 24, alignItems: "center", width: 300, gap: 16 },
  modalTitle: { fontSize: 18, fontWeight: "600", color: colors.text, textAlign: "center" },
  modalBody: { fontSize: 14, color: colors.textSecondary, textAlign: "center" },
  modalButtons: { flexDirection: "row", gap: 12, width: "100%" },
  modalBtnCancel: { flex: 1, backgroundColor: colors.background, borderRadius: 10, padding: 12, alignItems: "center" },
  modalBtnCancelText: { fontSize: 16, fontWeight: "600", color: colors.textSecondary },
  modalBtnConfirm: { flex: 1, backgroundColor: colors.accentRed, borderRadius: 10, padding: 12, alignItems: "center" },
  modalBtnConfirmText: { fontSize: 16, fontWeight: "600", color: "#fff" },
  loadMoreBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", padding: 12, marginTop: 12, gap: 8, backgroundColor: colors.surface, borderRadius: 10 },
  loadMoreText: { fontSize: 13, color: colors.accent, fontWeight: "600" },
  infoCard: { flexDirection: "row", backgroundColor: colors.surface, borderRadius: 12, padding: 16, marginTop: 16, gap: 12, borderWidth: 1, borderColor: colors.border },
  infoTitle: { fontSize: 14, fontWeight: "700", color: colors.text },
  infoDesc: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  emptyText: { fontSize: 15, color: colors.textSecondary, fontWeight: "500" },
});
