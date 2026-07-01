import { Modal, Pressable, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface ImageViewerModalProps {
  uri: string | null;
  onClose: () => void;
}

export function ImageViewerModal({ uri, onClose }: ImageViewerModalProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={!!uri}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        {uri ? (
          <Image
            source={{ uri }}
            style={styles.image}
            contentFit="contain"
            transition={100}
          />
        ) : null}
        <Pressable
          style={[styles.closeButton, { top: insets.top + 12 }]}
          onPress={onClose}
          hitSlop={12}
        >
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  closeButton: {
    position: "absolute",
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
});
