import type { AdminGroup } from "./admin-types";

export const OPEN_BY_DEFAULT = new Set<string>();

export const adminGroups: AdminGroup[] = [
  {
    title: "Utenti",
    headerIcon: "people",
    headerIconSet: "MaterialIcons",
    items: [
      { key: "users", label: "Utenti", icon: "people", iconSet: "MaterialIcons", route: "/admin/users" },
      { key: "stregatti", label: "Stregatti", icon: "robot", iconSet: "MaterialCommunityIcons", route: "/admin/stregatti" },
      { key: "blocks", label: "Blocchi", icon: "ban", iconSet: "Ionicons", route: "/admin/blocks" },
    ],
  },
  {
    title: "Report",
    headerIcon: "flag-variant",
    headerIconSet: "MaterialCommunityIcons",
    items: [
      { key: "reports-hub", label: "Hub Report", icon: "view-dashboard-variant", iconSet: "MaterialCommunityIcons", route: "/admin/reports-hub", accentColor: "#FF3B30" },
      { key: "reports", label: "Coda Segnalazioni", icon: "flag", iconSet: "MaterialIcons", route: "/admin/reports", accentColor: "#FF9500" },
      { key: "reports-by-category", label: "Per Categoria", icon: "shape-outline", iconSet: "MaterialCommunityIcons", route: "/admin/reports-by-category", accentColor: "#0EA5E9" },
      { key: "reports-by-role", label: "Per Ruolo", icon: "account-group-outline", iconSet: "MaterialCommunityIcons", route: "/admin/reports-by-role", accentColor: "#10B981" },
      { key: "reports-patterns", label: "Pattern", icon: "chart-bell-curve", iconSet: "MaterialCommunityIcons", route: "/admin/reports-patterns", accentColor: "#E91E63" },
      { key: "false-reports", label: "Falsi Report", icon: "shield-alert-outline", iconSet: "MaterialCommunityIcons", route: "/admin/false-reports", accentColor: "#9C27B0" },
      { key: "active-bans", label: "Ban Attivi", icon: "account-cancel-outline", iconSet: "MaterialCommunityIcons", route: "/admin/active-bans", accentColor: "#FF3B30" },
      { key: "moderator-logs", label: "Log Moderatori", icon: "shield-account-outline", iconSet: "MaterialCommunityIcons", route: "/admin/moderator-logs", accentColor: "#6366F1" },
      { key: "reports-thresholds", label: "Soglie & Policy", icon: "tune-variant", iconSet: "MaterialCommunityIcons", route: "/admin/reports-thresholds", accentColor: "#22C55E" },
    ],
  },
  {
    title: "Contenuti",
    headerIcon: "layers",
    headerIconSet: "MaterialIcons",
    items: [
      { key: "workshops", label: "Officine", icon: "store", iconSet: "MaterialIcons", route: "/admin/workshops" },
      { key: "motoclubs", label: "Clubs", icon: "shield", iconSet: "Ionicons", route: "/admin/motoclubs" },
      { key: "eventi", label: "Raduni", icon: "calendar", iconSet: "Ionicons", route: "/admin/eventi" },
      { key: "easter-eggs", label: "Easter Eggs", icon: "egg-easter", iconSet: "MaterialCommunityIcons", route: "/admin/easter-eggs" },
      { key: "ads", label: "Campagne", icon: "campaign", iconSet: "MaterialIcons", route: "/admin/ads" },
    ],
  },
  {
    title: "Monitoraggio",
    headerIcon: "bar-chart",
    headerIconSet: "Ionicons",
    items: [
      { key: "analytics", label: "Analytics", icon: "analytics", iconSet: "MaterialIcons", route: "/admin/analytics" },
      { key: "performance", label: "Performance", icon: "speedometer", iconSet: "Ionicons", route: "/admin/performance" },
      { key: "gps-errors", label: "GPS Error Log", icon: "location-sharp", iconSet: "Ionicons", route: "/admin/gps-errors" },
      { key: "gps-rejections", label: "GPS Rifiutati", icon: "alert-circle", iconSet: "Ionicons", route: "/admin/gps-rejections", accentColor: "#FF9500" },
      { key: "db-debug", label: "DB Debug", icon: "database", iconSet: "MaterialCommunityIcons", route: "/admin/db-debug" },
      { key: "db-tables", label: "Dimensioni DB", icon: "database-settings", iconSet: "MaterialCommunityIcons", route: "/admin/db-tables" },
      { key: "system", label: "System Monitor", icon: "pulse-outline", iconSet: "Ionicons", route: "/admin/system", accentColor: "#FF4444" },
      { key: "moderator-logs", label: "Log Moderatori", icon: "shield-account-outline", iconSet: "MaterialCommunityIcons", route: "/admin/moderator-logs" },
      { key: "crash-logs", label: "Log Riavvii", icon: "phone-alert", iconSet: "MaterialCommunityIcons", route: "/admin/crash-logs", accentColor: "#FF6B35" },
      { key: "visitatori", label: "Visitatori Sito", icon: "web", iconSet: "MaterialCommunityIcons", route: "/admin/visitatori", accentColor: "#22C55E" },
      { key: "device-stats", label: "Dispositivi", icon: "cellphone-check", iconSet: "MaterialCommunityIcons", route: "/admin/device-stats", accentColor: "#6366F1" },
    ],
  },
  {
    title: "Marketing",
    headerIcon: "email-newsletter",
    headerIconSet: "MaterialCommunityIcons",
    items: [
      { key: "newsletter", label: "Newsletter", icon: "email-newsletter", iconSet: "MaterialCommunityIcons", route: "/admin/newsletter", accentColor: "#2196F3" },
    ],
  },
  {
    title: "Matching",
    headerIcon: "link-variant",
    headerIconSet: "MaterialCommunityIcons",
    items: [
      { key: "matching-hub", label: "Hub Matching", icon: "view-dashboard-variant", iconSet: "MaterialCommunityIcons", route: "/admin/matching-hub", accentColor: "#0EA5E9" },
      { key: "match-engine", label: "Motore Matching", icon: "engine", iconSet: "MaterialCommunityIcons", route: "/admin/match-engine", accentColor: "#FF9500" },
      { key: "match-rules", label: "Regole Matching", icon: "table-large", iconSet: "MaterialCommunityIcons", route: "/admin/match-rules", accentColor: "#10B981" },
      { key: "match-inspector", label: "Match Inspector", icon: "account-search", iconSet: "MaterialCommunityIcons", route: "/admin/match-inspector", accentColor: "#2196F3" },
      { key: "match-control", label: "Controllo Sistema", icon: "tune-variant", iconSet: "MaterialCommunityIcons", route: "/admin/match-control", accentColor: "#9C27B0" },
      { key: "match-health", label: "Match Health", icon: "heart-pulse", iconSet: "MaterialCommunityIcons", route: "/admin/match-health", accentColor: "#4CAF50" },
      { key: "matching-telemetry", label: "Telemetria", icon: "chart-line", iconSet: "MaterialCommunityIcons", route: "/admin/matching-telemetry", accentColor: "#22C55E" },
      { key: "ab", label: "A/B Esperimenti", icon: "flask-outline", iconSet: "MaterialCommunityIcons", route: "/admin/ab", accentColor: "#E91E63" },
    ],
  },
  {
    title: "Sistema",
    headerIcon: "settings",
    headerIconSet: "MaterialIcons",
    items: [
      { key: "ai-hub", label: "Hub AI", icon: "robot-outline", iconSet: "MaterialCommunityIcons", route: "/admin/ai-hub", accentColor: "#FF6600" },
      { key: "ai-assistant", label: "AI Assistant Utenti", icon: "account-question-outline", iconSet: "MaterialCommunityIcons", route: "/admin/ai-assistant", accentColor: "#FF6600" },
      { key: "system-health", label: "AI System Watchdog", icon: "shield-check", iconSet: "MaterialCommunityIcons", route: "/admin/system-health", accentColor: "#22c55e" },
      { key: "whisper-config", label: "Voce & Trascrizione", icon: "microphone-settings", iconSet: "MaterialCommunityIcons", route: "/admin/whisper-config", accentColor: "#8B5CF6" },
      { key: "settings", label: "Impostazioni", icon: "settings", iconSet: "MaterialIcons", route: "/admin/settings" },
      { key: "legal-docs", label: "Manualistica", icon: "document-text-outline", iconSet: "Ionicons", route: "/admin/legal-docs", accentColor: "#0EA5E9" },
      { key: "privacy", label: "Gestione Privacy", icon: "shield-lock", iconSet: "MaterialCommunityIcons", route: "/admin/privacy", accentColor: "#4CAF50" },
      { key: "invite-codes", label: "Codici Invito", icon: "gift", iconSet: "Ionicons", route: "/admin/invite-codes" },
      { key: "backup", label: "Backup automatici", icon: "cloud-upload", iconSet: "MaterialCommunityIcons", route: "/admin/backup" },
      { key: "backup-preview", label: "Esplora Backup", icon: "database-search", iconSet: "MaterialCommunityIcons", route: "/admin/backup-preview", accentColor: "#F59E0B" },
      { key: "exports", label: "Export Dati", icon: "database-export", iconSet: "MaterialCommunityIcons", route: "/admin/exports", accentColor: "#10B981" },
      { key: "tags", label: "Sistema Tag", icon: "tag-multiple", iconSet: "MaterialCommunityIcons", route: "/admin/tags", accentColor: "#9C27B0" },
      { key: "text-aliases", label: "Alias Testo", icon: "spellcheck", iconSet: "MaterialCommunityIcons", route: "/admin/text-aliases", accentColor: "#FF9800" },
    ],
  },
  {
    title: "Traduzioni",
    headerIcon: "translate",
    headerIconSet: "MaterialIcons",
    items: [
      { key: "traduzioni", label: "Traduzioni", icon: "translate", iconSet: "MaterialIcons", route: "/admin/traduzioni", accentColor: "#9C27B0" },
      { key: "tabella-lingue", label: "Tabella Lingue", icon: "table-large", iconSet: "MaterialCommunityIcons", route: "/admin/tabella-lingue", accentColor: "#9C27B0" },
    ],
  },
  {
    title: "Sistema Mappe",
    headerIcon: "map-outline",
    headerIconSet: "Ionicons",
    items: [
      { key: "maps", label: "Sistema Mappe", icon: "map-outline", iconSet: "Ionicons", route: "/admin/maps", accentColor: "#0EA5E9" },
    ],
  },
  {
    title: "Sistema Routing",
    headerIcon: "routes",
    headerIconSet: "MaterialCommunityIcons",
    items: [
      { key: "routing-hub", label: "Hub Routing", icon: "view-dashboard-variant", iconSet: "MaterialCommunityIcons", route: "/admin/routing-hub", accentColor: "#0EA5E9" },
      { key: "routing-control", label: "Controllo Routing", icon: "tune-variant", iconSet: "MaterialCommunityIcons", route: "/admin/routing-control", accentColor: "#9C27B0" },
      { key: "routing-health", label: "Routing Health", icon: "heart-pulse", iconSet: "MaterialCommunityIcons", route: "/admin/routing-health", accentColor: "#4CAF50" },
      { key: "telemetry-users", label: "Sessioni Utenti", icon: "map-marker-path", iconSet: "MaterialCommunityIcons", route: "/admin/telemetry-users", accentColor: "#22C55E" },
    ],
  },
  {
    title: "Laboratorio",
    headerIcon: "flask",
    headerIconSet: "MaterialCommunityIcons",
    items: [
      { key: "sensors", label: "Sensori", icon: "chip", iconSet: "MaterialCommunityIcons", route: "/admin/sensors", accentColor: "#FF9800" },
      { key: "telemetry", label: "Telemetria", icon: "chart-line", iconSet: "MaterialCommunityIcons", route: "/admin/telemetry", accentColor: "#22C55E" },
    ],
  },
  {
    title: "Controllo OTA",
    headerIcon: "cloud-download",
    headerIconSet: "MaterialCommunityIcons",
    items: [
      { key: "ota", label: "Aggiornamenti OTA", icon: "cloud-download", iconSet: "MaterialCommunityIcons", route: "/admin/ota", accentColor: "#0EA5E9" },
    ],
  },
];
