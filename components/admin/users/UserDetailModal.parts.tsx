// overflow di components/admin/users/UserDetailModal.tsx — StyleSheet estratti
import { StyleSheet } from "react-native";
import Colors from "@/constants/colors";

export const sessionStyles = StyleSheet.create({
  countBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  countText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sessionInfo: {
    flex: 1,
    gap: 2,
  },
  sessionSid: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.text,
  },
  sessionExpiry: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    marginLeft: 20,
  },
  revokeBtn: {
    backgroundColor: Colors.error + "22",
    borderWidth: 1,
    borderColor: Colors.error + "66",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginLeft: 8,
  },
  revokeBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.error,
  },
});

export const fzStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  chip: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.accent + "66",
    backgroundColor: Colors.surface,
  },
  chipDisabled: {
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    opacity: 0.5,
  },
  chipNum: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: Colors.accent,
  },
  chipType: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  chipTextDisabled: {
    color: Colors.textSecondary,
  },
  note: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 8,
    textAlign: "center" as const,
  },
});

export const statsStyles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    marginTop: 40,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: Colors.text,
  },
  section: {
    marginTop: 20,
  },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: Colors.accent,
    marginBottom: 10,
    textTransform: "uppercase" as const,
    letterSpacing: 1,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border + "44",
  },
  label: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary },
  value: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.text },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statBox: {
    width: "31%",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statNumber: { fontFamily: "Inter_700Bold", fontSize: 22, color: Colors.text },
  statLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textSecondary,
    textAlign: "center",
    marginTop: 4,
  },
  motoCard: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  motoTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text },
  motoSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  logItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border + "44",
  },
  logText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.text,
    flex: 1,
  },
  logDate: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    marginLeft: 8,
  },
});
