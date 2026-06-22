import { StyleSheet, Platform } from "react-native";
import Colors from "@/constants/colors";

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  slide: {
    overflow: "hidden",
  },
  image: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  slideOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: 24,
    backgroundColor: "rgba(0,0,0,0.38)",
  },
  sectionBadge: {
    alignSelf: "flex-start",
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 10,
  },
  sectionText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    color: "#000",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  slideTitle: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    marginBottom: 8,
    lineHeight: 32,
    ...Platform.select({
      ios: { textShadowColor: "rgba(0,0,0,0.7)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
      android: { textShadowColor: "rgba(0,0,0,0.7)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
      web: { textShadow: "0px 1px 6px rgba(0,0,0,0.7)" },
    }),
  },
  slideDesc: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.88)",
    lineHeight: 22,
    ...Platform.select({
      ios: { textShadowColor: "rgba(0,0,0,0.6)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
      android: { textShadowColor: "rgba(0,0,0,0.6)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
      web: { textShadow: "0px 1px 4px rgba(0,0,0,0.6)" },
    }),
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 10,
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  headerBtnPlaceholder: {
    width: 44,
    height: 44,
  },
  progressContainer: {
    backgroundColor: "rgba(0,0,0,0.4)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  progressText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.85)",
  },
  skipText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "rgba(255,255,255,0.9)",
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    gap: 16,
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    borderRadius: 4,
  },
  dotActive: {
    width: 20,
    height: 8,
    backgroundColor: Colors.accent,
  },
  dotInactive: {
    width: 8,
    height: 8,
    backgroundColor: "rgba(255,255,255,0.4)",
  },
  nextBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  nextBtnLast: {
    backgroundColor: Colors.accent,
  },
  nextBtnRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  nextBtnText: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: Colors.background,
  },
});
