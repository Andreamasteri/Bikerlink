/**
 * CORRECT PATTERN FOR UPLOADING FILES VIA FORMDATA ON EXPO (native + web)
 * =========================================================================
 * ❌ WRONG — crashes on Expo's WinterCG fetch (convertFormData.ts):
 *
 *   formData.append("image", { uri, name: filename, type: mimeType } as any);
 *
 *   The `{uri, name, type}` object literal is not a real Blob. TypeScript
 *   accepts it with `as any`, but at runtime Expo's fetch serialiser rejects
 *   it and throws.
 *
 * ✅ CORRECT — use appendFileToForm() exported from this module:
 *
 *   await appendFileToForm(formData, "image", uri, "image/jpeg", filename);
 *
 *   Internally it calls uriToBlob(), which returns:
 *     • native → expo-file-system File (satisfies the `bytes` branch)
 *     • web    → standard Blob via fetch().blob()
 *
 * Never bypass this helper. Never use `{uri, name, type} as any`.
 */

import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { requireOptionalNativeModule } from "expo-modules-core";
import { Alert, Platform, ActionSheetIOS } from "react-native";
import { File as EFSFile } from "expo-file-system";
import { sendStartupBeacon } from "@/lib/startup-beacon";
import { markAsyncError } from "@/lib/crash-logger";

/**
 * expo-image-manipulator espone solo un wrapper JS attorno al modulo nativo
 * `ExpoImageManipulator`. Se quel modulo nativo NON è presente nel binario
 * installato (es. l'APK è stato compilato prima che la dipendenza venisse
 * aggiunta), QUALSIASI accesso a `ImageManipulator.manipulateAsync` chiama
 * internamente `requireNativeModule('ExpoImageManipulator')`, che LANCIA
 * ("Cannot find native module 'ExpoImageManipulator'"). Quell'errore viene
 * intercettato dal global error handler → ErrorBoundary → crash percepito,
 * anche dentro un try/catch locale.
 *
 * Un aggiornamento OTA spedisce solo JS e NON può aggiungere il modulo nativo
 * al binario già installato. Quindi qui rileviamo la disponibilità del modulo
 * SENZA lanciare (`requireOptionalNativeModule` ritorna `null` se assente) e
 * saltiamo del tutto l'ottimizzazione quando non c'è: l'upload usa l'immagine
 * già compressa dal picker (`quality`). Quando un nuovo build nativo includerà
 * il modulo, l'ottimizzazione si riattiverà automaticamente.
 */
const hasImageManipulatorNativeModule =
  Platform.OS === "web" ||
  requireOptionalNativeModule("ExpoImageManipulator") != null;

// One-shot: il log `native_module_missing` va emesso una sola volta per sessione
// per non floodare il crash-logger ad ogni upload quando il modulo è assente.
let nativeModuleMissingLogged = false;

export interface BulkImageAsset {
  uri: string;
  fileName: string;
  mimeType?: string;
  fileSize?: number;
}

const MAX_BULK_FILE_SIZE = 5 * 1024 * 1024;

/**
 * Converts a local image URI to a Blob-compatible object accepted by Expo's
 * WinterCG fetch serializer (convertFormData.ts).
 *
 * On native the expo-file-system File class satisfies the `'bytes' in entry`
 * branch; on web a standard Blob is returned via fetch().blob().
 *
 * Usage: formData.append("image", await uriToBlob(uri, mimeType), filename)
 */
export async function uriToBlob(uri: string, _mimeType: string): Promise<Blob> {
  if (Platform.OS === "web") {
    const response = await fetch(uri);
    return response.blob();
  }
  // expo-file-system File implements Blob with .bytes() — satisfies the
  // `'bytes' in entry` branch in Expo's WinterCG convertFormData.ts
  return new EFSFile(uri) as unknown as Blob;
}

