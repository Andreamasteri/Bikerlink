import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Linking,
} from "react-native";
import Constants from "expo-constants";
import { getApiUrl } from "@/lib/query-client";
import Colors from "@/constants/colors";
import { compareSemver } from "@/lib/semver";

interface PlatformVersionConfig {
  latestVersion: string;
  minVersion: string;
  storeUrl: string;
}

interface NativeVersionConfig {
  android: PlatformVersionConfig;
  ios: PlatformVersionConfig;
}

type Listener = (state: { visible: boolean; isForced: boolean; storeUrl: string }) => void;

let listener: Listener | null = null;
let recheckRunner: (() => Promise<void>) | null = null;
let lastConfig: NativeVersionConfig | null = null;

function emit(state: { visible: boolean; isForced: boolean; storeUrl: string }) {
  if (listener) listener(state);
}

function pickPlatform(config: NativeVersionConfig): PlatformVersionConfig | null {
  if (Platform.OS === "android") return config.android;
  if (Platform.OS === "ios") return config.ios;
  return null;
}

function fallbackStoreUrl(): string {
  if (Platform.OS === "ios") return "https://apps.apple.com/app/bikerlink";
  return "https://play.google.com/store/apps/details?id=com.bikerlink.app";
}

export function triggerSoftPreview() {
  const url = lastConfig
    ? pickPlatform(lastConfig)?.storeUrl || fallbackStoreUrl()
    : fallbackStoreUrl();
  emit({ visible: true, isForced: false, storeUrl: url });
}

export function triggerForcedPreview() {
  const url = lastConfig
    ? pickPlatform(lastConfig)?.storeUrl || fallbackStoreUrl()
    : fallbackStoreUrl();
  emit({ visible: true, isForced: true, storeUrl: url });
}

export async function forceRecheck(): Promise<void> {
  if (recheckRunner) await recheckRunner();
}

export default function NativeUpdateChecker() {
  const [visible, setVisible] = useState(false);
  const [isForced, setIsForced] = useState(false);
  const [storeUrl, setStoreUrl] = useState("");
  const checkedRef = useRef(false);

  useEffect(() => {
    listener = (state) => {
      setVisible(state.visible);
      setIsForced(state.isForced);
      setStoreUrl(state.storeUrl);
    };
    return () => {
      listener = null;
    };
  }, []);

  useEffect(() => {
    const runCheck = async () => {
      try {
        const url = new URL("/api/settings/native-version", getApiUrl()).toString();
        const res = await fetch(url);
        if (!res.ok) return;
        const config: NativeVersionConfig = await res.json();
        lastConfig = config;
        const platform = pickPlatform(config);
        if (!platform) return;
        const installed = Constants.expoConfig?.version ?? "0.0.0";
        const { latestVersion, minVersion, storeUrl: sUrl } = platform;
        if (!sUrl || !sUrl.startsWith("https://")) return;
        if (compareSemver(installed, minVersion) < 0) {
          emit({ visible: true, isForced: true, storeUrl: sUrl });
        } else if (compareSemver(installed, latestVersion) < 0) {
          emit({ visible: true, isForced: false, storeUrl: sUrl });
        } else {
          emit({ visible: false, isForced: false, storeUrl: sUrl });
        }
      } catch {
      }
    };

    recheckRunner = async () => {
      checkedRef.current = false;
      await runCheck();
    };

    const timer = setTimeout(async () => {
      if (checkedRef.current) return;
      checkedRef.current = true;
      await runCheck();
    }, 2000);
    return () => {
      clearTimeout(timer);
      recheckRunner = null;
    };
  }, []);

  if (!visible) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        if (!isForced) setVisible(false);
      }}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Text style={styles.icon}>🏍️</Text>
          </View>
          <Text style={styles.title}>
            {isForced ? "Aggiornamento obbligatorio" : "Nuova versione disponibile"}
          </Text>
          <Text style={styles.body}>
            {isForced
              ? "La versione installata non è più supportata. Aggiorna l'app per continuare a usare BikerLink."
              : "È disponibile una nuova versione di BikerLink con miglioramenti e nuove funzionalità."}
          </Text>
          <TouchableOpacity
            style={styles.updateBtn}
            onPress={() => Linking.openURL(storeUrl).catch(() => {})}
            activeOpacity={0.85}
          >
            <Text style={styles.updateBtnText}>Aggiorna ora</Text>
          </TouchableOpacity>
          {!isForced && (
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => setVisible(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.closeBtnText}>Non adesso</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 28,
    width: "100%",
    maxWidth: 340,
    alignItems: "center",
  },
  iconWrap: {
    marginBottom: 14,
  },
  icon: {
    fontSize: 40,
  },
  title: {
    color: Colors.text,
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    marginBottom: 10,
    textAlign: "center",
  },
  body: {
    color: Colors.textMuted ?? "#888",
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 22,
  },
  updateBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignItems: "center",
    width: "100%",
    marginBottom: 10,
  },
  updateBtnText: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    letterSpacing: 0.3,
  },
  closeBtn: {
    paddingVertical: 10,
    alignItems: "center",
    width: "100%",
  },
  closeBtnText: {
    color: Colors.textMuted ?? "#888",
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
});
