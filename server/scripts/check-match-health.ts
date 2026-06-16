import { pool } from "../db";
import { captureSchemaSnapshot, loadSchemaSnapshot, diffSchemas, saveSchemaSnapshot } from "./snapshot-schema";

const MATCH_TYPES: Array<{
  id: number;
  key: string;
  label: string;
  table: string;
  filter: string;
  prefColumn: string;
}> = [
  {
    id: 1,
    key: "bikerBikerBrand",
    label: "Biker-Biker Brand",
    table: "biker_biker_matches",
    filter: "motorcycle_brand NOT LIKE '%:%' AND motorcycle_brand NOT IN ('musica','musica_zav','distanza','distanza_zav','eventi') AND motorcycle_brand NOT LIKE 'gps_%' AND motorcycle_brand NOT LIKE 'zona_%'",
    prefColumn: "biker_biker_brand",
  },
  {
    id: 2,
    key: "bikerZavorrinaBrand",
    label: "Biker-Zavorrina Brand",
    table: "biker_zavorrina_matches",
    filter: "1=1",
    prefColumn: "biker_zavorrina_brand",
  },
  {
    id: 3,
    key: "bikerClubBrand",
    label: "Biker-Club Brand",
    table: "biker_biker_matches",
    filter: "motorcycle_brand LIKE 'club:%' AND motorcycle_brand NOT LIKE 'club_zav:%'",
    prefColumn: "biker_club_brand",
  },
  {
    id: 4,
    key: "zavorrinaClubBrand",
    label: "Zavorrina-Club Brand",
    table: "biker_biker_matches",
    filter: "motorcycle_brand LIKE 'club_zav:%'",
    prefColumn: "zavorrina_club_brand",
  },
  {
    id: 5,
    key: "bikerBikerTypeStyle",
    label: "Biker-Biker Type+Style",
    table: "biker_biker_matches",
    filter: "motorcycle_brand LIKE 'tipo:%' AND motorcycle_brand NOT LIKE 'tipo_zav:%'",
    prefColumn: "biker_biker_type_style",
  },
  {
    id: 6,
    key: "bikerZavorrinaTypeStyle",
    label: "Biker-Zavorrina Type+Style",
    table: "biker_biker_matches",
    filter: "motorcycle_brand LIKE 'tipo_zav:%'",
    prefColumn: "biker_zavorrina_type_style",
  },
  {
    id: 7,
    key: "bikerBikerDistance",
    label: "Biker-Biker Distance",
    table: "biker_biker_matches",
    filter: "motorcycle_brand = 'distanza'",
    prefColumn: "biker_biker_distance",
  },
  {
    id: 8,
    key: "bikerZavorrinaDistance",
    label: "Biker-Zavorrina Distance",
    table: "biker_biker_matches",
    filter: "motorcycle_brand = 'distanza_zav'",
    prefColumn: "biker_zavorrina_distance",
  },
  {
    id: 9,
    key: "bikerBikerMusic",
    label: "Biker-Biker Music Affinity",
    table: "biker_biker_matches",
    filter: "motorcycle_brand = 'musica'",
    prefColumn: "biker_biker_music",
  },
  {
    id: 10,
    key: "bikerZavorrinaMusic",
    label: "Biker-Zavorrina Music Affinity",
    table: "biker_biker_matches",
    filter: "motorcycle_brand = 'musica_zav'",
    prefColumn: "biker_zavorrina_music",
  },
  {
    id: 11,
    key: "bikerBikerLeanAngle",
    label: "Biker-Biker Lean Angle (GPS)",
    table: "biker_biker_matches",
    filter: "motorcycle_brand IN ('gps_tilt', 'gps_full')",
    prefColumn: "biker_biker_lean_angle",
  },
  {
    id: 12,
    key: "bikerBikerRouteTypeZone",
    label: "Biker-Biker Route Type+Zone",
    table: "biker_biker_matches",
    filter: "motorcycle_brand LIKE 'zona_bb:%'",
    prefColumn: "biker_biker_route_type_zone",
  },
  {
    id: 13,
    key: "bikerZavorrinaRouteTypeZone",
    label: "Biker-Zavorrina Route Type+Zone",
    table: "biker_biker_matches",
    filter: "motorcycle_brand LIKE 'zona_zav:%'",
    prefColumn: "biker_zavorrina_route_type_zone",
  },
  {
    id: 14,
    key: "bikerBikerAvgSpeed",
    label: "Biker-Biker Avg Speed (GPS)",
    table: "biker_biker_matches",
    filter: "motorcycle_brand IN ('gps_speed', 'gps_full')",
    prefColumn: "biker_biker_avg_speed",
  },
  {
    id: 15,
    key: "bikerBikerAvgDuration",
    label: "Biker-Biker Avg Duration (GPS)",
    table: "biker_biker_matches",
    filter: "motorcycle_brand IN ('gps_speed', 'gps_full')",
    prefColumn: "biker_biker_avg_duration",
  },
  {
    id: 16,
    key: "bikerBikerDayTime",
    label: "Biker-Biker Day+Time (GPS)",
    table: "biker_biker_matches",
    filter: "motorcycle_brand IN ('gps_day', 'gps_full')",
    prefColumn: "biker_biker_day_time",
  },
  {
    id: 17,
    key: "bikerBikerEvents",
    label: "Biker-Biker Events",
    table: "biker_biker_matches",
    filter: "motorcycle_brand = 'eventi'",
    prefColumn: "biker_biker_events",
  },
];

