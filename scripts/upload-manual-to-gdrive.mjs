import { ReplitConnectors } from "@replit/connectors-sdk";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function uploadPdfToGoogleDrive(filePath, fileName) {
  const connectors = new ReplitConnectors();

  const pdfBuffer = fs.readFileSync(filePath);
  console.log(`Uploading: ${fileName} (${pdfBuffer.length} bytes)`);

  const metadata = JSON.stringify({ name: fileName, mimeType: "application/pdf" });
  const boundary = "-------314159265358979323846";
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const multipartBody = Buffer.concat([
    Buffer.from(`${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${metadata}`),
    Buffer.from(`${delimiter}Content-Type: application/pdf\r\n\r\n`),
    pdfBuffer,
    Buffer.from(closeDelimiter),
  ]);

  const response = await connectors.proxy(
    "google-drive",
    "/upload/drive/v3/files?uploadType=multipart",
    {
      method: "POST",
      headers: {
        "Content-Type": `multipart/related; boundary="${boundary}"`,
        "Content-Length": multipartBody.length.toString(),
      },
      body: multipartBody,
    }
  );

  const result = await response.json();

  if (result.id) {
    const link = `https://drive.google.com/file/d/${result.id}/view`;
    console.log(`Upload successful!`);
    console.log(`File ID: ${result.id}`);
    console.log(`File link: ${link}`);
    return { id: result.id, link };
  } else {
    console.error("Upload failed:", JSON.stringify(result, null, 2));
    throw new Error("Upload failed");
  }
}

const filePath = path.join(__dirname, "..", "manuale-utente-bikerlink-aprile2026.pdf");
const fileName = "manuale-utente-bikerlink-aprile2026.pdf";

uploadPdfToGoogleDrive(filePath, fileName).catch(console.error);
