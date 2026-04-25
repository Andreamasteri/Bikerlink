import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Linking,
  TextInput,
  Modal,
  FlatList,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import Colors from "@/constants/colors";
import { useFocusEffect } from "expo-router";

const STORAGE_KEY_SHEET = "@admin_last_import_sheet";

type StepStatus = "idle" | "loading" | "success" | "error";

interface DriveFolder {
  id: string;
  name: string;
}

interface DriveSheet {
  id: string;
  name: string;
  modifiedTime?: string;
  folderPath?: string;
}

const LANGS = [
  { code: "en", label: "EN — Inglese" },
  { code: "de", label: "DE — Tedesco" },
  { code: "es", label: "ES — Spagnolo" },
  { code: "fr", label: "FR — Francese" },
  { code: "tr", label: "TR — Turco" },
];

function extractFileId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  return trimmed;
}

function StepCard({
  stepNumber,
  title,
  description,
  status,
  onPress,
  buttonLabel,
  resultText,
  children,
  disabled,
}: {
  stepNumber: number;
  title: string;
  description: string;
  status: StepStatus;
  onPress: () => void;
  buttonLabel: string;
  resultText?: string;
  children?: React.ReactNode;
  disabled?: boolean;
}) {
  const isLoading = status === "loading";
  const isSuccess = status === "success";
  const isError = status === "error";

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.stepBadge, isSuccess && styles.stepBadgeSuccess, isError && styles.stepBadgeError]}>
          <Text style={styles.stepBadgeText}>{stepNumber}</Text>
        </View>
        <View style={styles.cardHeaderText}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardDesc}>{description}</Text>
        </View>
      </View>

      {children}

      <TouchableOpacity
        style={[styles.button, (isLoading || disabled) && styles.buttonDisabled]}
        onPress={onPress}
        disabled={isLoading || !!disabled}
        activeOpacity={0.7}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.buttonText}>{buttonLabel}</Text>
        )}
      </TouchableOpacity>

      {resultText ? (
        <View style={[styles.resultBox, isSuccess && styles.resultBoxSuccess, isError && styles.resultBoxError]}>
          <MaterialCommunityIcons
            name={isSuccess ? "check-circle-outline" : "alert-circle-outline"}
            size={16}
            color={isSuccess ? "#4CAF50" : "#F44336"}
          />
          <Text style={[styles.resultText, isSuccess ? styles.resultTextSuccess : styles.resultTextError]}>
            {resultText}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function LangCheckbox({
  lang,
  label,
  checked,
  disabled,
  onToggle,
}: {
  lang: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.checkbox, disabled && styles.checkboxDisabled]}
      onPress={disabled ? undefined : onToggle}
      activeOpacity={disabled ? 1 : 0.7}
    >
      <MaterialCommunityIcons
        name={checked ? "checkbox-marked" : "checkbox-blank-outline"}
        size={22}
        color={disabled ? Colors.textSecondary : checked ? Colors.accent : Colors.textSecondary}
      />
      <Text style={[styles.checkboxLabel, disabled && styles.checkboxLabelDisabled]}>{label}</Text>
    </TouchableOpacity>
  );
}

interface BrowseResult {
  folderName: string;
  folders: DriveFolder[];
  sheets: DriveSheet[];
  isSearch?: boolean;
  saEmail?: string;
}

interface BreadcrumbItem {
  id: string | null;
  name: string;
}