/**
 * Safely append a file (image, PDF, etc.) to a FormData instance.
 *
 * Always use this instead of `formData.append(key, {uri, name, type} as any)`.
 * The object-literal pattern is not a real Blob and crashes on Expo's
 * WinterCG fetch serialiser at runtime even though TypeScript accepts it.
 */
export async function appendFileToForm(
  formData: FormData,
  key: string,
  uri: string,
  mimeType: string,
  filename: string
): Promise<void> {
  const blob = await uriToBlob(uri, mimeType);
  formData.append(key, blob, filename);
}

/**
 * Ridimensiona e ricomprime un'immagine SUL DEVICE prima dell'upload.
 *
 * Porta il payload da ~4 MB a ~100–200 KB: max 800px sul lato più lungo,
 * JPEG quality 0.6. Riduce drasticamente il tempo di upload percepito.
 *
 * Funziona su native e web (expo-image-manipulator ha supporto web).
 * In caso di errore restituisce l'URI originale come fallback.
 */
export async function optimizeImageForUpload(
  uri: string,
  dimensions?: { width?: number; height?: number }
): Promise<string> {
  if (!hasImageManipulatorNativeModule) {
    // Modulo nativo assente nel binario installato: non possiamo (e non
    // dobbiamo) toccare ImageManipulator, altrimenti lancia e crasha l'app.
    // L'immagine del picker è già compressa via `quality`: la usiamo così.
    sendStartupBeacon("img_manipulate_skipped_no_native");
    // Log diagnostico (una sola volta) sul crash-logger: il modulo nativo è
    // assente nell'APK installato (build precedente all'aggiunta della dep).
    // Serve a distinguere il degrado controllato da un crash silenzioso.
    if (!nativeModuleMissingLogged) {
      nativeModuleMissingLogged = true;
      markAsyncError(
        "native_module_missing",
        new Error("ExpoImageManipulator non presente nel binario installato")
      ).catch(() => {});
    }
    return uri;
  }
  try {
    const w = dimensions?.width ?? 0;
    const h = dimensions?.height ?? 0;
    const resize = h > w && h > 0 ? { height: 800 } : { width: 800 };
    sendStartupBeacon("img_manipulate_start", { w, h });
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize }],
      { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }
    );
    sendStartupBeacon("img_manipulate_done");
    return result.uri;
  } catch (e) {
    sendStartupBeacon("img_manipulate_error", { error: String(e).slice(0, 200) });
    return uri;
  }
}

export async function pickMultipleImages(
  options: { quality?: number; selectionLimit?: number } = {}
): Promise<{ assets: BulkImageAsset[]; skipped: number }> {
  const { quality = 0.8, selectionLimit = 50 } = options;
  sendStartupBeacon("img_multi_picker_launch");
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsMultipleSelection: true,
    allowsEditing: false,
    quality,
    selectionLimit,
  });
  sendStartupBeacon("img_multi_picker_returned", {
    canceled: result.canceled,
    count: result.assets?.length ?? 0,
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
  const { aspect, quality = 0.5, allowsEditing = true } = options;
  sendStartupBeacon("img_picker_menu_open", { platform: Platform.OS });

  const launchGallery = async () => {
    sendStartupBeacon("img_gallery_launch");
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing,
      ...(aspect ? { aspect } : {}),
      quality,
      base64: false,
    });
    sendStartupBeacon("img_gallery_returned", { canceled: result.canceled });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const optimized = await optimizeImageForUpload(asset.uri, {
        width: asset.width,
        height: asset.height,
      });
      onResult(optimized);
    }
  };

  const launchCamera = async () => {
    const hasPermission = await ensureCameraPermission();
    if (!hasPermission) return;

    sendStartupBeacon("img_camera_launch");
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing,
      ...(aspect ? { aspect } : {}),
      quality,
      base64: false,
    });
    sendStartupBeacon("img_camera_returned", { canceled: result.canceled });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const optimized = await optimizeImageForUpload(asset.uri, {
        width: asset.width,
        height: asset.height,
      });
      onResult(optimized);
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