async function runHealthCheck() {
  const client = await pool.connect();
  const lines: string[] = [];

  const ok: string[] = [];
  const warn: string[] = [];
  const errors: string[] = [];

  try {
    // 1. Schema diff
    const currentSnapshot = await captureSchemaSnapshot();
    const previousSnapshot = loadSchemaSnapshot();
    let schemaDiffSection = "";

    if (!previousSnapshot) {
      warn.push("Schema snapshot non trovato — verrà creato ora (primo avvio)");
      schemaDiffSection = "**WARN**: Nessuno snapshot precedente trovato. Verrà creato al termine del check.";
    } else {
      const diff = diffSchemas(previousSnapshot, currentSnapshot);
      const hasChanges = diff.addedTables.length > 0 || diff.removedTables.length > 0 || diff.modifiedTables.length > 0;

      if (!hasChanges) {
        ok.push("Schema invariato rispetto all'ultimo snapshot");
        schemaDiffSection = "Nessuna modifica rispetto all'ultima esecuzione.";
      } else {
        const parts: string[] = [];
        if (diff.addedTables.length > 0) {
          parts.push(`Tabelle aggiunte: ${diff.addedTables.join(", ")}`);
          warn.push(`Nuove tabelle: ${diff.addedTables.join(", ")}`);
        }
        if (diff.removedTables.length > 0) {
          parts.push(`Tabelle rimosse: ${diff.removedTables.join(", ")}`);
          errors.push(`Tabelle rimosse: ${diff.removedTables.join(", ")}`);
        }
        for (const t of diff.modifiedTables) {
          const sub: string[] = [];
          if (t.addedColumns.length > 0) sub.push(`colonne aggiunte: ${t.addedColumns.join(", ")}`);
          if (t.removedColumns.length > 0) sub.push(`colonne rimosse: ${t.removedColumns.join(", ")}`);
          if (t.changedColumns.length > 0) sub.push(`colonne modificate: ${t.changedColumns.map(c => c.column).join(", ")}`);
          parts.push(`**${t.tableName}**: ${sub.join("; ")}`);
          warn.push(`Schema modificato: ${t.tableName}`);
        }
        schemaDiffSection = parts.join("\n");
      }
      schemaDiffSection += `\n\n_Snapshot precedente: ${previousSnapshot.capturedAt}_`;
    }

    // 2. Match type counts
    const matchCountResults: Array<{ id: number; label: string; count: number; status: "OK" | "WARN" | "ERROR" }> = [];
    for (const mt of MATCH_TYPES) {
      const res = await client.query<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt FROM ${mt.table} WHERE ${mt.filter}`
      );
      const count = parseInt(res.rows[0]?.cnt ?? "0", 10);
      let status: "OK" | "WARN" | "ERROR" = "OK";
      if (count === 0) {
        status = "WARN";
        warn.push(`Tipo ${mt.id} (${mt.key}): 0 match`);
      } else {
        ok.push(`Tipo ${mt.id} (${mt.key}): ${count} match`);
      }
      matchCountResults.push({ id: mt.id, label: mt.label, count, status });
    }

    // 3. Match preferences alignment — compare explicit prefColumn names against DB columns
    const prefCols = await client.query<{ column_name: string }>(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='match_preferences'
      AND column_name NOT IN ('id','user_id','updated_at','direct_match')
      ORDER BY ordinal_position
    `);
    const dbPrefCols = new Set(prefCols.rows.map(r => r.column_name));
    const expectedPrefColumns = MATCH_TYPES.map(mt => mt.prefColumn);

    const missingFromDb = expectedPrefColumns.filter(col => !dbPrefCols.has(col));
    const unknownInDb = [...dbPrefCols].filter(col => !expectedPrefColumns.includes(col));

    let prefAlignSection = "";
    if (missingFromDb.length > 0) {
      prefAlignSection += `**ERROR**: Colonne mancanti in match_preferences: ${missingFromDb.join(", ")}\n`;
      errors.push(`match_preferences manca colonne: ${missingFromDb.join(", ")}`);
    }
    if (unknownInDb.length > 0) {
      prefAlignSection += `**WARN**: Colonne extra in match_preferences: ${unknownInDb.join(", ")}\n`;
      warn.push(`match_preferences ha colonne extra: ${unknownInDb.join(", ")}`);
    }
    if (missingFromDb.length === 0 && unknownInDb.length === 0) {
      prefAlignSection = "OK — match_preferences allineata con i 17 tipi.";
      ok.push("match_preferences allineata");
    }

    // 4. Distance sample — campiona 5 match biker-biker con lat/lng e verifica distanza plausibile (>0)
    const sampleRes = await client.query<{
      b1lat: number | null; b1lng: number | null;
      b2lat: number | null; b2lng: number | null;
    }>(`
      SELECT up1.latitude AS b1lat, up1.longitude AS b1lng,
             up2.latitude AS b2lat, up2.longitude AS b2lng
      FROM biker_biker_matches m
      JOIN user_profiles up1 ON up1.user_id = m.biker1_id
      JOIN user_profiles up2 ON up2.user_id = m.biker2_id
      WHERE up1.latitude IS NOT NULL AND up1.longitude IS NOT NULL
        AND up2.latitude IS NOT NULL AND up2.longitude IS NOT NULL
      ORDER BY RANDOM()
      LIMIT 5
    `);

    let distanceSampleSection = "";
    if (sampleRes.rows.length === 0) {
      distanceSampleSection = "**WARN**: Nessun match con coordinate GPS trovato per il campione.";
      warn.push("Campione distanza: nessun match con coordinate");
    } else {
      const distances: number[] = [];
      for (const row of sampleRes.rows) {
        if (row.b1lat == null || row.b1lng == null || row.b2lat == null || row.b2lng == null) continue;
        const R = 6371;
        const dLat = ((row.b2lat - row.b1lat) * Math.PI) / 180;
        const dLng = ((row.b2lng - row.b1lng) * Math.PI) / 180;
        const a = Math.sin(dLat / 2) ** 2 +
          Math.cos((row.b1lat * Math.PI) / 180) * Math.cos((row.b2lat * Math.PI) / 180) *
          Math.sin(dLng / 2) ** 2;
        const d = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        distances.push(Math.round(d));
      }
      const allPlausible = distances.every(d => d > 0);
      if (allPlausible && distances.length > 0) {
        distanceSampleSection = `OK — ${distances.length} campioni: ${distances.map(d => d + "km").join(", ")} (Haversine, tutti >0)`;
        ok.push(`Distanze plausibili: ${distances.join(", ")}km`);
      } else {
        distanceSampleSection = `**WARN**: Alcune distanze non plausibili (devono essere >0): ${distances.join(", ")}km`;
        warn.push("Distanze campione non tutte >0km");
      }
    }

    // 5. Admin gate — verifica flag auto_matching_enabled
    const gateRes = await client.query<{ value: string | null }>(`
      SELECT value FROM app_settings WHERE key = 'auto_matching_enabled' LIMIT 1
    `);
    let adminGateSection = "";
    if (gateRes.rows.length === 0) {
      adminGateSection = "**WARN**: Chiave 'auto_matching_enabled' non trovata in app_settings. Il matching potrebbe essere in stato indeterminato.";
      warn.push("admin gate 'auto_matching_enabled' non trovata");
    } else {
      const val = gateRes.rows[0].value ?? "true";
      adminGateSection = `OK — auto_matching_enabled = \`${val}\``;
      ok.push(`admin gate: auto_matching_enabled = ${val}`);
    }

    // Build report
    const totalTypes = MATCH_TYPES.length;
    const typesWith0 = matchCountResults.filter(m => m.count === 0).length;
    const summary = `| Totale check | ${ok.length + warn.length + errors.length} |
| ✅ OK | ${ok.length} |
| ⚠️ WARN | ${warn.length} |
| ❌ ERROR | ${errors.length} |
| Tipi match con 0 risultati | ${typesWith0}/${totalTypes} |`;

    lines.push("# 🏥 Match Engine Health Check");
    lines.push(`\n_Eseguito il: ${new Date().toISOString()}_\n`);

    lines.push("## Sommario\n");
    lines.push(summary);

    if (errors.length > 0) {
      lines.push("\n### ❌ Errori critici\n");
      for (const e of errors) lines.push(`- ${e}`);
    }
    if (warn.length > 0) {
      lines.push("\n### ⚠️ Avvertimenti\n");
      for (const w of warn) lines.push(`- ${w}`);
    }

    lines.push("\n---\n");

    lines.push("## 1. Schema Check\n");
    lines.push(schemaDiffSection);

    lines.push("\n## 2. Motore di Matching — Conteggi per tipo\n");
    lines.push("| # | Tipo | Conteggio | Stato |");
    lines.push("|---|------|-----------|-------|");
    for (const r of matchCountResults) {
      const icon = r.status === "OK" ? "✅" : r.status === "WARN" ? "⚠️" : "❌";
      lines.push(`| ${r.id} | ${r.label} | ${r.count} | ${icon} |`);
    }

    lines.push("\n## 3. Preferenze Utente (match_preferences)\n");
    lines.push(prefAlignSection);

    lines.push("\n## 4. Campione Distanze\n");
    lines.push(distanceSampleSection);

    lines.push("\n## 5. Admin Gate\n");
    lines.push(adminGateSection);

    const report = lines.join("\n");
    console.log(report);

    await saveSchemaSnapshot();

    return { ok, warn, errors, matchCounts: matchCountResults };
  } finally {
    client.release();
  }
}

runHealthCheck()
  .then(({ errors }) => {
    process.exit(errors.length > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error("Health check failed:", err);
    process.exit(2);
  });
