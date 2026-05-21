import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';

interface MatchEmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
}

export const MatchEmptyState: React.FC<MatchEmptyStateProps> = ({ icon, title, description }) => {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={48} color={Colors.textSecondary} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDesc}>{description}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 60,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    marginTop: 16,
    textAlign: "center",
  },
  emptyDesc: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 22,
  },
});
