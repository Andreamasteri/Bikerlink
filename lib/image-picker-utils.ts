import * as ImagePicker from "expo-image-picker";
import { Alert, Platform, ActionSheetIOS } from "react-native";

export interface BulkImageAsset {
  uri: string;
  fileName: string;
  mimeType?: string;
  fileSize?: number;
}

const MAX_BULK_FILE_SIZE = 5 * 1024 * 1024;

export async function pickMultipleImages(
  options: { quality?: number; selectionLimit?: number } = {}
): Promise<{ assets: BulkImageAsset[]; skipped: number }> {
  const { quality = 0.8, selectionLimit = 50 } = options;
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsMultipleSelection: true,
    allowsEditing: false,
    quality,
    selectionLimit,
  });
  if (!result.canceled && result.assets.length > 0) {
    const all = result.assets.map((a, i) => ({
      uri: a.uri,
      fileName: a.fileName || `image_${i + 1}.jpg`,
      mimeType: a.mimeType,
      fileSize: a.fileSize,
    }));
    const valid = all.filter((a) => !a.fileSize || a.fileSize <= MAX_BULK_FILE_SIZE);
    const skipped = all.length - valid.length;
    return { assets: valid, skipped };
  }
  return { assets: [], skipped: 0 };
}

let cameraPermissionAsked = false;

async function ensureCameraPermission(): Promise<boolean> {
  const { status: currentStatus } = await ImagePicker.getCameraPermissionsAsync();
  if (currentStatus === "granted") return true;

  if (cameraPermissionAsked) {
    Alert.alert(
      "Permesso fotocamera",
      "Per scattare foto, abilita l'accesso alla fotocamera nelle impostazioni del dispositivo.",
      [{ text: "OK" }]
    );
    return false;
  }

  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  cameraPermissionAsked = true;

  if (status === "granted") return true;

  Alert.alert(
    "Permesso fotocamera",
    "Per scattare foto, abilita l'accesso alla fotocamera nelle impostazioni del dispositivo.",
    [{ text: "OK" }]
  );
  return false;
}

export interface PickImageOptions {
  aspect?: [number, number];
  quality?: number;
  allowsEditing?: boolean;
}

export function showImagePickerMenu(
  onResult: (uri: string) => void,
  options: PickImageOptions = {}
) {
  const { aspect, quality = 0.8, allowsEditing = true } = options;

  const launchGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing,
      ...(aspect ? { aspect } : {}),
      quality,
    });
    if (!result.canceled && result.assets[0]) {
      onResult(result.assets[0].uri);
    }
  };

  const launchCamera = async () => {
    const hasPermission = await ensureCameraPermission();
    if (!hasPermission) return;

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing,
      ...(aspect ? { aspect } : {}),
      quality,
    });
    if (!result.canceled && result.assets[0]) {
      onResult(result.assets[0].uri);
    }
  };

  if (Platform.OS === "ios") {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: ["Annulla", "Galleria", "Fotocamera"],
        cancelButtonIndex: 0,
      },
      (buttonIndex) => {
        if (buttonIndex === 1) launchGallery();
        if (buttonIndex === 2) launchCamera();
      }
    );
    return;
  }

  Alert.alert("Scegli foto", "Da dove vuoi caricare la foto?", [
    { text: "Annulla", style: "cancel" },
    { text: "Galleria", onPress: launchGallery },
    { text: "Fotocamera", onPress: launchCamera },
  ]);
}
