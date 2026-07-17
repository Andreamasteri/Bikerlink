import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  type AppStateStatus,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { clearSession, getToken } from "../lib/session";
import { THEME } from "../constants/theme";

const DOMAIN = process.env.EXPO_PUBLIC_DOMAIN || "bikerlink.replit.app";
// Label visivo mostrato in UI: indica l'host del ThinkCentre, non il bridge BikerLink.
const TC_DISPLAY_HOST = process.env.EXPO_PUBLIC_TC_DISPLAY_HOST || "tc.biker-link.net";

// Rimuove i codici ANSI di escape (colori, movimento cursore, ecc.)
// per visualizzare testo plain in ScrollView.
function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1B\[[0-9;]*[A-Za-z]|\x1B[()][A-B0-2]|\x1B[=>]|\x07|\x0F|\x0E/g, "");
}

const MAX_OUTPUT_CHARS = 80_000; // tronca per evitare OOM su sessioni lunghe

export default function TerminalScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const [phase, setPhase] = useState<"boot" | "ready">("boot");
  const [connected, setConnected] = useState(false);
  const [output, setOutput] = useState("─── TC Terminal ───\r\n");
  const [input, setInput] = useState("");

  const tokenRef = useRef<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(1000);
  const mountedRef = useRef(true);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  // ── output helpers ──────────────────────────────────────────────────────────
  const appendOutput = useCallback((chunk: string) => {
    const clean = stripAnsi(chunk);
    setOutput((prev) => {
      const next = prev + clean;
      // Tronca dall'inizio se supera il limite.
      return next.length > MAX_OUTPUT_CHARS
        ? "…\n" + next.slice(next.length - MAX_OUTPUT_CHARS)
        : next;
    });
    // Auto-scroll verso il basso.
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 50);
  }, []);

  // ── WebSocket connect ───────────────────────────────────────────────────────
  // connectRef mantiene un puntatore stabile alla funzione connect aggiornata.
  // scheduleReconnect chiama connectRef.current per evitare la dipendenza
  // circolare connect → scheduleReconnect → connect (che causerebbe il warning
  // exhaustive-deps e ricreazione infinita delle callback).
  const connectRef = useRef<(token: string) => void>(() => {});

  const scheduleReconnect = useCallback(
    (token: string) => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      const delay = backoffRef.current;
      reconnectTimerRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        connectRef.current(token); // usa il ref per evitare la dep circolare
      }, delay);
      // Backoff esponenziale: 1s → 2s → 4s → … → max 30s.
      backoffRef.current = Math.min(delay * 2, 30_000);
    },
    [], // connectRef è un ref stabile, non va nelle deps
  );

  const connect = useCallback(
    (token: string) => {
      // Chiudi eventuale connessione precedente.
      if (wsRef.current) {
        try { wsRef.current.close(); } catch { /* ignore */ }
        wsRef.current = null;
      }

      const url = `wss://${DOMAIN}/api/ssh/terminal?token=${encodeURIComponent(token)}`;
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch (e) {
        appendOutput(`\r\n! Impossibile creare WebSocket: ${(e as Error).message}\r\n`);
        scheduleReconnect(token);
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) { ws.close(); return; }
        setConnected(true);
        backoffRef.current = 1000; // reset backoff
        appendOutput("\r\n─── Connesso ───\r\n");
      };

      ws.onmessage = (e: MessageEvent<string>) => {
        appendOutput(e.data);
      };

      ws.onclose = (e) => {
        if (!mountedRef.current) return;
        setConnected(false);
        const sec = backoffRef.current / 1000;
        appendOutput(`\r\n─── Disconnesso (${e.code}) — retry tra ${sec}s ───\r\n`);
        scheduleReconnect(token);
      };

      ws.onerror = () => {
        // onclose verrà chiamato subito dopo.
      };
    },
    [appendOutput, scheduleReconnect],
  );

  // Mantieni il ref aggiornato per le callback AppState.
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  // ── Bootstrap ───────────────────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    (async () => {
      const tok = await getToken();
      if (!tok) {
        router.replace("/login");
        return;
      }
      tokenRef.current = tok;
      setPhase("ready");
      connect(tok);
    })();

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        try { wsRef.current.close(); } catch { /* ignore */ }
        wsRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── AppState: riconnetti subito quando torna in foreground ──────────────────
  useEffect(() => {
    if (phase !== "ready") return;
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next !== "active") return;
      const tok = tokenRef.current;
      if (!tok) return;
      // Riconnetti solo se il WS è già chiuso o in errore.
      const ws = wsRef.current;
      if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        backoffRef.current = 1000; // reset backoff al foreground
        connectRef.current(tok);
      }
    });
    return () => sub.remove();
  }, [phase]);

  // ── Resize: invia al server quando il layout cambia ─────────────────────────
  const onTerminalLayout = useCallback(
    (e: { nativeEvent: { layout: { width: number; height: number } } }) => {
      const { width, height } = e.nativeEvent.layout;
      // Stima approssimativa: 7px per colonna, 14px per riga (monospace 14pt).
      const cols = Math.max(40, Math.floor(width / 7));
      const rows = Math.max(10, Math.floor(height / 14));
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "resize", cols, rows }));
      }
    },
    [],
  );

  // ── Input submit ─────────────────────────────────────────────────────────────
  const onSubmit = useCallback(() => {
    const text = input;
    setInput("");

    // Comandi locali.
    const cmd = text.trim().toLowerCase();
    if (cmd === "logout") {
      void (async () => {
        await clearSession();
        if (wsRef.current) { try { wsRef.current.close(); } catch { /* ok */ } }
        router.replace("/login");
      })();
      return;
    }
    if (cmd === "clear") {
      setOutput("");
      return;
    }

    // Invia al WS (con newline per simulare Enter).
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(text + "\n");
    } else {
      appendOutput(`\r\n! Non connesso — riprova tra qualche secondo.\r\n`);
    }
  }, [input, appendOutput]);

  // ── Render ───────────────────────────────────────────────────────────────────
  if (phase === "boot") {
    return <View style={[styles.root, { backgroundColor: THEME.background }]} />;
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: THEME.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Status bar */}
      <View
        style={[
          styles.statusBar,
          { paddingTop: topInset + 4, backgroundColor: THEME.surface, borderBottomColor: THEME.border },
        ]}
      >
        <View style={[styles.dot, { backgroundColor: connected ? THEME.connected : THEME.disconnected }]} />
        <Text style={[styles.statusText, { color: connected ? THEME.connected : THEME.disconnected }]}>
          {connected ? "CONNESSO" : "DISCONNESSO"}
        </Text>
        <Text style={[styles.domainText, { color: THEME.textSecondary }]}>
          {TC_DISPLAY_HOST}
        </Text>
        <Pressable
          onPress={() => {
            void (async () => {
              await clearSession();
              if (wsRef.current) { try { wsRef.current.close(); } catch { /* ok */ } }
              router.replace("/login");
            })();
          }}
          style={styles.logoutBtn}
          hitSlop={8}
        >
          <Ionicons name="log-out-outline" size={18} color={THEME.textSecondary} />
        </Pressable>
      </View>

      {/* Output terminale */}
      <ScrollView
        ref={scrollRef}
        style={styles.output}
        contentContainerStyle={styles.outputContent}
        onLayout={onTerminalLayout}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
      >
        <Text style={styles.outputText} selectable>
          {output}
        </Text>
      </ScrollView>

      {/* Input row */}
      <View
        style={[
          styles.inputRow,
          {
            paddingBottom: bottomInset + 8,
            backgroundColor: THEME.surface,
            borderTopColor: THEME.border,
          },
        ]}
      >
        <Text style={[styles.prompt, { color: THEME.accent }]}>{"$ "}</Text>
        <TextInput
          value={input}
          onChangeText={setInput}
          onSubmitEditing={onSubmit}
          style={[styles.textInput, { color: THEME.inputText, backgroundColor: THEME.input }]}
          placeholder="comando…"
          placeholderTextColor={THEME.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          returnKeyType="send"
          blurOnSubmit={false}
          multiline={false}
        />
        <Pressable
          onPress={onSubmit}
          style={({ pressed }) => [styles.sendBtn, { opacity: pressed ? 0.6 : 1 }]}
          hitSlop={6}
        >
          <Ionicons name="arrow-forward-circle" size={28} color={THEME.accent} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  statusBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingBottom: 8,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
    fontFamily: "monospace",
    letterSpacing: 1,
  },
  domainText: {
    flex: 1,
    fontSize: 11,
    fontFamily: "monospace",
  },
  logoutBtn: {
    padding: 4,
  },
  output: {
    flex: 1,
  },
  outputContent: {
    padding: 10,
    paddingBottom: 16,
  },
  outputText: {
    fontFamily: "monospace",
    fontSize: 13,
    lineHeight: 18,
    color: "#00FF41",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  prompt: {
    fontFamily: "monospace",
    fontSize: 16,
    fontWeight: "700",
  },
  textInput: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 14,
    fontFamily: "monospace",
  },
  sendBtn: {
    padding: 2,
  },
});
