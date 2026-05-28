import { StyleSheet } from "react-native";
import Colors from "@/constants/colors";

export const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background },
  emptyText: { fontSize: 16, color: Colors.textSecondary, fontFamily: "Inter_400Regular", marginTop: 12 },
  backButton: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 28,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  backButtonText: { fontSize: 15, fontFamily: "Inter_500Medium", color: Colors.text },
  avatarSection: { alignItems: "center", paddingTop: 24, paddingBottom: 16 },
  avatar: { width: 96, height: 96, borderRadius: 48, justifyContent: "center", alignItems: "center", marginBottom: 12 },
  nicknameRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 0 },
  nickname: { fontSize: 24, fontFamily: "Inter_700Bold" },
  statusRow: { flexDirection: "row" as const, gap: 6, marginTop: 8, marginBottom: 2 },
  statusBadge: { flexDirection: "row" as const, alignItems: "center" as const, gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  statusBadgeText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  lastSeenText: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 4 },
  userType: { fontSize: 15, fontFamily: "Inter_500Medium", color: Colors.textSecondary, marginTop: 4 },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 },
  locationText: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  sprintRankBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.accentRed + "50"
  },
  sprintRankText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text
  },
  section: { paddingHorizontal: 20, marginTop: 16 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.accent, marginBottom: 8 },
  bioText: { fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.text, lineHeight: 22 },
  motoCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 8 },
  motoInfo: { flex: 1 },
  motoName: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.text },
  motoDetail: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 2 },
  routesButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    paddingVertical: 14,
    marginHorizontal: 20,
    marginTop: 16,
    borderWidth: 1,
    borderColor: Colors.accent
  },
  routesButtonText: { fontSize: 15, fontWeight: "600" as const, color: Colors.accent },
  chatButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
    marginHorizontal: 20,
    marginTop: 16
  },
  chatButtonText: { fontSize: 16, fontWeight: "700" as const, color: Colors.background },
  blockButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    paddingVertical: 14,
    marginHorizontal: 20,
    marginTop: 12,
    borderWidth: 1,
    borderColor: Colors.error
  },
  unblockButton: {
    borderColor: Colors.textSecondary
  },
  blockButtonDisabled: {
    opacity: 0.5
  },
  blockButtonText: { fontSize: 15, fontWeight: "600" as const, color: Colors.error },
  avatarImage: { width: 96, height: 96, borderRadius: 48 },
  photoThumb: { width: 80, height: 80, borderRadius: 10, marginRight: 8, backgroundColor: Colors.surfaceLight },
  photoModal: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center"
  },
  photoModalImage: { width: "100%", height: "80%" },
  photoModalClose: {
    position: "absolute",
    top: 48,
    right: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 20,
    padding: 6
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end"
  },
  menuSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: 0
  },
  menuHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: "center",
    marginBottom: 16
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 24
  },
  menuItemText: { fontSize: 16, fontFamily: "Inter_500Medium" },
  menuDivider: { height: 1, backgroundColor: Colors.border, marginHorizontal: 16 },
});
