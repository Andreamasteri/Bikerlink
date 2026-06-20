import { StyleSheet } from "react-native";
import Colors from "@/constants/colors";

export const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  tabBar: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 6,
    borderBottomWidth: 2,
    borderBottomColor: "transparent"
  },
  tabBtnActive: {
    borderBottomColor: Colors.accent
  },
  tabBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.textSecondary
  },
  tabBtnTextActive: {
    color: Colors.accent
  },
  tabBadge: {
    backgroundColor: "#FF6B35",
    borderRadius: 10,
    paddingHorizontal: 5,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: "center"
  },
  tabBadgeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    color: "#fff"
  },
  content: { padding: 16 },
  title: { fontFamily: "Inter_700Bold", fontSize: 24, color: Colors.text, marginBottom: 16 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" },
  modalContent: { backgroundColor: Colors.background, width: "95%", height: "90%", borderRadius: 20, padding: 20 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  modalTitle: { fontFamily: "Inter_700Bold", fontSize: 20, color: Colors.text },
  pwdModalContainer: { backgroundColor: Colors.surface, borderRadius: 20, padding: 24, width: "85%", gap: 16 },
  pwdModalTitle: { fontFamily: "Inter_700Bold", fontSize: 17, color: Colors.text, textAlign: "center" },
  pwdModalDesc: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "center" },
  pwdInput: { backgroundColor: Colors.background, borderRadius: 10, padding: 12, color: Colors.text, borderWidth: 1, borderColor: Colors.border },
  pwdModalButtons: { flexDirection: "row", gap: 10 },
  pwdBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  pwdBtnCancel: { backgroundColor: Colors.border },
  pwdBtnConfirm: { backgroundColor: Colors.accent },
  pwdBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text },
  confirmBox: { backgroundColor: Colors.surface, borderRadius: 20, padding: 24, width: "85%", alignItems: "center" },
  confirmTitle: { fontFamily: "Inter_700Bold", fontSize: 18, color: Colors.text, marginBottom: 8 },
  confirmDesc: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center", marginBottom: 24 },
  confirmBtns: { flexDirection: "row", gap: 12, width: "100%" },
  confirmCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, alignItems: "center" },
  confirmCancelBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.textSecondary },
  confirmDeleteBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: Colors.error, alignItems: "center" },
  confirmDeleteBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#fff" },
  errorText: { color: Colors.error, fontSize: 12 }
});
