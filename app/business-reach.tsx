import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";

const TOKEN_KEY = "@bikerlink/business_token";

const ACTION_LABELS: Record<string, string> = {
  directions: "Indicazioni",
  call: "Chiamate",
  whatsapp: "WhatsApp",
  event: "Evento / Promo",
  website: "Sito web",
};

const MONTHS_IT = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

interface SelfReport {
  businessId: string;
  name: string;
  type: string;
  periodMonth: string;
  qualifiedPassages: number;
  uniqueRiders: number;
  radiusM: number;
  computedAt: string | null;
  clicks: number;
  clicksByAction: Record<string, number>;
  availableMonths: string[];
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonth(m: string): string {
  const [y, mm] = m.split("-");
  const idx = Number(mm) - 1;
  if (idx < 0 || idx > 11) return m;
  return `${MONTHS_IT[idx]} ${y}`;
}

export default function BusinessReach() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ token?: string }>();
  const isWeb = Platform.OS === "web";
  const topInset = isWeb ? Math.max(insets.top, 67) : insets.top;
  const bottomInset = isWeb ? Math.max(insets.bottom, 34) : insets.bottom;

  const [token, setToken] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [month, setMonth] = useState<string>(currentMonth());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const fromParam = typeof params.token === "string" ? params.token.trim() : "";
      if (fromParam) {
        if (active) {
          setToken(fromParam);
          await AsyncStorage.setItem(TOKEN_KEY, fromParam).catch(() => {});
        }
      } else {
        const stored = await AsyncStorage.getItem(TOKEN_KEY).catch(() => null);
        if (active && stored) setToken(stored);
      }
      if (active) setReady(true);
    })();
    return () => { active = false; };
  }, [params.token]);

  const { data, isLoading, isError, error, refetch } = useQuery<SelfReport>({
    queryKey: ["/api/businesses/reach", token, month],
    enabled: !!token,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/businesses/reach/${token}?month=${month}`);
      return res.json();
    },
    retry: false,
  });

  const handleAccess = useCallback(async () => {
    const t = tokenInput.trim();
    if (!t) return;
    setToken(t);
    await AsyncStorage.setItem(TOKEN_KEY, t).catch(() => {});
  }, [tokenInput]);

  const handleLogout = useCallback(async () => {
    setToken(null);
    setTokenInput("");
    setMonth(currentMonth());
    await AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
  }, []);

  if (!ready) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  // ── Token entry ────────────────────────────────────────────────────────────
  if (!token) {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <ScrollView contentContainerStyle={styles.entryContent} keyboardShouldPersistTaps="handled">
          <View style={styles.logoCircle}>
            <MaterialIcons name="insights" size={34} color="#fff" />
          </View>
          <Text style={styles.entryTitle}>I tuoi numeri</Text>
          <Text style={styles.entrySubtitle}>
            Inserisci il codice di accesso che ti ha fornito BikerLink per consultare
            i numeri aggregati del tuo locale o concessionaria.
          </Text>
          <TextInput
            style={styles.codeInput}
            placeholder="Codice di accesso"
            placeholderTextColor={Colors.textSecondary}
            value={tokenInput}
            onChangeText={setTokenInput}
            autoCapitalize="none"
            autoCorrect={false}
            testID="business-token-input"
          />
          <TouchableOpacity
            style={[styles.primaryBtn, !tokenInput.trim() && styles.btnDisabled]}
            disabled={!tokenInput.trim()}
            onPress={handleAccess}
            testID="business-token-submit"
          >
            <Text style={styles.primaryBtnText}>Accedi</Text>
          </TouchableOpacity>
          <Text style={styles.privacyNote}>
            Vengono mostrati solo dati aggregati. Nessuna informazione sui singoli
            motociclisti è mai visibile.
          </Text>
        </ScrollView>
      </View>
    );
  }

  // ── Report view ──────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerName} numberOfLines={1}>{data?.name ?? "—"}</Text>
          <Text style={styles.headerType}>
            {data?.type === "concessionaria" ? "Concessionaria" : "Locale"}
          </Text>
        </View>
        <TouchableOpacity onPress={handleLogout} hitSlop={10} testID="business-logout">
          <MaterialIcons name="logout" size={22} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {(data?.availableMonths?.length ?? 0) > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.monthsRow}
        >
          {(data?.availableMonths ?? []).map((m) => (
            <TouchableOpacity
              key={m}
              style={[styles.monthChip, m === month && styles.monthChipActive]}
              onPress={() => setMonth(m)}
            >
              <Text style={[styles.monthChipText, m === month && styles.monthChipTextActive]}>
                {formatMonth(m)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: bottomInset + 24 }}
      >
        {isLoading ? (
          <View style={styles.center}><ActivityIndicator color={Colors.accent} /></View>
        ) : isError ? (
          <View style={styles.errorBox}>
            <MaterialIcons name="error-outline" size={28} color={Colors.error} />
            <Text style={styles.errorText}>
              {(error instanceof Error ? error.message : "Codice non valido")}
            </Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()}>
              <Text style={styles.retryText}>Riprova</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleLogout} hitSlop={8}>
              <Text style={styles.changeCodeText}>Cambia codice</Text>
            </TouchableOpacity>
          </View>
        ) : data ? (
          <>
            <Text style={styles.monthLabel}>{formatMonth(data.periodMonth)}</Text>

            <View style={styles.statsRow}>
              <View style={styles.bigStat}>
                <Text style={styles.bigStatNum}>{data.qualifiedPassages}</Text>
                <Text style={styles.bigStatLabel}>Passaggi qualificati</Text>
              </View>
              <View style={styles.bigStat}>
                <Text style={styles.bigStatNum}>{data.clicks}</Text>
                <Text style={styles.bigStatLabel}>Interazioni</Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Interazioni per azione</Text>
            {Object.keys(data.clicksByAction).length === 0 ? (
              <Text style={styles.emptyText}>Nessuna interazione registrata in questo mese.</Text>
            ) : (
              <View style={styles.breakdownCard}>
                {Object.entries(data.clicksByAction)
                  .sort((a, b) => b[1] - a[1])
                  .map(([action, count]) => (
                    <View key={action} style={styles.breakdownRow}>
                      <Text style={styles.breakdownLabel}>{ACTION_LABELS[action] ?? action}</Text>
                      <Text style={styles.breakdownValue}>{count}</Text>
                    </View>
                  ))}
              </View>
            )}

            <Text style={styles.privacyNote}>
              I "passaggi qualificati" stimano quanti motociclisti sono transitati
              vicino alla tua attività a bassa velocità. Tutti i dati sono aggregati:
              nessuna informazione sui singoli motociclisti è mai mostrata.
            </Text>
            {data.computedAt ? (
              <Text style={styles.computedText}>
                Passaggi aggiornati al {new Date(data.computedAt).toLocaleDateString("it-IT")}
              </Text>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { alignItems: "center", justifyContent: "center", paddingVertical: 40 },
  entryContent: { padding: 24, alignItems: "center", paddingTop: 40 },
  logoCircle: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.accent,
    alignItems: "center", justifyContent: "center", marginBottom: 20,
  },
  entryTitle: { fontFamily: "Inter_700Bold", fontSize: 24, color: Colors.text, marginBottom: 8 },
  entrySubtitle: {
    fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary,
    textAlign: "center", lineHeight: 20, marginBottom: 24,
  },
  codeInput: {
    width: "100%", backgroundColor: Colors.surface, borderRadius: 12, padding: 14,
    fontFamily: "Inter_400Regular", fontSize: 15, color: Colors.text,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 14,
  },
  primaryBtn: {
    width: "100%", backgroundColor: Colors.accent, borderRadius: 12, padding: 16,
    alignItems: "center",
  },
  primaryBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.background },
  btnDisabled: { opacity: 0.5 },
  privacyNote: {
    fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary,
    textAlign: "center", lineHeight: 17, marginTop: 24,
  },
  header: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16,
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 12,
  },
  headerName: { fontFamily: "Inter_700Bold", fontSize: 18, color: Colors.text },
  headerType: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  monthsRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  monthChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  monthChipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  monthChipText: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.text },
  monthChipTextActive: { color: Colors.background },
  monthLabel: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.text, marginBottom: 14 },
  statsRow: { flexDirection: "row", gap: 12, marginBottom: 24 },
  bigStat: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: 16, padding: 18,
    alignItems: "center", borderWidth: 1, borderColor: Colors.border,
  },
  bigStatNum: { fontFamily: "Inter_700Bold", fontSize: 34, color: Colors.accent },
  bigStatLabel: {
    fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary,
    marginTop: 6, textAlign: "center",
  },
  sectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: Colors.text, marginBottom: 10 },
  breakdownCard: {
    backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 16,
  },
  breakdownRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
  },
  breakdownLabel: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text },
  breakdownValue: { fontFamily: "Inter_700Bold", fontSize: 16, color: Colors.text },
  emptyText: {
    fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary,
    paddingVertical: 12,
  },
  computedText: {
    fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary,
    textAlign: "center", marginTop: 10,
  },
  errorBox: { alignItems: "center", gap: 12, paddingVertical: 40 },
  errorText: { fontFamily: "Inter_500Medium", fontSize: 14, color: Colors.text, textAlign: "center" },
  retryBtn: {
    backgroundColor: Colors.accent, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12,
  },
  retryText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.background },
  changeCodeText: {
    fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.textSecondary,
    textDecorationLine: "underline", marginTop: 4,
  },
});
