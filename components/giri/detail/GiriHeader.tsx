import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

interface GiriHeaderProps {
  title: string;
  isOwner: boolean;
  onBack: () => void;
  onDelete: () => void;
}

export const GiriHeader: React.FC<GiriHeaderProps> = ({
  title,
  isOwner,
  onBack,
  onDelete,
}) => {
  const colors = useColors();
  const s = styles(colors);

  return (
    <View style={s.nav}>
      <Pressable onPress={onBack} style={s.backBtn} hitSlop={12}>
        <Ionicons name="arrow-back" size={22} color={colors.text} />
      </Pressable>
      <Text style={s.navTitle} numberOfLines={1}>{title}</Text>
      {isOwner ? (
        <Pressable onPress={onDelete} hitSlop={12} style={{ padding: 4 }}>
          <Ionicons name="trash-outline" size={20} color={colors.accentRed} />
        </Pressable>
      ) : (
        <View style={{ width: 28 }} />
      )}
    </View>
  );
};

const styles = (colors: any) => StyleSheet.create({
  nav: { 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "space-between", 
    paddingHorizontal: 12, 
    paddingBottom: 10 
  },
  backBtn: { width: 40, height: 40, justifyContent: "center" },
  navTitle: { 
    fontFamily: "Inter_700Bold", 
    fontSize: 16, 
    color: colors.text, 
    flex: 1, 
    textAlign: "center" 
  },
});
