import React, { useRef } from "react";
import { View, Pressable, StyleSheet, findNodeHandle, type LayoutChangeEvent } from "react-native";
import Colors from "@/constants/colors";

interface CardLayout {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface HomeMapSectionProps {
  onCardLayout: (layout: CardLayout) => void;
  rootRef: React.RefObject<View | null>;
}

export const HomeMapSection: React.FC<HomeMapSectionProps> = ({ onCardLayout, rootRef }) => {
  const cardRef = useRef<View>(null);
  const reportedRef = useRef(false);

  // Pixel-accurate refinement: measure the placeholder relative to the root
  // view so the absolutely-positioned map overlay lands exactly on top of it
  // (corrects any Android status-bar offset). This is best-effort: under the
  // New Architecture (Fabric) measureLayout's native callbacks can silently
  // never fire, so we never DEPEND on it for the map to mount.
  const refineRootRelative = () => {
    const card = cardRef.current;
    const root = rootRef.current;
    if (!card || !root) return;
    const rootNode = findNodeHandle(root);
    if (!rootNode) return;
    card.measureLayout(
      rootNode,
      (x, y, width, height) => {
        if (width > 0 && height > 0) {
          reportedRef.current = true;
          onCardLayout({ top: y, left: x, width, height });
        }
      },
      () => {
        // measureLayout failed — the onLayout fallback below already mounted
        // the map, so there is nothing more to do here.
      },
    );
  };

  const handleLayout = (e: LayoutChangeEvent) => {
    // GUARANTEED mount path. onLayout always fires when the placeholder is laid
    // out with a real size, on BOTH the old and new (Fabric) architectures.
    // At scroll offset 0 its coordinates already match the placeholder's
    // root-relative position, so we can mount the map immediately from them.
    // Relying solely on measureLayout (whose callbacks silently never fire on
    // Fabric) previously left compactLayout null forever -> InteractiveMap was
    // never mounted -> permanently black map on EAS/OTA builds.
    const { x, y, width, height } = e.nativeEvent.layout;
    if (!reportedRef.current && width > 0 && height > 0) {
      reportedRef.current = true;
      onCardLayout({ top: y, left: x, width, height });
    }
    refineRootRelative();
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
