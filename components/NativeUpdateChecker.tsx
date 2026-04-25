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

interface PlatformVersionConfig {
  latestVersion: string;
  minVersion: string;
  storeUrl: string;
}

interface NativeVersionConfig {
  android: PlatformVersionConfig;
  ios: PlatformVersionConfig;
}

function compareSemver(a: string, b: string): number {
  const parse = (v: string) => v.split(".").map((n) => parseInt(n, 10) || 0);
  const [aMaj, aMin, aPatch] = parse(a);
  const [bMaj, bMin, bPatch] = parse(b);
  if (aMaj !== bMaj) return aMaj - bMaj;
  if (aMin !== bMin) return aMin - bMin;
  return aPatch - bPatch;
}

export default function NativeUpdateChecker() {
  const [visible, setVisible] = useState(false);
  const [isForced, setIsForced] = useState(false);
  const [storeUrl, setStoreUrl] = useState("");
  const checkedRef = useRef(false);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const timer = setTimeout(async () => {
      if (checkedRef.current) return;
      checkedRef.current = true;
      try {
        const url = new URL("/api/settings/native-version", getApiUrl()).toString();
        const res = await fetch(url);
        if (!res.ok) return;
        const config: NativeVersionConfig = await res.json();
        const platform: PlatformVersionConfig =
          Platform.OS === "android" ? config.android : config.ios;
        const installed = Constants.expoConfig?.version ?? "0.0.0";
        const { latestVersion, minVersion, storeUrl: sUrl } = platform;
        if (!sUrl || !sUrl.startsWith("https://")) return;
        if (compareSemver(installed, minVersion) < 0) {
          setStoreUrl(sUrl);
          setIsForced(true);
          setVisible(true);
        } else if (compareSemver(installed, latestVersion) < 0) {
          setStoreUrl(sUrl);
          setIsForced(false);
          setVisible(true);
        }
      } catch {
      }
    }, 2000);
    return () => clearTimeout(timer);
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
