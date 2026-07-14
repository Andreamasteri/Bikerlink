/**
 * checklist.ts — sezione 3: checklist deterministica chiusa (a–f). READ-ONLY.
 */
import type { Pool } from "pg";
import { countAndExamples, type Actions, type Ctx } from "./shared";

export async function renderChecklist(pool: Pool, ctx: Ctx, actions: Actions): Promise<string[]> {
  const out: string[] = [];
  const w = (s = "") => out.push(s);
  const ce = (t: string, where: string, cols: string) => countAndExamples(pool, ctx.rowCounts, t, where, cols);

  w(`## 3. Check logici e range (checklist deterministica chiusa)`);
  w();
  w(`Elenco fisso di controlli (a–f). Nessun check al di fuori di questo elenco. Per ciascuno: conteggio + fino a 5 esempi.`);
  w();
  w(`> ⚠️ **Confidenza limitata:** i check girano solo sulle tabelle popolate del DB dev (quasi tutte a 0 righe). Un esito "0 violazioni" qui NON garantisce assenza di anomalie in prod: significa solo che i pochi dati dev sono puliti. Le colonne/entità ispezionate sono elencate per rendere esplicita la copertura.`);
  w();

  // (a) coordinate fuori range
  w(`### (a) Coordinate fuori range`);
  w();
  w(`Latitudine ∉ [-90, 90] o longitudine ∉ [-180, 180]. Colonne \`double precision\` con nome lat/lon (incluse le coordinate "fuzz/fake" della privacy, che restano valori geografici validi).`);
  w();
  const latCols = ctx.allCols.filter(
    (c) => c.data_type === "double precision" && /(latitude$|(^|_)lat$|center_lat$)/i.test(c.column_name),
  );
  const lonCols = ctx.allCols.filter(
    (c) => c.data_type === "double precision" && /(longitude$|(^|_)lon$|(^|_)lng$|center_lon$)/i.test(c.column_name),
  );
  const coordRows: string[] = [];
  let coordViol = 0;
  for (const c of latCols) {
    const { cnt, examples } = await ce(c.table_name, `"${c.column_name}" IS NOT NULL AND ("${c.column_name}" < -90 OR "${c.column_name}" > 90)`, `"${c.column_name}" v`);
    if (cnt > 0) {
      coordViol += cnt;
      coordRows.push(`| \`${c.table_name}.${c.column_name}\` | lat | ${cnt} | ${examples.map((e) => "`" + e.v + "`").join(", ")} |`);
      actions.blocking.push(`Coordinate: \`${c.table_name}.${c.column_name}\` ha ${cnt} latitudini fuori range.`);
    }
  }
  for (const c of lonCols) {
    const { cnt, examples } = await ce(c.table_name, `"${c.column_name}" IS NOT NULL AND ("${c.column_name}" < -180 OR "${c.column_name}" > 180)`, `"${c.column_name}" v`);
    if (cnt > 0) {
      coordViol += cnt;
      coordRows.push(`| \`${c.table_name}.${c.column_name}\` | lon | ${cnt} | ${examples.map((e) => "`" + e.v + "`").join(", ")} |`);
      actions.blocking.push(`Coordinate: \`${c.table_name}.${c.column_name}\` ha ${cnt} longitudini fuori range.`);
    }
  }
  w(`Colonne ispezionate: ${latCols.length} latitudine, ${lonCols.length} longitudine.`);
  w();
  if (coordRows.length) {
    w(`| Colonna | Tipo | Violazioni | Esempi |`);
    w(`|---|---|---:|---|`);
    for (const r of coordRows) w(r);
  } else {
    w(`✅ Nessuna coordinata fuori range (${coordViol} violazioni).`);
  }
  w();

  // (b) timestamp impossibili
  w(`### (b) Timestamp impossibili`);
  w();
  w(`\`created_at\` nel futuro; \`updated_at\` < \`created_at\`.`);
  w();
  const tsRows: string[] = [];
  let tsViol = 0;
  const hasCol = (t: string, col: string) =>
    (ctx.colsByTable.get(t) ?? []).some((c) => c.column_name === col && /timestamp|date/i.test(c.data_type));
  for (const t of ctx.tableNames) {
    if (hasCol(t, "created_at")) {
      const { cnt, examples } = await ce(t, `created_at IS NOT NULL AND created_at > now()`, `created_at v`);
      if (cnt > 0) {
        tsViol += cnt;
        tsRows.push(`| \`${t}\` | created_at nel futuro | ${cnt} | ${examples.map((e) => "`" + String(e.v).slice(0, 25) + "`").join(", ")} |`);
        actions.important.push(`Timestamp: \`${t}\` ha ${cnt} \`created_at\` nel futuro.`);
      }
    }
    if (hasCol(t, "created_at") && hasCol(t, "updated_at")) {
      const { cnt, examples } = await ce(t, `updated_at IS NOT NULL AND created_at IS NOT NULL AND updated_at < created_at`, `created_at, updated_at`);
      if (cnt > 0) {
        tsViol += cnt;
        tsRows.push(`| \`${t}\` | updated_at < created_at | ${cnt} | ${examples.map((e) => "`" + String(e.updated_at).slice(0, 19) + " < " + String(e.created_at).slice(0, 19) + "`").join(", ")} |`);
        actions.important.push(`Timestamp: \`${t}\` ha ${cnt} righe con \`updated_at\` < \`created_at\`.`);
      }
    }
  }
  if (tsRows.length) {
    w(`| Tabella | Check | Violazioni | Esempi |`);
    w(`|---|---|---:|---|`);
    for (const r of tsRows) w(r);
  } else {
    w(`✅ Nessun timestamp impossibile (${tsViol} violazioni).`);
  }
  w();

  // (c) contatori negativi
  w(`### (c) Contatori negativi`);
  w();
  w(`Colonne numeriche che non dovrebbero mai essere negative (km, distanze, contatori, like, punti, impression, click, ecc.).`);
  w();
  const counterPatt = /(^|_)(km|total_km|distance|distance_km|total_distance_km|followers?|likes?|points?|score|count|views|impressions|clicks|total_rides|easter_eggs_collected|duration_seconds|max_participants|search_radius)($|_)/i;
  const counterCols = ctx.allCols.filter(
    (c) =>
      ["integer", "bigint", "smallint", "numeric", "double precision", "real"].includes(c.data_type) &&
      counterPatt.test(c.column_name) &&
      !/(_g$|gforce|lateral_g|acceleration_g|deceleration_g|tilt|lean|heading|_x$|_y$|_z$|balance|delta|offset|lat|lon|lng)/i.test(c.column_name),
  );
  const cntRows: string[] = [];
  let cntViol = 0;
  for (const c of counterCols) {
    const { cnt, examples } = await ce(c.table_name, `"${c.column_name}" IS NOT NULL AND "${c.column_name}" < 0`, `"${c.column_name}" v`);
    if (cnt > 0) {
      cntViol += cnt;
      cntRows.push(`| \`${c.table_name}.${c.column_name}\` | ${cnt} | ${examples.map((e) => "`" + e.v + "`").join(", ")} |`);
      actions.important.push(`Contatore negativo: \`${c.table_name}.${c.column_name}\` (${cnt} righe).`);
    }
  }
  w(`Colonne-contatore ispezionate: ${counterCols.length} (\`${counterCols.slice(0, 30).map((c) => c.table_name + "." + c.column_name).join("`, `")}\`${counterCols.length > 30 ? ", …" : ""}).`);
  w();
  if (cntRows.length) {
    w(`| Colonna | Violazioni | Esempi |`);
    w(`|---|---:|---|`);
    for (const r of cntRows) w(r);
  } else {
    w(`✅ Nessun contatore negativo (${cntViol} violazioni).`);
  }
  w();

  // (d) entità attive/pubblicate con campi obbligatori NULL/vuoti
  w(`### (d) Entità pubblicate/attive con campi obbligatori NULL o vuoti`);
  w();
  w(`Set curato di controlli domain-specific sulle entità "visibili/attive/pubblicate".`);
  w();
  const dChecks: Array<{ label: string; table: string; where: string; cols: string; sev: "b" | "i" | "c" }> = [
    { label: "utenti `active` senza email", table: "users", where: `status='active' AND (email IS NULL OR email='')`, cols: "id, nickname", sev: "b" },
    { label: "utenti `active` senza nickname", table: "users", where: `status='active' AND (nickname IS NULL OR nickname='')`, cols: "id, email", sev: "i" },
    { label: "profili visibili in mappa (`hide_from_map=false`) senza coordinate condivise", table: "user_profiles", where: `hide_from_map = false AND (latitude IS NULL OR longitude IS NULL)`, cols: "id, user_id", sev: "c" },
    { label: "proposte non-terminali senza owner (`user_id` NULL)", table: "proposals", where: `user_id IS NULL AND status NOT IN ('expired','cancelled','completed')`, cols: "id, status", sev: "b" },
    { label: "proposte senza titolo", table: "proposals", where: `title IS NULL OR title=''`, cols: "id, status", sev: "i" },
    { label: "eventi senza titolo/nome", table: "events", where: `(title IS NULL OR title='')`, cols: "id, status", sev: "i" },
    { label: "moto club attivi senza nome", table: "moto_clubs", where: `(name IS NULL OR name='')`, cols: "id", sev: "i" },
    { label: "business attivi (`is_active`) senza nome", table: "businesses", where: `is_active = true AND (name IS NULL OR name='')`, cols: "id", sev: "i" },
    { label: "workshop senza nome", table: "workshops", where: `(name IS NULL OR name='')`, cols: "id", sev: "i" },
    { label: "campagne ad attive senza immagine e senza link", table: "ad_campaigns", where: `is_active=true AND (image_url IS NULL OR image_url='') AND (link_url IS NULL OR link_url='')`, cols: "id, name", sev: "i" },
    { label: "custom_routes pubbliche senza waypoint", table: "custom_routes", where: `visibility='public' AND NOT EXISTS (SELECT 1 FROM custom_route_waypoints w WHERE w.route_id = custom_routes.id)`, cols: "id, title", sev: "i" },
  ];
  const dRows: string[] = [];
  let dViol = 0;
  for (const chk of dChecks) {
    if (!ctx.colsByTable.has(chk.table)) continue;
    try {
      const { cnt, examples } = await ce(chk.table, chk.where, chk.cols);
      if (cnt > 0) {
        dViol += cnt;
        dRows.push(`| ${chk.label} | \`${chk.table}\` | ${cnt} | ${examples.map((e) => "`" + JSON.stringify(e).slice(0, 50) + "`").join(", ")} |`);
        const bucket = chk.sev === "b" ? actions.blocking : chk.sev === "c" ? actions.cosmetic : actions.important;
        bucket.push(`Campo obbligatorio mancante: ${chk.label} (${cnt}).`);
      }
    } catch (e) {
      dRows.push(`| ${chk.label} | \`${chk.table}\` | n/d (${(e as Error).message.slice(0, 40)}) | |`);
    }
  }
  if (dRows.length) {
    w(`| Check | Tabella | Violazioni | Esempi |`);
    w(`|---|---|---:|---|`);
    for (const r of dRows) w(r);
  } else {
    w(`✅ Nessuna entità attiva con campi obbligatori mancanti (${dViol} violazioni).`);
  }
  w();

  // (e) telemetria/tracce senza GPS
  w(`### (e) Telemetria / tracce senza GPS associato`);
  w();
  const eChecks: Array<{ label: string; table: string; where: string; cols: string }> = [
    { label: "route con `status` ma senza alcun route_point", table: "routes", where: `NOT EXISTS (SELECT 1 FROM route_points rp WHERE rp.route_id = routes.id)`, cols: "id, status" },
    { label: "ride_telemetry con lat/lon NULL", table: "ride_telemetry", where: `lat IS NULL OR lon IS NULL`, cols: "id, session_id" },
    { label: "route_points con lat/lon NULL", table: "route_points", where: `latitude IS NULL OR longitude IS NULL`, cols: "id, route_id" },
    { label: "planned_routes senza waypoints", table: "planned_routes", where: `waypoints IS NULL OR jsonb_array_length(CASE WHEN jsonb_typeof(waypoints::jsonb)='array' THEN waypoints::jsonb ELSE '[]'::jsonb END) = 0`, cols: "id, title" },
  ];
  const eRows: string[] = [];
  let eViol = 0;
  for (const chk of eChecks) {
    if (!ctx.colsByTable.has(chk.table)) continue;
    try {
      const { cnt, examples } = await ce(chk.table, chk.where, chk.cols);
      if (cnt > 0) {
        eViol += cnt;
        eRows.push(`| ${chk.label} | \`${chk.table}\` | ${cnt} | ${examples.map((e) => "`" + JSON.stringify(e).slice(0, 50) + "`").join(", ")} |`);
        actions.important.push(`Telemetria senza GPS: ${chk.label} (${cnt}).`);
      }
    } catch (e) {
      eRows.push(`| ${chk.label} | \`${chk.table}\` | n/d (${(e as Error).message.slice(0, 40)}) | |`);
    }
  }
  if (eRows.length) {
    w(`| Check | Tabella | Violazioni | Esempi |`);
    w(`|---|---|---:|---|`);
    for (const r of eRows) w(r);
  } else {
    w(`✅ Nessuna traccia/telemetria senza GPS (${eViol} violazioni).`);
  }
  w();

  // (f) valori-stato fuori dal set ammesso
  w(`### (f) Valori-stato fuori dal set ammesso`);
  w();
  w(`Poiché il DB ha quasi nessun \`CHECK\` constraint sugli stati, il set ammesso è definito dal codice. Set curato per le tabelle di dominio principali; per le altre colonne-stato viene elencata la distribuzione dei valori presenti (informativa).`);
  w();
  const allowedSets: Record<string, string[]> = {
    "proposals.status": ["active", "matched", "expired", "cancelled", "completed", "pending", "closed"],
    "routes.status": ["recording", "active", "completed", "paused", "stopped", "discarded"],
    "users.status": ["active", "suspended", "banned", "deleted", "pending"],
    "moto_club_members.status": ["active", "pending", "invited", "left", "removed", "banned"],
    "sos_requests.status": ["active", "resolved", "cancelled", "expired"],
    "events.status": ["draft", "published", "active", "cancelled", "completed", "expired"],
    "planned_routes.visibility": ["private", "public", "friends", "unlisted"],
    "custom_routes.visibility": ["private", "public", "friends", "unlisted"],
  };
  const fRows: string[] = [];
  let fViol = 0;
  for (const [key, allowed] of Object.entries(allowedSets)) {
    const [t, col] = key.split(".");
    if (!ctx.colsByTable.get(t)?.some((c) => c.column_name === col)) continue;
    if ((ctx.rowCounts.get(t) ?? 0) <= 0) continue;
    const vals = await pool.query<{ v: string | null; n: string }>(
      `SELECT "${col}" v, count(*) n FROM "${t}" GROUP BY "${col}"`,
    );
    const bad = vals.rows.filter((r) => r.v !== null && !allowed.includes(r.v));
    if (bad.length) {
      const total = bad.reduce((a, b) => a + Number(b.n), 0);
      fViol += total;
      fRows.push(`| \`${key}\` | ${bad.map((b) => "`" + b.v + "`(" + b.n + ")").join(", ")} | set: ${allowed.join(", ")} |`);
      actions.important.push(`Stato fuori set: \`${key}\` → ${bad.map((b) => b.v).join(", ")}.`);
    }
  }
  if (fRows.length) {
    w(`| Colonna | Valori fuori set (conteggio) | Set ammesso |`);
    w(`|---|---|---|`);
    for (const r of fRows) w(r);
  } else {
    w(`✅ Nessun valore-stato fuori dal set ammesso sulle tabelle di dominio curate (${fViol} violazioni).`);
  }
  w();
  const otherStatus = (
    await pool.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema='public' AND column_name IN ('status','state','visibility')
       ORDER BY table_name`,
    )
  ).rows.filter((r) => !allowedSets[`${r.table_name}.${r.column_name}`] && (ctx.rowCounts.get(r.table_name) ?? 0) > 0);
  if (otherStatus.length) {
    w(`<details><summary>Distribuzione valori-stato (colonne non curate, informativo)</summary>`);
    w();
    for (const r of otherStatus) {
      const vals = await pool.query<{ v: string | null; n: string }>(
        `SELECT "${r.column_name}" v, count(*) n FROM "${r.table_name}" GROUP BY "${r.column_name}" ORDER BY count(*) DESC LIMIT 10`,
      );
      w(`- \`${r.table_name}.${r.column_name}\`: ${vals.rows.map((v) => "`" + v.v + "`(" + v.n + ")").join(", ")}`);
    }
    w();
    w(`</details>`);
    w();
  }
  return out;
}
