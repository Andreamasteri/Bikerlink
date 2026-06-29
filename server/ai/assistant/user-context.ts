// Soluzione 2 — Contesto utente live iniettato nel system prompt ad ogni chiamata.
//
// Fetcha dal DB: profilo base, ultimi 3 giri tracciati, proposte attive.
// Usa withBgDbConnection (slot bg + statement_timeout 5s) per non saturare il pool.
// Best-effort: ogni sorgente è isolata, un fallimento non blocca le altre.
import { withBgDbConnection } from "../../lib/bg-db-limiter";

interface UserLiveData {
  nickname: string | null;
  userType: string | null;
  region: string | null;
  recentRoutes: Array<{ title: string | null; distanceKm: number | null; date: string }>;
  activeProposalsCount: number | null;
}

async function fetchUserData(userId: string): Promise<UserLiveData> {
  const data: UserLiveData = {
    nickname: null,
    userType: null,
    region: null,
    recentRoutes: [],
    activeProposalsCount: null,
  };

  try {
    await withBgDbConnection(async (client) => {
      try {
        const r = await client.query(
          `SELECT nickname, user_type, region FROM users WHERE id = $1 LIMIT 1`,
          [userId],
        );
        if (r.rows[0]) {
          data.nickname = r.rows[0].nickname ?? null;
          data.userType = r.rows[0].user_type ?? null;
          data.region = r.rows[0].region ?? null;
        }
      } catch { /* sorgente opzionale */ }

      try {
        const r = await client.query(
          `SELECT title, total_distance_km, started_at
           FROM routes
           WHERE user_id = $1 AND status = 'active'
           ORDER BY started_at DESC LIMIT 3`,
          [userId],
        );
        data.recentRoutes = r.rows.map((row) => ({
          title: row.title ?? null,
          distanceKm: row.total_distance_km != null ? Math.round(row.total_distance_km) : null,
          date: row.started_at ? new Date(row.started_at).toLocaleDateString("it-IT") : "?",
        }));
      } catch { /* sorgente opzionale */ }

      try {
        const r = await client.query(
          `SELECT COUNT(*)::int AS c FROM proposals
           WHERE user_id = $1 AND status = 'active'`,
          [userId],
        );
        data.activeProposalsCount = r.rows[0]?.c ?? 0;
      } catch { /* sorgente opzionale */ }
    }, { critical: false });
  } catch { /* bg-db overflow: lascia tutto null */ }

  return data;
}

function formatUserContext(data: UserLiveData): string {
  const lines: string[] = ["[PROFILO UTENTE CORRENTE]"];

  if (data.nickname) lines.push(`- Nickname: ${data.nickname}`);
  if (data.userType) lines.push(`- Tipo: ${data.userType}`);
  if (data.region) lines.push(`- Regione: ${data.region}`);

  if (data.recentRoutes.length > 0) {
    lines.push("- Ultimi giri registrati:");
    for (const r of data.recentRoutes) {
      const title = r.title ?? "(senza titolo)";
      const dist = r.distanceKm != null ? ` — ${r.distanceKm} km` : "";
      lines.push(`    · ${r.date}: ${title}${dist}`);
    }
  } else {
    lines.push("- Ultimi giri registrati: nessuno");
  }

  if (data.activeProposalsCount != null) {
    lines.push(`- Proposte attive: ${data.activeProposalsCount}`);
  }

  return lines.join("\n");
}

/**
 * Compone il contesto live dell'utente da iniettare nel system prompt.
 * Ritorna stringa vuota se userId è assente o tutte le query falliscono.
 */
export async function fetchUserLiveContext(userId: string | null | undefined): Promise<string> {
  if (!userId) return "";
  try {
    const data = await fetchUserData(userId);
    if (!data.nickname && data.recentRoutes.length === 0 && data.activeProposalsCount == null) {
      return "";
    }
    return formatUserContext(data);
  } catch {
    return "";
  }
}