function DriveFileBrowser({
  visible,
  mode,
  title,
  selectedSheetId,
  onSelectFolder,
  onSelectSheet,
  onClose,
}: {
  visible: boolean;
  mode: "folder" | "sheet";
  title: string;
  selectedSheetId?: string | null;
  onSelectFolder?: (folder: DriveFolder) => void;
  onSelectSheet?: (sheet: DriveSheet) => void;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([{ id: null, name: "Drive" }]);
  const [browseData, setBrowseData] = useState<BrowseResult>({ folderName: "Drive", folders: [], sheets: [] });
  const [searchText, setSearchText] = useState("");
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<string | null>(null);
  const [refreshingCache, setRefreshingCache] = useState(false);
  const [cacheMsg, setCacheMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const cacheMsgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeq = useRef(0);

  function showCacheMsg(text: string, ok: boolean) {
    if (cacheMsgTimer.current) clearTimeout(cacheMsgTimer.current);
    setCacheMsg({ text, ok });
    cacheMsgTimer.current = setTimeout(() => setCacheMsg(null), 2500);
  }

  async function refreshFolderCache() {
    setRefreshingCache(true);
    try {
      const url = new URL("/api/admin/translations/folder-cache", getApiUrl());
      const resp = await fetch(url.toString(), { method: "DELETE", credentials: "include" });
      if (!resp.ok) {
        showCacheMsg("Errore durante l'aggiornamento", false);
        return;
      }
      const activeSearch = searchText.trim();
      await loadFolder(activeSearch ? null : currentFolderId, activeSearch || undefined);
      showCacheMsg("Nomi cartelle aggiornati", true);
    } catch {
      showCacheMsg("Errore durante l'aggiornamento", false);
    } finally {
      setRefreshingCache(false);
    }
  }

  async function handleCleanupExports() {
    setCleanupLoading(true);
    setCleanupResult(null);
    try {
      const url = new URL("/api/admin/drive/cleanup-exports", getApiUrl());
      const resp = await fetch(url.toString(), { method: "DELETE", credentials: "include" });
      const data = await resp.json();
      if (!resp.ok) {
        setCleanupResult(`Errore: ${data.message ?? "sconosciuto"}`);
      } else {
        const mb = data.freed > 0 ? ` (${(data.freed / 1024 / 1024).toFixed(1)} MB)` : "";
        setCleanupResult(`Eliminati ${data.deleted} file${mb}`);
      }
    } catch {
      setCleanupResult("Errore di rete");
    } finally {
      setCleanupLoading(false);
    }
  }

  useEffect(() => {
    if (visible) {
      setCurrentFolderId(null);
      setBreadcrumb([{ id: null, name: "Drive" }]);
      setSearchText("");
      setCleanupResult(null);
      loadFolder(null);
    }
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
      if (cacheMsgTimer.current) clearTimeout(cacheMsgTimer.current);
    };
  }, [visible]);

  async function loadFolder(folderId: string | null, q?: string) {
    setLoading(true);
    setError(null);
    const seq = ++requestSeq.current;
    try {
      const url = new URL("/api/admin/translations/browse", getApiUrl());
      if (q) {
        url.searchParams.set("q", q);
      } else if (folderId) {
        url.searchParams.set("folderId", folderId);
      }
      const resp = await fetch(url.toString(), { credentials: "include" });
      if (seq !== requestSeq.current) return;
      if (!resp.ok) throw new Error("Errore Drive");
      const data: BrowseResult = await resp.json();
      if (seq !== requestSeq.current) return;
      setBrowseData(data);
    } catch {
      if (seq !== requestSeq.current) return;
      setError("Impossibile caricare il contenuto di Drive");
    }
    if (seq === requestSeq.current) setLoading(false);
  }

  function onSearchChange(text: string) {
    setSearchText(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (text.trim().length === 0) {
      loadFolder(currentFolderId);
      return;
    }
    searchTimer.current = setTimeout(() => {
      loadFolder(null, text.trim());
    }, 400);
  }

  function navigateInto(folder: DriveFolder) {
    setCurrentFolderId(folder.id);
    setBreadcrumb((prev) => [...prev, { id: folder.id, name: folder.name }]);
    loadFolder(folder.id);
  }

  function navigateTo(item: BreadcrumbItem, index: number) {
    setCurrentFolderId(item.id);
    setBreadcrumb((prev) => prev.slice(0, index + 1));
    loadFolder(item.id);
  }

  const isSearchMode = !!searchText.trim() && !!browseData.isSearch;
  const hasItems = browseData.folders.length > 0 || (mode === "sheet" && browseData.sheets.length > 0);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <TouchableOpacity
                onPress={refreshFolderCache}
                disabled={refreshingCache}
                style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {refreshingCache ? (
                  <ActivityIndicator size="small" color={Colors.accent} />
                ) : (
                  <MaterialCommunityIcons name="refresh" size={18} color={Colors.accent} />
                )}
                <Text style={{ fontSize: 13, color: Colors.accent, fontWeight: "500" }}>
                  Aggiorna nomi
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialCommunityIcons name="close" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>
          {cacheMsg && (
            <View style={{
              backgroundColor: cacheMsg.ok ? "#1a4a2e" : "#4a1a1a",
              paddingHorizontal: 14,
              paddingVertical: 6,
              borderRadius: 6,
              marginHorizontal: 16,
              marginBottom: 6,
            }}>
              <Text style={{ fontSize: 13, color: cacheMsg.ok ? "#6fcf97" : "#eb5757" }}>
                {cacheMsg.text}
              </Text>
            </View>
          )}

          {!currentFolderId && browseData.saEmail && (
            <View style={{ backgroundColor: "#0d1f2d", borderRadius: 10, padding: 12, marginHorizontal: 16, marginBottom: 8, gap: 6 }}>
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: Colors.textSecondary }}>
                SERVICE ACCOUNT — condividi le cartelle con:
              </Text>
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: Colors.accent }} selectable>
                {browseData.saEmail}
              </Text>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary }}>
                Google Drive → tasto destro sulla cartella → Condividi
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
                <TouchableOpacity
                  onPress={handleCleanupExports}
                  disabled={cleanupLoading}
                  style={{
                    flexDirection: "row", alignItems: "center", gap: 4,
                    backgroundColor: "#4a1a1a", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5,
                  }}
                  activeOpacity={0.7}
                >
                  {cleanupLoading
                    ? <ActivityIndicator size="small" color="#eb5757" />
                    : <MaterialCommunityIcons name="trash-can-outline" size={14} color="#eb5757" />
                  }
                  <Text style={{ fontSize: 12, color: "#eb5757", fontFamily: "Inter_500Medium" }}>Pulisci export vecchi</Text>
                </TouchableOpacity>
                {cleanupResult && (
                  <Text style={{ fontSize: 11, color: Colors.textSecondary, fontFamily: "Inter_400Regular", flex: 1 }}>
                    {cleanupResult}
                  </Text>
                )}
              </View>
            </View>
          )}

          <View style={styles.searchRow}>
            <MaterialCommunityIcons name="magnify" size={18} color={Colors.textSecondary} style={{ marginRight: 6 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Cerca per nome..."
              placeholderTextColor={Colors.textSecondary}
              value={searchText}
              onChangeText={onSearchChange}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
              returnKeyType="search"
            />
            {searchText.length > 0 && (
              <TouchableOpacity onPress={() => onSearchChange("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialCommunityIcons name="close-circle" size={16} color={Colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          {searchText.trim().length === 0 && (
            <View style={styles.breadcrumbRow}>
              {breadcrumb.length > 1 && (
                <TouchableOpacity
                  style={styles.backButton}
                  onPress={() => navigateTo(breadcrumb[breadcrumb.length - 2], breadcrumb.length - 2)}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons name="arrow-left" size={16} color={Colors.accent} />
                  <Text style={styles.backButtonText}>Indietro</Text>
                </TouchableOpacity>
              )}
              <FlatList
                data={breadcrumb}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={(_, i) => String(i)}
                style={{ marginTop: breadcrumb.length > 1 ? 6 : 0 }}
                renderItem={({ item, index }) => {
                  const isLast = index === breadcrumb.length - 1;
                  return (
                    <View style={styles.breadcrumbItem}>
                      {index > 0 && (
                        <MaterialCommunityIcons name="chevron-right" size={14} color={Colors.textSecondary} />
                      )}
                      <TouchableOpacity
                        onPress={() => !isLast && navigateTo(item, index)}
                        disabled={isLast}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.breadcrumbText, isLast && styles.breadcrumbTextActive]}>
                          {item.name}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                }}
              />
            </View>
          )}

          {mode === "folder" && (
            <TouchableOpacity
              style={styles.selectHereButton}
              onPress={() => {
                const currentFolder: DriveFolder = {
                  id: currentFolderId ?? "root",
                  name: breadcrumb[breadcrumb.length - 1]?.name ?? "Drive",
                };
                onSelectFolder?.(currentFolder);
                onClose();
              }}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="folder-check" size={16} color="#fff" />
              <Text style={styles.selectHereButtonText}>Salva in questa cartella</Text>
            </TouchableOpacity>
          )}

          {loading ? (
            <View style={styles.modalLoading}>
              <ActivityIndicator color={Colors.accent} />
            </View>
          ) : error ? (
            <View style={styles.modalLoading}>
              <Text style={[styles.emptyText, { color: "#F44336" }]}>{error}</Text>
            </View>
          ) : !hasItems ? (
            <View style={styles.modalLoading}>
              <Text style={styles.emptyText}>
                {isSearchMode
                  ? "Nessun risultato trovato"
                  : !currentFolderId
                  ? "Nessuna cartella condivisa.\nCondividi una cartella con l'email SA qui sopra."
                  : mode === "folder"
                  ? "Nessuna sottocartella"
                  : "Nessun foglio o cartella qui"}
              </Text>
            </View>
          ) : (
            <FlatList
              data={[
                ...browseData.folders.map((f) => ({ type: "folder" as const, item: f })),
                ...(mode === "sheet"
                  ? browseData.sheets.map((s) => ({ type: "sheet" as const, item: s }))
                  : []),
              ]}
              keyExtractor={(row) => `${row.type}-${row.item.id}`}
              style={styles.modalList}
              renderItem={({ item: row }) => {
                if (row.type === "folder") {
                  return (
                    <TouchableOpacity
                      style={styles.modalItem}
                      onPress={() => navigateInto(row.item as DriveFolder)}
                      activeOpacity={0.7}
                    >
                      <MaterialCommunityIcons name="folder" size={20} color="#FFC107" />
                      <Text style={[styles.modalItemText, { flex: 1 }]} numberOfLines={1}>
                        {row.item.name}
                      </Text>
                      <MaterialCommunityIcons name="chevron-right" size={18} color={Colors.textSecondary} />
                    </TouchableOpacity>
                  );
                }
                const sheet = row.item as DriveSheet;
                const isSelected = sheet.id === selectedSheetId;
                return (
                  <TouchableOpacity
                    style={[styles.modalItem, isSelected && styles.modalItemSelected]}
                    onPress={() => { onSelectSheet?.(sheet); onClose(); }}
                    activeOpacity={0.7}
                  >
                    <MaterialCommunityIcons
                      name={isSelected ? "check-circle" : "table"}
                      size={20}
                      color={isSelected ? Colors.accent : Colors.textSecondary}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.modalItemText} numberOfLines={1}>
                        {sheet.name}
                      </Text>
                      {isSearchMode && sheet.folderPath ? (
                        <View style={styles.searchFolderPathRow}>
                          <MaterialCommunityIcons name="folder-outline" size={11} color={Colors.textSecondary} />
                          <Text style={styles.folderPathText} numberOfLines={1}>
                            {sheet.folderPath}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

export default function TraduzioniScreen() {
  const insets = useSafeAreaInsets();

  const [prepareStatus, setPrepareStatus] = useState<StepStatus>("idle");
  const [prepareResult, setPrepareResult] = useState("");

  const [exportLangs, setExportLangs] = useState<string[]>(["en", "de", "es", "fr", "tr"]);
  const [exportStatus, setExportStatus] = useState<StepStatus>("idle");
  const [exportResult, setExportResult] = useState("");
  const [exportedFileUrl, setExportedFileUrl] = useState<string | null>(null);

  const sheetFetchSeq = useRef(0);

  const [importInfo, setImportInfo] = useState<{ exportedLangs: string[] }>({ exportedLangs: [] });
  const [importLangs, setImportLangs] = useState<string[]>([]);
  const [importStatus, setImportStatus] = useState<StepStatus>("idle");
  const [importResult, setImportResult] = useState("");

  const [manualFileInput, setManualFileInput] = useState("");
  const [showSheetBrowser, setShowSheetBrowser] = useState(false);
  const [selectedSheet, setSelectedSheet] = useState<DriveSheet | null>(null);

  const [previewCols, setPreviewCols] = useState<string[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [applyStatus, setApplyStatus] = useState<StepStatus>("idle");
  const [applyResult, setApplyResult] = useState("");

  const [restartStatus, setRestartStatus] = useState<StepStatus>("idle");
  const [restartResult, setRestartResult] = useState("");

  const [downloadLoading, setDownloadLoading] = useState(false);
  const [downloadResult, setDownloadResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const [cleanupLoading2, setCleanupLoading2] = useState(false);
  const [cleanupResult2, setCleanupResult2] = useState<string | null>(null);

  const [driveConnected, setDriveConnected] = useState<boolean | null>(null);
  const [driveEmail, setDriveEmail] = useState<string | null>(null);
  const [driveTokenExpired, setDriveTokenExpired] = useState(false);
  const [driveStatusLoading, setDriveStatusLoading] = useState(false);
  const [connectingDrive, setConnectingDrive] = useState(false);
  const [disconnectingDrive, setDisconnectingDrive] = useState(false);

  useEffect(() => {
    loadImportInfo();
    loadPrefs();
    loadOAuthStatus();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadOAuthStatus();
    }, [])
  );

  async function loadOAuthStatus() {
    setDriveStatusLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const url = new URL("/api/admin/drive/oauth-status", getApiUrl());
      const resp = await fetch(url.toString(), {
        credentials: "include",
        signal: controller.signal,
      });
      if (resp.ok) {
        const data = await resp.json();
        setDriveConnected(data.connected === true);
        setDriveEmail(data.connected === true ? (data.email ?? null) : null);
        setDriveTokenExpired(data.tokenExpired === true);
      } else {
        setDriveConnected(false);
        setDriveEmail(null);
        setDriveTokenExpired(false);
      }
    } catch {
      setDriveConnected(false);
      setDriveEmail(null);
      setDriveTokenExpired(false);
    } finally {
      clearTimeout(timer);
      setDriveStatusLoading(false);
    }
  }

  async function handleConnectDrive() {
    setConnectingDrive(true);
    try {
      const url = new URL("/api/admin/drive/oauth-start", getApiUrl());
      const resp = await fetch(url.toString(), { credentials: "include" });
      if (!resp.ok) throw new Error("Errore generazione URL");
      const data = await resp.json();
      if (data.authUrl) {
        await Linking.openURL(data.authUrl);
        setTimeout(() => {
          loadOAuthStatus();
          setConnectingDrive(false);
        }, 4000);
      } else {
        setConnectingDrive(false);
      }
    } catch (e: any) {
      setConnectingDrive(false);
    }
  }

  async function handleDisconnectDrive() {
    setDisconnectingDrive(true);
    try {
      const url = new URL("/api/admin/drive/oauth-disconnect", getApiUrl());
      await fetch(url.toString(), { method: "DELETE", credentials: "include" });
      setDriveConnected(false);
      setDriveEmail(null);
    } catch {}
    setDisconnectingDrive(false);
  }

  async function loadPrefs() {
    type PrefsResponse = {
      hasRecord: boolean;
      sheet: DriveSheet | null;
    };
    let serverData: PrefsResponse | null = null;
    try {
      const url = new URL("/api/admin/translations/prefs", getApiUrl());
      const resp = await fetch(url.toString(), { credentials: "include" });
      if (resp.ok) serverData = await resp.json() as PrefsResponse;
    } catch {}

    const serverHasRecord = serverData?.hasRecord === true;
    const sheet = serverHasRecord ? (serverData!.sheet ?? null) : null;
    if (serverHasRecord) {
      setSelectedSheet(sheet);
      try {
        if (sheet) await AsyncStorage.setItem(STORAGE_KEY_SHEET, JSON.stringify(sheet));
        else await AsyncStorage.removeItem(STORAGE_KEY_SHEET);
      } catch {}
      if (sheet && !sheet.folderPath) {
        try {
          const url = new URL(`/api/admin/translations/file-path?fileId=${encodeURIComponent(sheet.id)}`, getApiUrl());
          const resp = await fetch(url.toString(), { credentials: "include" });
          if (resp.ok) {
            const data = await resp.json() as { folderPath?: string };
            if (data.folderPath) {
              const enriched: DriveSheet = { ...sheet, folderPath: data.folderPath };
              setSelectedSheet(enriched);
              saveSheet(enriched);
            }
          }
        } catch {}
      }
    } else {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY_SHEET);
        if (raw) {
          const localSheet: DriveSheet = JSON.parse(raw);
          setSelectedSheet(localSheet);
          if (!localSheet.folderPath) {
            try {
              const url = new URL(`/api/admin/translations/file-path?fileId=${encodeURIComponent(localSheet.id)}`, getApiUrl());
              const resp = await fetch(url.toString(), { credentials: "include" });
              if (resp.ok) {
                const data = await resp.json() as { folderPath?: string };
                if (data.folderPath) {
                  const enriched: DriveSheet = { ...localSheet, folderPath: data.folderPath };
                  setSelectedSheet(enriched);
                  saveSheet(enriched);
                }
              }
            } catch {}
          }
        }
      } catch {}
    }
  }

  async function saveSheet(sheet: DriveSheet | null) {
    try {
      if (sheet) {
        await AsyncStorage.setItem(STORAGE_KEY_SHEET, JSON.stringify(sheet));
      } else {
        await AsyncStorage.removeItem(STORAGE_KEY_SHEET);
      }
    } catch {}
    try {
      const url = new URL("/api/admin/translations/prefs", getApiUrl());
      fetch(url.toString(), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheet }),
      }).catch(() => {});
    } catch {}
  }

  async function fetchAndSetSheet(sheet: DriveSheet) {
    const seq = ++sheetFetchSeq.current;
    setSelectedSheet(sheet);
    setManualFileInput("");
    saveSheet(sheet);
    try {
      const url = new URL(`/api/admin/translations/file-path?fileId=${encodeURIComponent(sheet.id)}`, getApiUrl());
      const resp = await fetch(url.toString(), { credentials: "include" });
      if (seq !== sheetFetchSeq.current) return;
      if (resp.ok) {
        const data = await resp.json() as { folderPath?: string };
        if (seq !== sheetFetchSeq.current) return;
        if (data.folderPath) {
          const enriched: DriveSheet = { ...sheet, folderPath: data.folderPath };
          setSelectedSheet(enriched);
          saveSheet(enriched);
        }
      }
    } catch {}
  }

  async function loadImportInfo() {
    try {
      const resp = await fetch(new URL("/api/admin/translations/import-info", getApiUrl()).toString(), {
        credentials: "include",
      });
      if (resp.ok) {
        const data = await resp.json();
        setImportInfo({ exportedLangs: data.exportedLangs || [] });
        setImportLangs(data.exportedLangs || []);
      }
    } catch {}
  }

  function openSheetBrowser() {
    setShowSheetBrowser(true);
  }

  async function handlePrepare() {
    setPrepareStatus("loading");
    setPrepareResult("");
    try {
      const resp = await apiRequest("POST", "/api/admin/translations/prepare", {});
      const data = await resp.json();
      setPrepareStatus("success");
      const langSummary = data.langCounts
        ? Object.entries(data.langCounts as Record<string, number>)
            .map(([l, n]) => `${l.toUpperCase()}: ${n}`)
            .join(", ")
        : "";
      setPrepareResult(
        `${data.count} stringhe IT` + (langSummary ? ` | Esistenti → ${langSummary}` : "")
      );
    } catch (e: any) {
      setPrepareStatus("error");
      setPrepareResult(e?.message || "Errore durante la preparazione");
    }
  }

  async function handleExport() {
    if (exportLangs.length === 0) {
      setExportStatus("error");
      setExportResult("Seleziona almeno una lingua");
      return;
    }
    setExportStatus("loading");
    setExportResult("");
    setExportedFileUrl(null);
    setDownloadResult(null);
    setCleanupResult2(null);
    try {
      const resp = await apiRequest("POST", "/api/admin/translations/export", { langs: exportLangs });
      const data = await resp.json();
      setExportStatus("success");
      setExportResult(data.message || "Sheet creato con successo");
      setExportedFileUrl(data.fileUrl || null);
      await loadImportInfo();
    } catch (e: any) {
      if (e?.message === "GOOGLE_DRIVE_TOKEN_EXPIRED") {
        setDriveConnected(false);
        setDriveTokenExpired(true);
        setExportStatus("error");
        setExportResult("Token Drive scaduto — riconnetti Google Drive dal banner qui sopra");
      } else {
        setExportStatus("error");
        setExportResult(e?.message || "Errore durante l'esportazione");
      }
    }
  }

  async function handleDownloadCsv() {
    setDownloadLoading(true);
    setDownloadResult(null);
    try {
      const langs = exportLangs.length > 0 ? exportLangs : ["en", "de", "es", "fr", "tr"];
      const url = new URL(
        `/api/admin/translations/download-csv?langs=${langs.join(",")}`,
        getApiUrl()
      );

      if (Platform.OS === "web") {
        const resp = await fetch(url.toString(), { credentials: "include" });
        if (!resp.ok) throw new Error("Errore download");
        const blob = await resp.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = `BikerLink_Traduzioni_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(blobUrl);
        setDownloadResult({ ok: true, msg: "Download avviato" });
      } else {
        const resp = await fetch(url.toString(), { credentials: "include" });
        if (!resp.ok) throw new Error("Errore download");
        const csvText = await resp.text();
        const filePath = `${FileSystem.cacheDirectory}BikerLink_Traduzioni.csv`;
        await FileSystem.writeAsStringAsync(filePath, csvText, {
          encoding: 'utf8',
        });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(filePath, {
            mimeType: "text/csv",
            dialogTitle: "Salva CSV Traduzioni",
          });
          setDownloadResult({ ok: true, msg: "File CSV pronto da condividere" });
        } else {
          setDownloadResult({ ok: false, msg: "Condivisione non disponibile su questo dispositivo" });
        }
      }
    } catch (e: any) {
      setDownloadResult({ ok: false, msg: e?.message || "Errore download" });
    } finally {
      setDownloadLoading(false);
    }
  }

  async function handleCleanupInline() {
    setCleanupLoading2(true);
    setCleanupResult2(null);
    try {
      const url = new URL("/api/admin/drive/cleanup-exports", getApiUrl());
      const resp = await fetch(url.toString(), { method: "DELETE", credentials: "include" });
      const data = await resp.json();
      if (!resp.ok) {
        setCleanupResult2(`Errore: ${data.message ?? "sconosciuto"}`);
      } else {
        const mb = data.freed > 0 ? ` (${(data.freed / 1024 / 1024).toFixed(1)} MB liberati)` : "";
        setCleanupResult2(`OK: eliminati ${data.deleted} file${mb}. Riprova l'esportazione.`);
      }
    } catch {
      setCleanupResult2("Errore di rete");
    } finally {
      setCleanupLoading2(false);
    }
  }

  function getResolvedFileId(): string | null {
    if (manualFileInput.trim()) return extractFileId(manualFileInput);
    if (selectedSheet) return selectedSheet.id;
    return null;
  }

  async function handleImport() {
    if (importLangs.length === 0) {
      setImportStatus("error");
      setImportResult("Seleziona almeno una lingua da importare");
      return;
    }
    setImportStatus("loading");
    setImportResult("");
    try {
      const body: Record<string, unknown> = { langs: importLangs };
      const customFileId = getResolvedFileId();
      if (customFileId) body.fileId = customFileId;
      const resp = await apiRequest("POST", "/api/admin/translations/import", body);
      const data = await resp.json();
      setImportStatus("success");
      setImportResult(data.message || "Dati importati con successo");
    } catch (e: any) {
      setImportStatus("error");
      setImportResult(e?.message || "Errore durante l'importazione");
    }
  }

  async function handleApply() {
    setApplyStatus("loading");
    setApplyResult("");
    try {
      const resp = await apiRequest("POST", "/api/admin/translations/apply", {});
      const data = await resp.json();
      setApplyStatus("success");
      setApplyResult(data.message || "Traduzioni applicate con successo");
    } catch (e: any) {
      setApplyStatus("error");
      setApplyResult(e?.message || "Errore durante l'applicazione");
    }
  }

  async function handleRestart() {
    setRestartStatus("loading");
    setRestartResult("");
    try {
      await apiRequest("POST", "/api/admin/translations/restart", {});
      setRestartStatus("success");
      setRestartResult("Backend in riavvio...");
    } catch (e: any) {
      const msg: string = e?.message ?? "";
      const isConnectionDrop =
        msg.includes("Network request failed") ||
        msg.includes("Failed to fetch") ||
        msg.includes("NetworkError") ||
        msg.includes("503") ||
        msg.includes("502");
      if (isConnectionDrop) {
        setRestartStatus("success");
        setRestartResult("Backend in riavvio (connessione chiusa dal server)...");
      } else {
        setRestartStatus("error");
        setRestartResult(msg || "Errore durante il riavvio");
      }
    }
  }

  function toggleExportLang(code: string) {
    setExportLangs((prev) =>
      prev.includes(code) ? prev.filter((l) => l !== code) : [...prev, code]
    );
  }

  const hasCustomImportSource = !!(manualFileInput.trim() || selectedSheet);

  useEffect(() => {
    if (!hasCustomImportSource && importInfo.exportedLangs.length > 0) {
      setImportLangs((prev) => prev.filter((l) => importInfo.exportedLangs.includes(l)));
    }
  }, [hasCustomImportSource, importInfo.exportedLangs]);

  useEffect(() => {
    const fileId = manualFileInput.trim()
      ? extractFileId(manualFileInput)
      : selectedSheet?.id ?? null;
    if (!fileId) {
      setPreviewCols(null);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewCols(null);
    fetch(
      new URL(
        `/api/admin/translations/preview-sheet?fileId=${encodeURIComponent(fileId)}`,
        getApiUrl()
      ).toString(),
      { credentials: "include" }
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.langColumns) {
          setPreviewCols(data.langColumns as string[]);
          const detected = (data.langColumns as string[])
            .map((c: string) => c.toLowerCase())
            .filter((l) => LANGS.some((lang) => lang.code === l));
          setImportLangs(detected);
        } else {
          setPreviewCols([]);
        }
      })
      .catch(() => { if (!cancelled) setPreviewCols([]); })
      .finally(() => { if (!cancelled) setPreviewLoading(false); });
    return () => { cancelled = true; };
  }, [manualFileInput, selectedSheet]);

  function toggleImportLang(code: string) {
    if (!hasCustomImportSource && !importInfo.exportedLangs.includes(code)) return;
    setImportLangs((prev) =>
      prev.includes(code) ? prev.filter((l) => l !== code) : [...prev, code]
    );
  }

  const importDisabled = importLangs.length === 0 ||
    (!hasCustomImportSource && importInfo.exportedLangs.length === 0);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + 24, paddingTop: Platform.OS === "web" ? 67 : 0 },
      ]}
    >
      <Text style={styles.pageDesc}>
        Esporta tutte le stringhe dell'app su un Google Sheet, falle tradurre esternamente, poi importa e applica i risultati.
      </Text>

      <StepCard
        stepNumber={1}
        title="Prepara generazione"
        description="Scansiona il file IT e conta tutte le stringhe da esportare."
        status={prepareStatus}
        buttonLabel="Prepara"
        onPress={handlePrepare}
        resultText={prepareResult}
      />

      <View style={styles.oauthBanner}>
        {driveStatusLoading || driveConnected === null ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <ActivityIndicator size="small" color={Colors.accent} />
            <Text style={styles.oauthBannerText}>Verifica connessione Drive...</Text>
          </View>
        ) : driveConnected ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1, flexWrap: "wrap" }}>
            <MaterialCommunityIcons name="check-circle" size={18} color="#4CAF50" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.oauthBannerText, { color: "#4CAF50" }]}>Drive connesso</Text>
              {driveEmail ? (
                <Text style={[styles.oauthBannerSub, { color: "#4CAF50" }]}>{driveEmail}</Text>
              ) : null}
            </View>
            <TouchableOpacity
              onPress={handleDisconnectDrive}
              disabled={disconnectingDrive}
              style={styles.oauthDisconnectBtn}
              activeOpacity={0.7}
            >
              {disconnectingDrive
                ? <ActivityIndicator size="small" color="#888" />
                : <Text style={styles.oauthDisconnectText}>Disconnetti</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity
              onPress={loadOAuthStatus}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialCommunityIcons name="refresh" size={16} color="#4CAF50" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1, flexWrap: "wrap" }}>
            <MaterialCommunityIcons
              name={driveTokenExpired ? "clock-alert-outline" : "alert-circle-outline"}
              size={18}
              color="#FF6600"
            />
            <Text style={[styles.oauthBannerText, { color: "#FF6600", flex: 1 }]}>
              {driveTokenExpired
                ? "Token scaduto — riconnetti Google Drive"
                : "Drive non connesso — l'export richiede autenticazione"}
            </Text>
            <TouchableOpacity
              onPress={handleConnectDrive}
              disabled={connectingDrive}
              style={styles.oauthConnectBtn}
              activeOpacity={0.7}
            >
              {connectingDrive
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.oauthConnectText}>
                    {driveTokenExpired ? "Riconnetti" : "Connetti Google Drive"}
                  </Text>
              }
            </TouchableOpacity>
          </View>
        )}
      </View>

      <StepCard
        stepNumber={2}
        title="Genera ed esporta su Drive"
        description="Crea un Google Sheet con le colonne selezionate. IT è sempre inclusa."
        status={exportStatus}
        buttonLabel="Genera ed esporta"
        onPress={handleExport}
        resultText={exportResult}
      >
        <View style={styles.langPicker}>
          <Text style={styles.langPickerLabel}>Lingue da includere nel foglio:</Text>
          {LANGS.map((l) => (
            <LangCheckbox
              key={l.code}
              lang={l.code}
              label={l.label}
              checked={exportLangs.includes(l.code)}
              onToggle={() => toggleExportLang(l.code)}
            />
          ))}
        </View>

        <View style={styles.sectionDivider} />
        <View style={styles.pickerButton}>
          <MaterialCommunityIcons name="folder-outline" size={18} color={Colors.accent} />
          <Text style={styles.pickerButtonText} numberOfLines={1}>Cartella: Traduzioni BikerLink</Text>
        </View>

        {exportedFileUrl ? (
          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => Linking.openURL(exportedFileUrl!)}
            activeOpacity={0.7}
          >
            <MaterialIcons name="open-in-new" size={16} color={Colors.accent} />
            <Text style={styles.linkButtonText}>Apri Google Sheet</Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.sectionDivider} />

        <TouchableOpacity
          style={[styles.secondaryButton, downloadLoading && styles.buttonDisabled]}
          onPress={handleDownloadCsv}
          disabled={downloadLoading}
          activeOpacity={0.7}
        >
          {downloadLoading ? (
            <ActivityIndicator color={Colors.accent} size="small" />
          ) : (
            <MaterialCommunityIcons name="download" size={16} color={Colors.accent} />
          )}
          <Text style={styles.secondaryButtonText}>
            {downloadLoading ? "Generazione..." : "Scarica CSV direttamente"}
          </Text>
        </TouchableOpacity>

        {downloadResult ? (
          <View style={[styles.inlineHint, downloadResult.ok ? styles.inlineHintOk : styles.inlineHintErr]}>
            <MaterialCommunityIcons
              name={downloadResult.ok ? "check-circle-outline" : "alert-circle-outline"}
              size={14}
              color={downloadResult.ok ? "#4CAF50" : "#eb5757"}
            />
            <Text style={[styles.inlineHintText, { color: downloadResult.ok ? "#4CAF50" : "#eb5757" }]}>
              {downloadResult.msg}
            </Text>
          </View>
        ) : null}

        {exportStatus === "error" && exportResult.toLowerCase().includes("permessi") ? (
          <View style={styles.permissionBox}>
            <MaterialCommunityIcons name="shield-alert-outline" size={16} color="#eb5757" />
            <Text style={styles.permissionText}>
              {exportResult}
            </Text>
          </View>
        ) : null}
        {exportStatus === "error" && exportResult.toLowerCase().includes("quota") ? (
          <View style={styles.quotaBox}>
            <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#FFC107" />
            <View style={{ flex: 1 }}>
              <Text style={styles.quotaText}>
                Drive pieno. Premi per liberare spazio eliminando i vecchi export, poi riprova:
              </Text>
              <TouchableOpacity
                style={[styles.cleanupButton, cleanupLoading2 && styles.buttonDisabled]}
                onPress={handleCleanupInline}
                disabled={cleanupLoading2}
                activeOpacity={0.7}
              >
                {cleanupLoading2 ? (
                  <ActivityIndicator color="#eb5757" size="small" />
                ) : (
                  <MaterialCommunityIcons name="trash-can-outline" size={14} color="#eb5757" />
                )}
                <Text style={styles.cleanupButtonText}>Libera spazio Drive</Text>
              </TouchableOpacity>
              {cleanupResult2 ? (
                <Text style={styles.cleanupResultText}>{cleanupResult2}</Text>
              ) : null}
            </View>
          </View>
        ) : null}
      </StepCard>

      <StepCard
        stepNumber={3}
        title="Importa da Drive"
        description="Rilegge il Google Sheet e carica le traduzioni delle lingue selezionate."
        status={importStatus}
        buttonLabel="Importa"
        onPress={handleImport}
        resultText={importResult}
        disabled={importDisabled}
      >
        <View style={styles.langPicker}>
          <Text style={styles.langPickerLabel}>Lingue da importare:</Text>
          {LANGS.map((l) => {
            const available = hasCustomImportSource || importInfo.exportedLangs.includes(l.code);
            return (
              <LangCheckbox
                key={l.code}
                lang={l.code}
                label={l.label}
                checked={importLangs.includes(l.code)}
                disabled={!available}
                onToggle={() => toggleImportLang(l.code)}
              />
            );
          })}
        </View>

        <View style={styles.sectionDivider} />
        <Text style={styles.langPickerLabel}>File sorgente:</Text>

        {importInfo.exportedLangs.length > 0 && !hasCustomImportSource ? (
          <View style={styles.sessionFileInfo}>
            <MaterialCommunityIcons name="check-circle-outline" size={14} color="#4CAF50" />
            <Text style={styles.sessionFileText}>Usa il file esportato in questa sessione</Text>
          </View>
        ) : null}

        <TouchableOpacity style={styles.pickerButton} onPress={openSheetBrowser} activeOpacity={0.7}>
          <MaterialCommunityIcons name="table" size={18} color={Colors.accent} />
          <Text style={styles.pickerButtonText} numberOfLines={1}>
            {selectedSheet ? selectedSheet.name : "Sfoglia Drive…"}
          </Text>
          <MaterialCommunityIcons name="chevron-down" size={18} color={Colors.textSecondary} />
        </TouchableOpacity>
        {selectedSheet?.folderPath ? (
          <View style={styles.folderPathRow}>
            <MaterialCommunityIcons name="folder-outline" size={13} color={Colors.textSecondary} />
            <Text style={styles.folderPathText} numberOfLines={1}>{selectedSheet.folderPath}</Text>
          </View>
        ) : null}
        {selectedSheet ? (
          <TouchableOpacity
            onPress={() => { setSelectedSheet(null); saveSheet(null); }}
            style={styles.clearButton}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="close-circle-outline" size={14} color={Colors.textSecondary} />
            <Text style={styles.clearButtonText}>Rimuovi selezione</Text>
          </TouchableOpacity>
        ) : null}

        <Text style={[styles.langPickerLabel, { marginTop: 8 }]}>oppure incolla URL / ID del foglio:</Text>
        <TextInput
          style={styles.textInput}
          value={manualFileInput}
          onChangeText={setManualFileInput}
          placeholder="https://docs.google.com/spreadsheets/d/…  oppure ID"
          placeholderTextColor={Colors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
        />
        {manualFileInput.trim() ? (
          <View style={styles.sessionFileInfo}>
            <MaterialCommunityIcons name="information-outline" size={14} color={Colors.accent} />
            <Text style={[styles.sessionFileText, { color: Colors.accent }]}>
              File ID: {extractFileId(manualFileInput)}
            </Text>
          </View>
        ) : null}

        {previewLoading && hasCustomImportSource ? (
          <View style={styles.previewRow}>
            <ActivityIndicator size="small" color={Colors.accent} />
            <Text style={styles.previewText}>Analisi colonne…</Text>
          </View>
        ) : previewCols !== null && previewCols.length > 0 ? (
          <View style={styles.previewRow}>
            <MaterialCommunityIcons name="table-column" size={14} color="#4CAF50" />
            <Text style={[styles.previewText, { color: "#4CAF50" }]}>
              Colonne trovate: {previewCols.join(", ")}
            </Text>
          </View>
        ) : previewCols !== null && previewCols.length === 0 && hasCustomImportSource ? (
          <View style={styles.previewRow}>
            <MaterialCommunityIcons name="alert-outline" size={14} color={Colors.textSecondary} />
            <Text style={[styles.previewText, { color: Colors.textSecondary }]}>
              Nessuna colonna lingua rilevata nel foglio
            </Text>
          </View>
        ) : null}
      </StepCard>

      <StepCard
        stepNumber={4}
        title="Applica traduzioni"
        description="Scrive i valori importati nei file TypeScript lib/i18n/. Crea tr.ts se mancante."
        status={applyStatus}
        buttonLabel="Applica"
        onPress={handleApply}
        resultText={applyResult}
      />

      <StepCard
        stepNumber={5}
        title="Riavvia Backend"
        description="Riavvia il server per recepire le modifiche ai file i18n."
        status={restartStatus}
        buttonLabel="Riavvia Backend"
        onPress={handleRestart}
        resultText={restartResult}
      />

      {restartStatus === "success" ? (
        <View style={styles.infoBanner}>
          <MaterialCommunityIcons name="information-outline" size={20} color={Colors.accent} />
          <View style={styles.infoBannerText}>
            <Text style={styles.infoBannerTitle}>Per aggiornare l'app frontend:</Text>
            <Text style={styles.infoBannerBody}>
              1. Apri il workflow "Start Frontend" su Replit e riavvialo.{"\n"}
              2. Per una pubblicazione definitiva su App Store, usa il pulsante "Expo Launch" su Replit dopo aver riavviato il frontend.
            </Text>
          </View>
        </View>
      ) : null}

      <DriveFileBrowser
        visible={showSheetBrowser}
        mode="sheet"
        title="Scegli Google Sheet"
        selectedSheetId={selectedSheet?.id}
        onSelectSheet={(s) => { fetchAndSetSheet(s); }}
        onClose={() => setShowSheetBrowser(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  pageDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 4,
    lineHeight: 19,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  stepBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  stepBadgeSuccess: {
    backgroundColor: "#4CAF50",
  },
  stepBadgeError: {
    backgroundColor: "#F44336",
  },
  stepBadgeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: "#fff",
  },
  cardHeaderText: {
    flex: 1,
  },
  cardTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: Colors.text,
    marginBottom: 2,
  },
  cardDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 17,
  },
  button: {
    backgroundColor: Colors.accent,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "#fff",
  },
  resultBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 10,
    borderRadius: 8,
  },
  resultBoxSuccess: {
    backgroundColor: "rgba(76, 175, 80, 0.1)",
  },
  resultBoxError: {
    backgroundColor: "rgba(244, 67, 54, 0.1)",
  },
  resultText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    flex: 1,
    lineHeight: 17,
  },
  resultTextSuccess: {
    color: "#4CAF50",
  },
  resultTextError: {
    color: "#F44336",
  },
  langPicker: {
    gap: 6,
    paddingTop: 4,
  },
  langPickerLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  checkbox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 3,
  },
  checkboxDisabled: {
    opacity: 0.4,
  },
  checkboxLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.text,
  },
  checkboxLabelDisabled: {
    color: Colors.textSecondary,
  },
  linkButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
  },
  linkButtonText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.accent,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 2,
  },
  pickerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pickerButtonText: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.text,
  },
  folderPathRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 2,
    marginTop: -4,
  },
  clearButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  clearButtonText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
  },
  textInput: {
    backgroundColor: Colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.text,
  },
  sessionFileInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 2,
  },
  sessionFileText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: "#4CAF50",
    flex: 1,
  },
  infoBanner: {
    backgroundColor: "rgba(255, 152, 0, 0.1)",
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    borderWidth: 1,
    borderColor: "rgba(255, 152, 0, 0.3)",
  },
  infoBannerText: {
    flex: 1,
    gap: 4,
  },
  infoBannerTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.text,
  },
  infoBannerBody: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "70%",
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.text,
  },
  modalLoading: {
    padding: 32,
    alignItems: "center",
  },
  modalList: {
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  modalItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
  },
  modalItemSelected: {
    backgroundColor: "rgba(255,152,0,0.08)",
  },
  modalItemText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.text,
    flex: 1,
  },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
  },
  previewText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    flex: 1,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 12,
    marginVertical: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.text,
    paddingVertical: 0,
  },
  breadcrumbRow: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  backButtonText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.accent,
  },
  breadcrumbItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  breadcrumbText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    paddingHorizontal: 4,
  },
  breadcrumbTextActive: {
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  selectHereButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.accent,
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 4,
    borderRadius: 10,
    paddingVertical: 10,
  },
  selectHereButtonText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: "#fff",
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.text,
    paddingVertical: 4,
  },
  folderPathText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    flex: 1,
  },
  searchFolderPathRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 2,
  },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.accent,
    borderRadius: 10,
    paddingVertical: 10,
  },
  secondaryButtonText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.accent,
  },
  inlineHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 8,
  },
  inlineHintOk: {
    backgroundColor: "rgba(76, 175, 80, 0.1)",
  },
  inlineHintErr: {
    backgroundColor: "rgba(244, 67, 54, 0.1)",
  },
  inlineHintText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    flex: 1,
  },
  permissionBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "rgba(235,87,87,0.08)",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(235,87,87,0.3)",
    marginBottom: 8,
  },
  permissionText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: "#eb5757",
    lineHeight: 17,
    flex: 1,
  },
  quotaBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "rgba(255,193,7,0.08)",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,193,7,0.3)",
  },
  quotaText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: "#FFC107",
    lineHeight: 17,
    marginBottom: 8,
  },
  cleanupButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(235,87,87,0.12)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    alignSelf: "flex-start",
  },
  cleanupButtonText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: "#eb5757",
  },
  cleanupResultText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 6,
  },
  oauthBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  oauthBannerText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.text,
  },
  oauthBannerSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    marginTop: 2,
  },
  oauthConnectBtn: {
    backgroundColor: "#FF6600",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    minWidth: 48,
    alignItems: "center",
  },
  oauthConnectText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: "#fff",
  },
  oauthDisconnectBtn: {
    backgroundColor: "#2a2a2a",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    minWidth: 48,
    alignItems: "center",
  },
  oauthDisconnectText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: Colors.textSecondary,
  },
});
