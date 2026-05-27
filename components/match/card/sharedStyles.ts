// Task #2603 — estratto da components/match/MatchCard.tsx (mechanical split)
import { StyleSheet } from "react-native";
import Colors from "@/constants/colors";

export const sharedStyles = StyleSheet.create({
  matchCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.accent + "30"
  },
  matchCardAccepted: {
    borderColor: Colors.success + "50",
    backgroundColor: Colors.success + "08"
  },
  matchCardSupermatch: {
    backgroundColor: "#FF8C001F",
    borderColor: "#FF8C0099",
    borderWidth: 2,
    padding: 10,
    borderRadius: 12,
    marginBottom: 8
  },
  matchCardDimmed: {
    opacity: 0.6,
    borderColor: Colors.border
  },
  matchStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10
  },
  statusLabel: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    flex: 1
  },
  matchDate: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary
  },
  removeBtn: {
    marginLeft: 4,
    padding: 2
  },
  matchUserInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  matchNickname: {
    fontSize: 20,
    fontFamily: "Inter_700Bold"
  },
  matchUserType: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary
  },
  chatBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.accent,
    paddingVertical: 8,
    borderRadius: 10,
    marginTop: 4,
    marginBottom: 8
  },
  chatBtnText: {
    color: Colors.background,
    fontSize: 16,
    fontFamily: "Inter_700Bold"
  },
  matchProposals: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8
  },
  proposalMini: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: 10,
    padding: 10
  },
  proposalMiniLabel: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
    marginBottom: 4
  },
  proposalMiniTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4
  },
  infoText: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary
  }
});
