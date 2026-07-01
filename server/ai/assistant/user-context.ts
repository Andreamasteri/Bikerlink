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
      // Latenza (Task #5327): le tre sorgenti (profilo, ultimi giri, proposte
      // attive) sono raccolte in UN SOLO round-trip via sub-select correlate.
      // Un singolo client pg serializza comunque le query concorrenti sulla
      // stessa connessione, quindi Promise.all non ridurrebbe la latenza —
      // una query combinata sì (un round-trip invece di tre) e non consuma
      // slot bg aggiuntivi. Best-effort: se la query fallisce, resta tutto null.
      const r = await client.query(
        `SELECT
           (SELECT row_to_json(u) FROM (
              SELECT nickname, user_type, region FROM users WHERE id = $1 LIMIT 1
           ) u) AS profile,
           (SELECT COALESCE(json_agg(rt), '[]'::json) FROM (
              SELECT title, total_distance_km, started_at
              FROM routes
              WHERE user_id = $1 AND status = 'active'
              ORDER BY started_at DESC LIMIT 3
           ) rt) AS routes,
           (SELECT COUNT(*)::int FROM proposals
              WHERE user_id = $1 AND status = 'active') AS proposals`,
        [userId],
      );

      const row = r.rows[0];
      if (row) {
        const profile = row.profile as { nickname?: string | null; user_type?: string | null; region?: string | null } | null;
        if (profile) {
          data.nickname = profile.nickname ?? null;
          data.userType = profile.user_type ?? null;
          data.region = profile.region ?? null;
        }
        const routes = (row.routes ?? []) as Array<{ title?: string | null; total_distance_km?: number | null; started_at?: string | null }>;
        data.recentRoutes = routes.map((rt) => ({
          title: rt.title ?? null,
          distanceKm: rt.total_distance_km != null ? Math.round(rt.total_distance_km) : null,
          date: rt.started_at ? new Date(rt.started_at).toLocaleDateString("it-IT") : "?",
        }));
        data.activeProposalsCount = row.proposals ?? 0;
      }
    }, { critical: false });
  } catch { /* bg-db overflow o query fallita: lascia tutto null */ }

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
