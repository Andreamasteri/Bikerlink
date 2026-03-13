import * as ImagePicker from "expo-image-picker";
import { Alert, Platform, ActionSheetIOS } from "react-native";

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
  const { aspect = [1, 1], quality = 0.8, allowsEditing = true } = options;

  const launchGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing,
      aspect,
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
      aspect,
      quality,
    });
    if (!result.canceled && result.assets[0]) {
      onResult(result.assets[0].uri);
    }
  };

  if (Platform.OS === "web") {
    launchGallery();
    return;
  }

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
