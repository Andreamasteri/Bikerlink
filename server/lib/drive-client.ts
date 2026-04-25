import { google, drive_v3 } from "googleapis";

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
