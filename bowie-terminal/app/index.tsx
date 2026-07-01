import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  sendMessage,
  SessionExpiredError,
  registerPushToken,
  registerBowieTerminalToken,
} from "../lib/bowie-client";
import {
  clearSession,
  getOrCreateDeviceId,
  getRole,
  getSavedTheme,
  getToken,
  saveTheme,
} from "../lib/session";
import {
  addReplyListener,
  consumePendingReply,
  setupNotifications,
  showPersistentNotification,
} from "../lib/notifications";
import {
  isThemeName,
  personaColor,
  personaLabel,
  THEMES,
  type PersonaId,
  type ThemeName,
} from "../constants/theme";

const MONO = Platform.select({ ios: "Menlo", default: "monospace" });

// Messaggio di benvenuto fisso (hardcoded, non generato dall'AI).
const WELCOME = `Son nato nel fuoco
Son cresciuto giocando con l'acqua

Davanti a me si son prostrati
Dei, Sovrani, Principi e servi

M'ha accarezzato il vento.
Parlami, sono qui per te.`;

interface Line {
  id: string;
  kind: "user" | "ai" | "system";
  persona?: PersonaId;
  text: string;
}

export default function TerminalScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const [phase, setPhase] = useState<"boot" | "ready">("boot");
  const [themeName, setThemeName] = useState<ThemeName>("attuale");
  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);

  const theme = THEMES[themeName];

  const tokenRef = useRef<string | null>(null);
  const roleRef = useRef<string>("user");
  const idCounter = useRef(0);
  const historyRef = useRef<{ role: "user" | "assistant"; content: string }[]>([]);
  const intervalsRef = useRef<ReturnType<typeof setInterval>[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const welcomeStartedRef = useRef(false);
  // Task #5272 — ref sempre aggiornato a submitText: la quick-reply della notifica
  // (listener + cold-start) invia inline SENZA rieseguire il bootstrap.
  const submitTextRef = useRef<(raw: string) => void>(() => {});

  const cursorOpacity = useRef(new Animated.Value(1)).current;

  // ---- line helpers ----
  const pushLine = useCallback((p: Omit<Line, "id">): string => {
    const id = `l${++idCounter.current}`;
    setLines((prev) => [...prev, { id, ...p }]);
    return id;
  }, []);

  const setLineText = useCallback((id: string, text: string) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, text } : l)));
  }, []);

  const appendLineText = useCallback((id: string, chunk: string) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, text: l.text + chunk } : l)));
  }, []);

  const setLinePersona = useCallback((id: string, persona: PersonaId) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, persona } : l)));
  }, []);

  // ---- cursor blink ----
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(cursorOpacity, { toValue: 0, duration: 530, useNativeDriver: true }),
        Animated.timing(cursorOpacity, { toValue: 1, duration: 530, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [cursorOpacity]);

  // ---- welcome stream (char by char) ----
  const startWelcome = useCallback(() => {
    if (welcomeStartedRef.current) return;
    welcomeStartedRef.current = true;
    pushLine({ kind: "system", text: "BOWIE TERMINAL v1.0" });
    pushLine({ kind: "system", text: "connecting · biker-link.replit.app · ok" });
    pushLine({ kind: "system", text: "────────────────────────────────────────" });
    const aiId = pushLine({ kind: "ai", persona: "bowie", text: "" });
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      setLineText(aiId, WELCOME.slice(0, i));
      if (i >= WELCOME.length) clearInterval(timer);
    }, 22);
    intervalsRef.current.push(timer);
  }, [pushLine, setLineText]);

  // ---- notifications (best-effort, Android) ----
  const initNotifications = useCallback(async (token: string) => {
    if (Platform.OS !== "android") return;
    try {
      const pushToken = await setupNotifications();
      if (pushToken) {
        await registerPushToken(pushToken, token);
        // Task #5228 — registra il device nel registro per-dispositivo (monitor admin).
        const deviceId = await getOrCreateDeviceId();
        await registerBowieTerminalToken(deviceId, pushToken, token);
      }
      await showPersistentNotification();
    } catch {
      /* notifiche best-effort */
    }
  }, []);

  // ---- bootstrap ----
  useEffect(() => {
    let replyListener: { remove: () => void } | null = null;
    (async () => {
      const tok = await getToken();
      if (!tok) {
        router.replace("/login");
        return;
      }
      tokenRef.current = tok;
      roleRef.current = (await getRole()) ?? "user";
      const saved = await getSavedTheme();
      if (saved && isThemeName(saved)) setThemeName(saved);
      setPhase("ready");
      startWelcome();
      // Task #5272 — quick-reply notifica: app viva → listener; app killata →
      // riaperta dall'OS (opensAppToForeground) → recupero cold-start. In entrambi
      // i casi il testo viene inviato inline via submitTextRef (nessun input perso).
      replyListener = addReplyListener((text) => submitTextRef.current(text));
      void initNotifications(tok);
      const pending = await consumePendingReply();
      if (pending) submitTextRef.current(pending);
    })();

    return () => {
      intervalsRef.current.forEach(clearInterval);
      abortRef.current?.abort();
      replyListener?.remove();
    };
  }, [initNotifications, startWelcome]);

  // ---- session expiry ----
  const handleSessionExpired = useCallback(async () => {
    pushLine({ kind: "system", text: "SESSION EXPIRED — reconnecting..." });
    await clearSession();
    setTimeout(() => router.replace("/login"), 1200);
  }, [pushLine]);

  // ---- local commands ----
  const handleCommand = useCallback(
    (raw: string): boolean => {
      const cmd = raw.replace(/^›?\s*/, "").trim().toLowerCase();
      if (cmd === "logout") {
        void (async () => {
          await clearSession();
          router.replace("/login");
        })();
        return true;
      }
      if (cmd === "clear") {
        setLines([]);
        return true;
      }
      if (cmd === "help") {
        pushLine({
          kind: "system",
          text: "comandi: logout · clear · help · theme <attuale|asfalto|velocita|rotta>",
        });
        return true;
      }
      if (cmd.startsWith("theme")) {
        const name = cmd.split(/\s+/)[1] ?? "";
        if (isThemeName(name)) {
          setThemeName(name);
          void saveTheme(name);
          pushLine({ kind: "system", text: `tema → ${name}` });
        } else {
          pushLine({ kind: "system", text: "temi: attuale · asfalto · velocita · rotta" });
        }
        return true;
      }
      return false;
    },
    [pushLine],
  );

  // ---- send ----
  const submitText = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text || streaming) return;
    setInput("");
    if (handleCommand(text)) return;

    pushLine({ kind: "user", text });
    const aiId = pushLine({ kind: "ai", persona: "bowie", text: "" });
    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const history = historyRef.current.slice(-8);

    try {
      await sendMessage(
        text,
        tokenRef.current ?? "",
        {
          onPersona: (p) => setLinePersona(aiId, p),
          onDelta: (d) => appendLineText(aiId, d),
          onDone: (done) => {
            if (done.persona) setLinePersona(aiId, done.persona);
            setLineText(aiId, done.text);
            historyRef.current.push(
              { role: "user", content: text },
              { role: "assistant", content: done.text },
            );
          },
          onError: (e) => appendLineText(aiId, `\n! ${e.message}`),
        },
        { history, signal: controller.signal },
      );
    } catch (e) {
      if (e instanceof SessionExpiredError) {
        await handleSessionExpired();
        return;
      }
      appendLineText(aiId, `\n! ${(e as Error).message}`);
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [
    appendLineText,
    handleCommand,
    handleSessionExpired,
    pushLine,
    setLinePersona,
    setLineText,
    streaming,
  ]);

  const onSubmit = useCallback(() => {
    void submitText(input);
  }, [submitText, input]);

  // Mantiene il ref allineato all'ultima submitText per la quick-reply notifica.
  useEffect(() => {
    submitTextRef.current = (raw: string) => void submitText(raw);
  }, [submitText]);

  // ---- render ----
  const reversed = useMemo(() => [...lines].reverse(), [lines]);

  const renderItem = useCallback(
    ({ item }: { item: Line }) => {
      if (item.kind === "system") {
        return <Text style={[styles.line, { color: theme.textSecondary }]}>{item.text}</Text>;
      }
      if (item.kind === "user") {
        return (
          <Text style={[styles.line, { color: theme.text }]}>
            <Text style={{ color: theme.bowie, fontWeight: "bold" }}>› </Text>
            {item.text}
          </Text>
        );
      }
      const persona = item.persona ?? "bowie";
      return (
        <Text style={[styles.line, { color: theme.text }]}>
          <Text style={{ color: personaColor(theme, persona), fontWeight: "bold" }}>
            {personaLabel(persona)} ›{" "}
          </Text>
          {item.text}
        </Text>
      );
    },
    [theme],
  );

  if (phase === "boot") {
    return <View style={[styles.root, { backgroundColor: theme.background }]} />;
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: theme.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <FlatList
        style={[styles.list, { paddingTop: topInset + 8 }]}
        contentContainerStyle={styles.listContent}
        data={reversed}
        keyExtractor={(l) => l.id}
        renderItem={renderItem}
        inverted
        scrollEnabled={reversed.length > 0}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      />

      <View
        style={[
          styles.inputBar,
          { borderTopColor: theme.border, paddingBottom: bottomInset + 8 },
        ]}
      >
        <Text style={[styles.prompt, { color: theme.bowie }]}>› </Text>
        <TextInput
          value={input}
          onChangeText={setInput}
          onSubmitEditing={onSubmit}
          editable={!streaming}
          blurOnSubmit={false}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.input, { color: theme.text }]}
          placeholder={streaming ? "..." : ""}
          placeholderTextColor={theme.textSecondary}
          returnKeyType="send"
          testID="terminal-input"
        />
        <Animated.Text style={[styles.cursor, { color: theme.bowie, opacity: cursorOpacity }]}>
          █
        </Animated.Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { flex: 1, paddingHorizontal: 14 },
  listContent: { paddingVertical: 8 },
  line: { fontFamily: MONO, fontSize: 13, lineHeight: 19, marginVertical: 1 },
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  prompt: { fontFamily: MONO, fontSize: 14, fontWeight: "bold" },
  input: { flex: 1, fontFamily: MONO, fontSize: 14, paddingVertical: 2 },
  cursor: { fontFamily: MONO, fontSize: 14 },
});
