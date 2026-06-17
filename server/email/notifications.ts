import { storage } from "../storage";
import { sendEmail } from "../email";
import { escapeHtml } from "./templates";

export async function sendNewUserNotificationEmail(user: {
  nickname: string;
  email: string;
  phone?: string | null;
  userType?: string | null;
  sex?: string | null;
  birthYear?: number | null;
  region?: string | null;
  country?: string | null;
}, invitationCode?: string | null): Promise<boolean> {
  const adminEmail = "bikerlinkapp@gmail.com";
  const now = new Date();
  const registrationTime = now.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Europe/Rome",
  });

  const rows = [
    ["Nickname", escapeHtml(user.nickname)],
    ["Email", escapeHtml(user.email)],
    ["Telefono", user.phone ? escapeHtml(user.phone) : "—"],
    ["Tipo utente", user.userType ? escapeHtml(user.userType) : "—"],
    ["Sesso", user.sex ? escapeHtml(user.sex) : "—"],
    ["Anno di nascita", user.birthYear ? String(user.birthYear) : "—"],
    ["Regione", user.region ? escapeHtml(user.region) : "—"],
    ["Paese", user.country ? escapeHtml(user.country) : "—"],
    ["Data/ora registrazione", escapeHtml(registrationTime)],
    ["Codice invito/promo", invitationCode ? escapeHtml(invitationCode) : "—"],
  ];

  const tableRows = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:8px 12px;color:#aaa;white-space:nowrap;font-size:14px;">${label}</td><td style="padding:8px 12px;color:#fff;font-size:14px;">${value}</td></tr>`
    )
    .join("");

  const subject = `[BikerLink] Nuova registrazione: ${user.nickname}`;
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;padding:20px;">
      <div style="text-align:center;margin-bottom:24px;">
        <h1 style="color:#FF6B35;margin:0;font-size:26px;">🏍️ BikerLink</h1>
        <p style="color:#888;font-size:13px;margin-top:4px;">Notifica nuova registrazione</p>
      </div>
      <div style="background:#1a1a2e;border-radius:12px;padding:24px;color:#fff;">
        <h2 style="margin-top:0;font-size:18px;color:#FF6B35;">Nuovo utente registrato</h2>
        <table style="width:100%;border-collapse:collapse;">
          ${tableRows}
        </table>
      </div>
      <p style="text-align:center;color:#666;font-size:11px;margin-top:16px;">
        © ${now.getFullYear()} BikerLink — notifica automatica
      </p>
    </div>
  `;

  return sendEmail(adminEmail, subject, html);
}

export async function sendNewEventNotificationEmail(evt: {
  title: string;
  eventType: string;
  eventDate: string;
  locationName?: string | null;
  creatorNickname: string;
}): Promise<void> {
  const adminEmail = "bikerlinkapp@gmail.com";
  const now = new Date();
  const createdAt = now.toLocaleString("it-IT", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome",
  });

  const typeLabels: Record<string, string> = {
    raduno: "Raduno", uscita_gruppo: "Uscita di gruppo", festa: "Festa", gara: "Gara", altro: "Altro",
  };

  const rows = [
    ["Titolo", escapeHtml(evt.title)],
    ["Tipo", typeLabels[evt.eventType] ?? escapeHtml(evt.eventType)],
    ["Data evento", escapeHtml(evt.eventDate)],
    ["Luogo", evt.locationName ? escapeHtml(evt.locationName) : "—"],
    ["Organizzatore", escapeHtml(evt.creatorNickname)],
    ["Creato il", escapeHtml(createdAt)],
  ];

  const tableRows = rows
    .map(([label, value]) =>
      `<tr><td style="padding:8px 12px;color:#aaa;white-space:nowrap;font-size:14px;">${label}</td><td style="padding:8px 12px;color:#fff;font-size:14px;">${value}</td></tr>`
    )
    .join("");

  const subject = `[BikerLink] Nuovo evento: ${evt.title}`;
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;padding:20px;">
      <div style="text-align:center;margin-bottom:24px;">
        <h1 style="color:#FF6B35;margin:0;font-size:26px;">🏍️ BikerLink</h1>
        <p style="color:#888;font-size:13px;margin-top:4px;">Nuovo evento creato e pubblicato</p>
      </div>
      <div style="background:#1a1a2e;border-radius:12px;padding:24px;color:#fff;">
        <h2 style="margin-top:0;font-size:18px;color:#FF6B35;">📅 Nuovo Evento Pubblicato</h2>
        <table style="width:100%;border-collapse:collapse;">
          ${tableRows}
        </table>
      </div>
      <p style="text-align:center;color:#666;font-size:11px;margin-top:16px;">
        © ${now.getFullYear()} BikerLink — notifica automatica
      </p>
    </div>
  `;

  try {
    const allUsers = await storage.getAllUsers();
    const adminModEmails = allUsers
      .filter((u) => (u.role === "admin" || u.role === "moderator") && u.email)
      .map((u) => u.email as string);

    const recipients = Array.from(new Set([adminEmail, ...adminModEmails]));
    for (const to of recipients) {
      sendEmail(to, subject, html).catch((e) =>
        console.warn("[EMAIL] sendNewEventNotificationEmail error:", e)
      );
    }
  } catch (err) {
    console.warn("[EMAIL] sendNewEventNotificationEmail fetch users error:", err);
    sendEmail(adminEmail, subject, html).catch(() => {});
  }
}

