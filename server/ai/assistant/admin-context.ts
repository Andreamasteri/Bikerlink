// Task #4842 — Contesto admin sintetico iniettato nel system prompt quando la
// chat assistant è usata dal pannello admin (platform === "admin").
//
// Raccoglie uno snapshot leggero dello stato piattaforma (utenti attivi 24h,
// business approvati/in attesa, ultima OTA approvata, stato ThinkCentre) così
// l'assistente può rispondere all'admin con dati concreti invece che generici.
//
// Tutte le query passano da withBgDbConnection (slot bg + statement_timeout)
// per non affamare il traffico utente; ogni sorgente è isolata in try/catch:
// un guasto su una non deve impedire le altre.
import { withBgDbConnection } from "../../lib/bg-db-limiter";
import { storage } from "../../storage";
import type { ProbeLogEntry } from "../../routes/admin/thinkcentre-health-utils";

const PROBE_LOG_SNAPSHOT_KEY = "probe_log_snapshot";

interface BusinessRef { id: string; name: string; isApproved: boolean; isActive: boolean }

interface AdminSnapshot {
  activeUsers24h: number | null;
  businessApproved: number | null;
  businessPending: number | null;
  businessActive: number | null;
  // Task #4922 — Business candidati ad azioni (in attesa di approvazione o
  // approvati ma nascosti): l'assistente li referenzia per id nelle azioni admin.
  actionableBusinesses: BusinessRef[];
  lastOtaVersion: string | null;
  lastOtaPublishedAt: string | null;
  thinkCentre: Array<{ service: string; ok: boolean; ageMin: number | null }>;
}

async function loadDbStats(): Promise<Pick<
  AdminSnapshot,
  "activeUsers24h" | "businessApproved" | "businessPending" | "businessActive" | "actionableBusinesses" | "lastOtaVersion" | "lastOtaPublishedAt"
>> {
  const result = {
    activeUsers24h: null as number | null,
    businessApproved: null as number | null,
    businessPending: null as number | null,
    businessActive: null as number | null,
    actionableBusinesses: [] as BusinessRef[],
    lastOtaVersion: null as string | null,
    lastOtaPublishedAt: null as string | null,
  };
  try {
    await withBgDbConnection(async (client) => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      try {
        const r = await client.query(
          `SELECT COUNT(*)::int AS c FROM users
           WHERE last_login_at >= $1 AND is_fake = false AND role NOT IN ('admin','moderator')`,
          [since],
        );
        result.activeUsers24h = r.rows[0]?.c ?? 0;
      } catch { /* sorgente opzionale */ }
      try {
        const r = await client.query(
          `SELECT
             COUNT(*) FILTER (WHERE is_approved = true)::int AS approved,
             COUNT(*) FILTER (WHERE is_approved = false)::int AS pending,
             COUNT(*) FILTER (WHERE is_active = true)::int AS active
           FROM businesses`,
        );
        result.businessApproved = r.rows[0]?.approved ?? 0;
        result.businessPending = r.rows[0]?.pending ?? 0;
        result.businessActive = r.rows[0]?.active ?? 0;
      } catch { /* sorgente opzionale */ }
      try {
        // Business su cui l'admin può agire: non approvati OPPURE approvati ma
        // non visibili. Limit 10 per non gonfiare il prompt.
        const r = await client.query(
          `SELECT id, name, is_approved AS "isApproved", is_active AS "isActive"
           FROM businesses
           WHERE is_approved = false OR is_active = false
           ORDER BY is_approved ASC, created_at DESC
           LIMIT 10`,
        );
        result.actionableBusinesses = (r.rows as BusinessRef[]).map((b) => ({
          id: String(b.id),
          name: String(b.name),
          isApproved: !!b.isApproved,
          isActive: !!b.isActive,
        }));
      } catch { /* sorgente opzionale */ }
      try {
        const r = await client.query(
          `SELECT ota_version, published_at FROM ota_releases
           WHERE status = 'approved' AND channel = 'production'
           ORDER BY published_at DESC LIMIT 1`,
        );
        if (r.rows[0]) {
          result.lastOtaVersion = r.rows[0].ota_version ?? null;
          const pub = r.rows[0].published_at;
          result.lastOtaPublishedAt = pub ? new Date(pub).toISOString() : null;
        }
      } catch { /* sorgente opzionale */ }
    }, { critical: false });
  } catch {
    /* bg-db kill-switch / overflow: lasciamo i null, lo snapshot resta parziale */
  }
  return result;
}

