import { StyleSheet } from "react-native";
import Colors from "@/constants/colors";

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  compactHeader: {
    flexDirection: "row",
    alignItems: "center",
    height: 36,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginTop: 30,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  headerCount: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  tabBar: {
    height: 40,
    marginTop: 30,
  },
  tabBarContent: {
    flexDirection: "row",
    paddingHorizontal: 8,
    alignItems: "center",
    height: 40,
  },
  tabItem: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabItemActive: {
    borderBottomColor: Colors.accent,
  },
  tabText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: Colors.accent,
    fontFamily: "Inter_600SemiBold",
  },
  sendModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sendModalCard: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  sendModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
  },
  sendModalTitle: {
    flex: 1,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  sendModalSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  sendModalEmpty: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
  },
  sendConvRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  sendConvAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  sendConvAvatarPlaceholder: {
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  sendConvName: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
});

export const lastfmBannerStyles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    backgroundColor: "#fffbeb",
    padding: 12,
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#fde68a",
    alignItems: "center",
  },
  text: {
    fontSize: 13,
    color: "#92400e",
    flex: 1,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
});
