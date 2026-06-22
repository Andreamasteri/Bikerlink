import { StyleSheet } from "react-native";
import Colors from "@/constants/colors";

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  warningBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#2D1F00",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#F59E0B",
  },
  warningText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: "#F59E0B",
    flex: 1,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardHeader: {
    marginBottom: 10,
  },
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: Colors.text,
  },
  cardMeta: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  preview: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 19,
    backgroundColor: Colors.background,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  emptyPreview: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    fontStyle: "italic",
    marginBottom: 12,
  },

  /* Bozza pronta */
  draftBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#0D1B2E",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#3B82F6",
  },
  draftBannerText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: "#93C5FD",
    flex: 1,
    lineHeight: 17,
  },

  /* 3-colonne */
  colGrid: {
    flexDirection: "row",
    gap: 0,
    marginTop: 4,
  },
  col: {
    flex: 1,
    gap: 6,
  },
  colLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  colDivider: {
    width: 1,
    backgroundColor: Colors.border,
    marginHorizontal: 8,
    marginVertical: 4,
  },

  /* Bottoni */
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    minHeight: 34,
  },
  btnPrimary: {
    backgroundColor: "#FF6B35",
  },
  btnSecondary: {
    backgroundColor: Colors.accent,
  },
  btnOutline: {
    borderWidth: 1,
    borderColor: Colors.accent,
    backgroundColor: "transparent",
  },
  btnSlides: {
    backgroundColor: "#2563EB",
  },
  btnActivate: {
    backgroundColor: "#16A34A",
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: "#fff",
  },
  btnPublish: {
    backgroundColor: "#16A34A",
  },

  /* Sezioni slides */
  subSection: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginBottom: 14,
    paddingBottom: 14,
  },
  subSectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  slideDescription: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#052E16",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#22C55E",
  },
  successText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: "#22C55E",
  },
  slidesList: {
    marginBottom: 10,
    paddingLeft: 4,
  },
  slideItem: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  promptInput: {
    backgroundColor: Colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.text,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    padding: 10,
    marginBottom: 10,
    minHeight: 72,
    textAlignVertical: "top" as const,
  },
  numSlidesRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    marginBottom: 14,
  },
  numSlidesLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.text,
  },
  numSlidesInput: {
    backgroundColor: Colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 6,
    width: 60,
    textAlign: "center" as const,
  },
  previewSection: {
    marginBottom: 12,
  },
  previewLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.text,
    marginBottom: 10,
  },
  previewScroll: {
    marginHorizontal: -16,
  },
  previewScrollContent: {
    paddingHorizontal: 16,
    gap: 10,
  },
  previewCard: {
    width: 240,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  previewImage: {
    width: 240,
    height: 134,
  },
  previewCardTitle: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: Colors.text,
    padding: 8,
    lineHeight: 17,
  },

  /* Modal — visualizza documento attivo */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    maxHeight: "80%",
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    paddingBottom: 4,
  },
  modalTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
    color: Colors.text,
  },
  modalMeta: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  modalBody: {
    paddingHorizontal: 16,
    maxHeight: 300,
  },
  modalText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.text,
    lineHeight: 21,
  },
  modalTruncNote: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    fontStyle: "italic",
    marginTop: 10,
    marginBottom: 4,
  },

  /* PDF draft preview in Col 2 */
  pdfDraftCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#052E16",
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: "#16A34A",
  },
  pdfDraftName: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: "#4ADE80",
  },
  pdfDraftMeta: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: "#10B981",
    marginTop: 1,
  },
});