export async function sendDiagnosticReportEmail(opts: {
  reportId: string;
  userId: string;
  appVersion: string;
  platform: string;
  deviceModel: string;
  triggeredBy: string;
  summary?: Record<string, number> | null;
}): Promise<void> {
  const { reportId, userId, appVersion, platform, deviceModel, triggeredBy, summary } = opts;
  const adminEmail = "bikerlinkapp@gmail.com";
  const now = new Date();
  const sentAt = now.toLocaleString("it-IT", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    timeZone: "Europe/Rome",
  });

  const passed = summary?.passed ?? 0;
  const warned = summary?.warned ?? 0;
  const failed = summary?.failed ?? 0;
  const skipped = summary?.skipped ?? 0;
  const totalTests = summary?.totalTests ?? (passed + warned + failed + skipped);
  const durationMs = summary?.durationMs ?? 0;

  const statusColor = failed > 0 ? "#EF4444" : warned > 0 ? "#F59E0B" : "#22C55E";
  const statusLabel = failed > 0 ? "❌ Con errori" : warned > 0 ? "⚠️ Con avvisi" : "✅ OK";

  const rows = [
    ["ID Report", escapeHtml(reportId)],
    ["Utente ID", escapeHtml(userId)],
    ["Versione App", escapeHtml(appVersion)],
    ["Piattaforma", escapeHtml(platform)],
    ["Dispositivo", escapeHtml(deviceModel)],
    ["Avviata da", escapeHtml(triggeredBy)],
    ["Inviata il", escapeHtml(sentAt)],
    ["Test totali", String(totalTests)],
    ["Durata", `${(durationMs / 1000).toFixed(1)}s`],
  ];

  const tableRows = rows
    .map(([label, value]) =>
      `<tr><td style="padding:8px 12px;color:#aaa;white-space:nowrap;font-size:14px;">${label}</td><td style="padding:8px 12px;color:#fff;font-size:14px;">${value}</td></tr>`
    )
    .join("");

  const subject = `[BikerLink] Diagnostica — ${statusLabel} (${passed} OK · ${warned} ⚠ · ${failed} ✗)`;
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;padding:20px;">
      <div style="text-align:center;margin-bottom:24px;">
        <h1 style="color:#FF6B35;margin:0;font-size:26px;">🏍️ BikerLink</h1>
        <p style="color:#888;font-size:13px;margin-top:4px;">Report Diagnostico</p>
      </div>
      <div style="background:#1a1a2e;border-radius:12px;padding:24px;color:#fff;">
        <h2 style="margin-top:0;font-size:18px;color:${statusColor};">🩺 Diagnostica ${statusLabel}</h2>
        <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
          <span style="background:#14532d;color:#22C55E;padding:6px 12px;border-radius:8px;font-size:14px;font-weight:600;">${passed} OK</span>
          <span style="background:#78350f;color:#F59E0B;padding:6px 12px;border-radius:8px;font-size:14px;font-weight:600;">${warned} avvisi</span>
          <span style="background:#7f1d1d;color:#EF4444;padding:6px 12px;border-radius:8px;font-size:14px;font-weight:600;">${failed} errori</span>
          ${skipped > 0 ? `<span style="background:#1f2937;color:#6B7280;padding:6px 12px;border-radius:8px;font-size:14px;font-weight:600;">${skipped} skip</span>` : ""}
        </div>
        <table style="width:100%;border-collapse:collapse;">
          ${tableRows}
        </table>
      </div>
      <p style="text-align:center;color:#666;font-size:11px;margin-top:16px;">
        © ${now.getFullYear()} BikerLink — notifica automatica
      </p>
    </div>
  `;

  sendEmail(adminEmail, subject, html).catch((e) =>
    console.warn("[EMAIL] sendDiagnosticReportEmail error:", e)
  );
}

export interface OtaStuckAlertResult {
  sent: string[];
  failed: string[];
}

export async function sendOtaStuckAlertEmail(opts: {
  to: string[];
  eventCount: number;
  uniqueDevices: number;
  threshold: number;
  windowMinutes: number;
  runtimeVersions: Array<{ runtime_version: string | null; count: number }>;
}): Promise<OtaStuckAlertResult> {
  const { to, eventCount, uniqueDevices, threshold, windowMinutes, runtimeVersions } = opts;
  const now = new Date();

  const rvRows = runtimeVersions
    .map(
      (rv) =>
        `<tr><td style="padding:6px 12px;color:#aaa;font-size:13px;">${escapeHtml(rv.runtime_version ?? "unknown")}</td><td style="padding:6px 12px;color:#fff;font-size:13px;">${rv.count} eventi</td></tr>`
    )
    .join("");

  const subject = `[BikerLink] ⚠️ OTA Stuck Spike: ${eventCount} eventi in ${windowMinutes} min`;
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;padding:20px;">
      <div style="text-align:center;margin-bottom:24px;">
        <h1 style="color:#FF6B35;margin:0;font-size:26px;">🏍️ BikerLink</h1>
        <p style="color:#888;font-size:13px;margin-top:4px;">Alert automatico — OTA Circuit Breaker</p>
      </div>
      <div style="background:#1a1a2e;border-radius:12px;padding:24px;color:#fff;">
        <h2 style="margin-top:0;font-size:18px;color:#FF6B35;">⚠️ Spike OTA stuck-state rilevato</h2>
        <p style="color:#ccc;font-size:14px;line-height:1.6;">
          Il sistema ha rilevato <strong style="color:#FF6B35;">${eventCount} eventi</strong> di stuck-state
          negli ultimi <strong>${windowMinutes} minuti</strong>,
          su <strong>${uniqueDevices} dispositivi</strong> distinti.<br/>
          La soglia configurata è <strong>${threshold} eventi</strong>.
        </p>
        <table style="width:100%;border-collapse:collapse;margin-top:16px;">
          <tr>
            <th style="text-align:left;padding:6px 12px;color:#FF6B35;font-size:13px;border-bottom:1px solid #333;">Runtime Version</th>
            <th style="text-align:left;padding:6px 12px;color:#FF6B35;font-size:13px;border-bottom:1px solid #333;">Occorrenze</th>
          </tr>
          ${rvRows || `<tr><td colspan="2" style="padding:6px 12px;color:#888;font-size:13px;">Nessun breakdown disponibile</td></tr>`}
        </table>
        <p style="color:#999;font-size:12px;margin-top:20px;">
          Rilevato il ${now.toLocaleString("it-IT", { timeZone: "Europe/Rome" })} (Europe/Rome)<br/>
          Puoi modificare la soglia di alert nel pannello Admin → Impostazioni (chiave: <code>ota_stuck_alert_threshold</code>).
        </p>
      </div>
      <p style="text-align:center;color:#666;font-size:11px;margin-top:16px;">
        © ${now.getFullYear()} BikerLink — notifica automatica
      </p>
    </div>
  `;

  const results = await Promise.all(
    to.map(async (recipient) => {
      const ok = await sendEmail(recipient, subject, html);
      return { recipient, ok };
    })
  );

  const sent = results.filter((r) => r.ok).map((r) => r.recipient);
  const failed = results.filter((r) => !r.ok).map((r) => r.recipient);

  if (failed.length > 0) {
    console.warn(`[OTA-STUCK-ALERT] Invio fallito per ${failed.length} destinatari: ${failed.join(", ")}`);
  }

  return { sent, failed };
}
