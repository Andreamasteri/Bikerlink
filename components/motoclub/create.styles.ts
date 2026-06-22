import { StyleSheet } from "react-native";
import Colors from "@/constants/colors";

export const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border
  },
  backBtn: { width: 40, alignItems: "flex-start" },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 18, color: Colors.text },
  stepsRow: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 24, paddingTop: 16, paddingBottom: 4
  },
  stepItem: { flex: 1, flexDirection: "row", alignItems: "center" },
  stepDot: {
    width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: Colors.border,
    alignItems: "center", justifyContent: "center", backgroundColor: Colors.surface
  },
  stepDotActive: { borderColor: Colors.accent, backgroundColor: Colors.accent },
  stepNum: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: Colors.textSecondary },
  stepNumActive: { color: "#fff" },
  stepLine: { flex: 1, height: 2, backgroundColor: Colors.border, marginHorizontal: 2 },
  stepLineActive: { backgroundColor: Colors.accent },
  stepLabel: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.textSecondary, textAlign: "center", marginBottom: 12 },
  body: { flex: 1, paddingHorizontal: 16 },
  bodyContent: { paddingBottom: 20 },
  fieldLabel: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text, marginBottom: 8 },
  fieldDesc: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary, marginBottom: 12 },
  textInput: {
    backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 12, color: Colors.text,
    fontFamily: "Inter_400Regular", fontSize: 15
  },
  radioRow: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 14,
    backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, marginBottom: 10
  },
  radioRowSelected: { borderColor: Colors.accent, backgroundColor: Colors.accent + "10" },
  radioCircle: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: Colors.border,
    alignItems: "center", justifyContent: "center"
  },
  radioCircleSelected: { borderColor: Colors.accent },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.accent },
  radioLabel: { fontFamily: "Inter_500Medium", fontSize: 15, color: Colors.text },
  parentPickerBox: { marginTop: 10 },
  parentList: { maxHeight: 180, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  parentItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  parentItemSelected: { backgroundColor: Colors.accent + "10" },
  parentItemText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text, flex: 1 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary, padding: 12 },
  map: { flex: 1, borderRadius: 12, overflow: "hidden", margin: 0, minHeight: 280 },
  locationBtn: {
    flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10,
    padding: 10, borderRadius: 8, borderWidth: 1, borderColor: Colors.accent + "60",
    backgroundColor: Colors.accent + "10"
  },
  locationBtnText: { fontFamily: "Inter_500Medium", fontSize: 14, color: Colors.accent },
  coordText: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 8 },
  noCoordText: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 8, fontStyle: "italic" },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 16, color: Colors.text, marginBottom: 16 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: Colors.border,
    alignItems: "center", justifyContent: "center"
  },
  checkboxChecked: { borderColor: Colors.accent, backgroundColor: Colors.accent },
  checkLabel: { fontFamily: "Inter_500Medium", fontSize: 15, color: Colors.text },
  radiusRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, marginLeft: 34 },
  radiusLabel: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text },
  radiusInput: {
    width: 64, borderWidth: 1, borderColor: Colors.accent, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6, textAlign: "center",
    color: Colors.text, fontFamily: "Inter_600SemiBold", fontSize: 15, backgroundColor: Colors.surface
  },
  searchDropdown: {
    backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border,
    marginTop: 4
  },
  searchItem: {
    flexDirection: "row", alignItems: "center", gap: 10, padding: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.border
  },
  searchItemText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text, flex: 1 },
  selectedUsersBox: {
    marginTop: 12, backgroundColor: Colors.surface, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border, padding: 10
  },
  selectedUsersTitle: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.textSecondary, marginBottom: 8 },
  selectedUserRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  selectedUserName: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text, flex: 1 },
  noInviteText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary, fontStyle: "italic", marginTop: 10 },
  summaryCard: {
    backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 16, gap: 12
  },
  summaryRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  summaryLabel: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, width: 90 },
  summaryValue: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text, flex: 1 },
  summaryNote: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, marginTop: 20, textAlign: "center", lineHeight: 18 },
  submitBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: Colors.accent, borderRadius: 12, paddingVertical: 14, marginTop: 24
  },
  submitBtnText: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#fff" },
  footer: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.border },
  nextBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: Colors.accent, borderRadius: 12, paddingVertical: 14
  },
  nextBtnText: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#fff" },
  successBox: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 30 },
  successTitle: { fontFamily: "Inter_700Bold", fontSize: 24, color: Colors.text, marginTop: 24, marginBottom: 12 },
  successDesc: { fontFamily: "Inter_400Regular", fontSize: 16, color: Colors.textSecondary, textAlign: "center", lineHeight: 24, marginBottom: 32 },
  doneBtn: { backgroundColor: Colors.accent, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  doneBtnText: { fontFamily: "Inter_700Bold", fontSize: 15, color: "#fff" }
});
