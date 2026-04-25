import { google, drive_v3 } from "googleapis";
import { db } from "../db";
import { appSettings } from "@shared/schema";
import { eq } from "drizzle-orm";

export const DRIVE_OAUTH_REDIRECT_URI =
  "https://biker-link.replit.app/api/admin/drive/oauth-callback";

let _drive: drive_v3.Drive | null = null;

export function getDriveClient(): drive_v3.Drive {
  if (_drive) return _drive;
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!json) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON non configurato");
  const credentials = JSON.parse(json);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  _drive = google.drive({ version: "v3", auth });
  return _drive;
}

function buildOAuth2Client() {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "GOOGLE_DRIVE_CLIENT_ID o GOOGLE_DRIVE_CLIENT_SECRET non configurati"
    );
  }
  return new google.auth.OAuth2(clientId, clientSecret, DRIVE_OAUTH_REDIRECT_URI);
}

async function getStoredRefreshToken(): Promise<string | null> {
  const rows = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, "google_drive_refresh_token"));
  const row = rows[0];
  if (!row) return null;
  const token = row.value ?? null;
  if (token && token.length > 30) return token;
  if (
    row.valueJson &&
    typeof row.valueJson === "string" &&
    row.valueJson.length > 30
  ) {
    return row.valueJson;
  }
  return null;
}

export async function getDriveUserClient(): Promise<drive_v3.Drive> {
  const refreshToken = await getStoredRefreshToken();
  if (!refreshToken) {
    const err = new Error("GOOGLE_DRIVE_NOT_CONNECTED");
    throw err;
  }
  const oauth2 = buildOAuth2Client();
  oauth2.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: "v3", auth: oauth2 });
}

export function getDriveOAuthUrl(): string {
  const oauth2 = buildOAuth2Client();
  return oauth2.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/drive.file"],
    prompt: "consent",
  });
}

export async function handleDriveOAuthCallback(
  code: string
): Promise<{ email: string | null }> {
  const oauth2 = buildOAuth2Client();
  const { tokens } = await oauth2.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error("Google non ha restituito un refresh_token. Riprova con il pulsante Connetti.");
  }
  await db
    .insert(appSettings)
    .values({
      key: "google_drive_refresh_token",
      value: tokens.refresh_token,
      description: "OAuth2 refresh token Google Drive (bikerlinkapp@gmail.com)",
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [appSettings.key],
      set: { value: tokens.refresh_token, updatedAt: new Date() },
    });

  let email: string | null = null;
  try {
    oauth2.setCredentials(tokens);
    const drv = google.drive({ version: "v3", auth: oauth2 });
    const about = await drv.about.get({ fields: "user" });
    email = about.data.user?.emailAddress ?? null;
  } catch {}
  return { email };
}

export async function getDriveOAuthStatus(): Promise<{
  connected: boolean;
  email: string | null;
}> {
  const refreshToken = await getStoredRefreshToken();
  if (!refreshToken) return { connected: false, email: null };
  try {
    const oauth2 = buildOAuth2Client();
    oauth2.setCredentials({ refresh_token: refreshToken });
    const drv = google.drive({ version: "v3", auth: oauth2 });
    const about = await drv.about.get({ fields: "user" });
    const email = about.data.user?.emailAddress ?? null;
    return { connected: true, email };
  } catch {
    return { connected: false, email: null };
  }
}

export async function disconnectDriveOAuth(): Promise<void> {
  await db
    .insert(appSettings)
    .values({
      key: "google_drive_refresh_token",
      value: "",
      description: "OAuth2 refresh token Google Drive (disconnected)",
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [appSettings.key],
      set: { value: "", valueJson: null, updatedAt: new Date() },
    });
}
