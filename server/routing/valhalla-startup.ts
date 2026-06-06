/** Valhalla startup validation — fire-and-forget, non blocca il boot. */
export async function validateValhallaStartup(): Promise<void> {
  const valhallaUrl = process.env.VALHALLA_URL?.replace(/\/$/, "") ?? "";
  if (!valhallaUrl) {
    console.warn(
      "[Valhalla] ⚠️  VALHALLA_URL non impostato — engine Valhalla disabilitato. " +
        "Imposta il secret VALHALLA_URL per abilitarlo (vedi infra/valhalla/README.md).",
    );
    return;
  }
  let host = valhallaUrl;
  try { host = new URL(valhallaUrl).host; } catch { /* host grezzo */ }
  console.log(`[Valhalla] Configurato: ${host} — verifica connettività…`);
  try {
    const { getInfo } = await import("./valhalla-client");
    const info = await getInfo();
    if (info.status === "ok") {
      console.log(
        `[Valhalla] ✅ Connesso (versione=${info.version ?? "?"}` +
          `${info.osm_date ? `, OSM ${info.osm_date}` : ""}).`,
      );
    } else {
      console.warn(`[Valhalla] ⚠️  Configurato ma non raggiungibile (status=${info.status}, msg=${info.version ?? "?"}).`);
    }
  } catch (e) {
    console.warn("[Valhalla] ⚠️  Errore verifica connettività:", e instanceof Error ? e.message : String(e));
  }
}