async function loadThinkCentreStatus(): Promise<AdminSnapshot["thinkCentre"]> {
  try {
    const setting = await storage.getAppSetting(PROBE_LOG_SNAPSHOT_KEY);
    if (!setting?.valueJson || typeof setting.valueJson !== "object") return [];
    const snapshot = setting.valueJson as Record<string, ProbeLogEntry[]>;
    const out: AdminSnapshot["thinkCentre"] = [];
    for (const [service, entries] of Object.entries(snapshot)) {
      const latest = Array.isArray(entries) ? entries[0] : undefined;
      if (!latest) continue;
      const ageMin = typeof latest.timestamp === "number"
        ? Math.round((Date.now() - latest.timestamp) / 60000)
        : null;
      out.push({ service, ok: !!latest.ok, ageMin });
    }
    return out.slice(0, 12);
  } catch {
    return [];
  }
}

function formatSnapshot(snap: AdminSnapshot): string {
  const lines: string[] = [];
  lines.push(
    snap.activeUsers24h != null
      ? `- Utenti attivi (login ultime 24h, esclusi fake/staff): ${snap.activeUsers24h}`
      : "- Utenti attivi (24h): dato non disponibile",
  );
  if (snap.businessApproved != null) {
    lines.push(
      `- Business: ${snap.businessApproved} approvati, ${snap.businessPending ?? 0} in attesa, ${snap.businessActive ?? 0} attivi (visibili)`,
    );
  } else {
    lines.push("- Business: dato non disponibile");
  }
  if (snap.actionableBusinesses.length > 0) {
    lines.push("- Business su cui puoi agire (usa questi ID nelle azioni):");
    for (const b of snap.actionableBusinesses) {
      const stato = !b.isApproved
        ? "in attesa di approvazione"
        : (!b.isActive ? "approvato ma nascosto" : "attivo");
      lines.push(`    · id=${b.id} "${b.name}" — ${stato}`);
    }
  } else {
    lines.push("- Business su cui agire: nessuno (tutti approvati e visibili)");
  }
  if (snap.lastOtaVersion) {
    const when = snap.lastOtaPublishedAt
      ? new Date(snap.lastOtaPublishedAt).toLocaleString("it-IT")
      : "data sconosciuta";
    lines.push(`- Ultima OTA approvata (production): ${snap.lastOtaVersion} — pubblicata ${when}`);
  } else {
    lines.push("- Ultima OTA approvata (production): nessuna trovata");
  }
  if (snap.thinkCentre.length > 0) {
    const parts = snap.thinkCentre.map((s) => {
      const age = s.ageMin != null ? `${s.ageMin}min fa` : "età sconosciuta";
      return `${s.service}=${s.ok ? "OK" : "KO"} (${age})`;
    });
    lines.push(`- Servizi self-hosted (ThinkCentre, ultimo probe): ${parts.join(", ")}`);
  } else {
    lines.push("- Servizi self-hosted (ThinkCentre): nessun probe recente disponibile");
  }
  return lines.join("\n");
}

/**
 * Compone lo snapshot admin formattato da iniettare nel system prompt.
 * Best-effort: ogni sorgente fallita degrada a "dato non disponibile" senza
 * far fallire l'intera composizione.
 */
export async function buildAdminContextSnapshot(): Promise<string> {
  const [dbStats, thinkCentre] = await Promise.all([
    loadDbStats(),
    loadThinkCentreStatus(),
  ]);
  const snap: AdminSnapshot = { ...dbStats, thinkCentre };
  const generatedAt = new Date().toLocaleString("it-IT");
  return `Snapshot generato il ${generatedAt}.\n${formatSnapshot(snap)}`;
}
