import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Colors from "@/constants/colors";

interface UserSummaryStats {
  totale: { real: number; fake: number };
  biker: {
    total: { real: number; fake: number };
    M: { real: number; fake: number };
    F: { real: number; fake: number };
  };
  zavorrina: {
    total: { real: number; fake: number };
    M: { real: number; fake: number };
    F: { real: number; fake: number };
  };
  coppia: {
    total: { real: number; fake: number };
  };
}

interface UserSummaryProps {
  summary?: UserSummaryStats;
}

export const UserSummary: React.FC<UserSummaryProps> = ({ summary }) => {
  if (!summary) return null;

  return (
    <View style={summaryStyles.wrapper}>
      <Text style={summaryStyles.title}>STATISTICHE UTENTI</Text>
      <View style={summaryStyles.grid}>
        <View style={summaryStyles.card}>
          <Text style={summaryStyles.num}>{summary.totale.real}</Text>
          <Text style={summaryStyles.lbl}>Totale</Text>
        </View>
        <View style={summaryStyles.card}>
          <Text style={summaryStyles.num}>{summary.biker.total.real}</Text>
          <Text style={summaryStyles.lbl}>Biker</Text>
        </View>
        <View style={summaryStyles.card}>
          <Text style={summaryStyles.num}>{summary.zavorrina.total.real}</Text>
          <Text style={summaryStyles.lbl}>Zavorrine</Text>
        </View>
        <View style={summaryStyles.card}>
          <Text style={summaryStyles.num}>{summary.coppia.total.real}</Text>
          <Text style={summaryStyles.lbl}>Coppie</Text>
        </View>
      </View>
      <Text style={summaryStyles.fakeNote}>
        + {summary.totale.fake} profili di test/fake
      </Text>
    </View>
  );
};

const summaryStyles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    color: Colors.accent,
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
    minWidth: 72,
    flex: 1,
  },
  num: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: Colors.text,
  },
  lbl: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 2,
    textAlign: "center",
  },
  fakeNote: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 8,
    textAlign: "right",
  },
});
