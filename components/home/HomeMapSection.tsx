import React, { useRef } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import Colors from "@/constants/colors";

interface CardLayout {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface HomeMapSectionProps {
  onCardLayout: (layout: CardLayout) => void;
}

export const HomeMapSection: React.FC<HomeMapSectionProps> = ({ onCardLayout }) => {
  const cardRef = useRef<View>(null);

  const handleLayout = () => {
    cardRef.current?.measure((_x, _y, width, height, pageX, pageY) => {
      onCardLayout({ top: pageY, left: pageX, width, height });
    });
  };

  return (
    <View
      ref={cardRef}
      style={styles.mapPlaceholder}
      onLayout={handleLayout}
    >
      <Pressable style={StyleSheet.absoluteFill} />
    </View>
  );
};

const styles = StyleSheet.create({
  mapPlaceholder: {
    height: 253,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 20,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
});
