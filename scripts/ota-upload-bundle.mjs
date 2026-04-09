#!/usr/bin/env node
import { Client } from "@replit/object-storage";
import { readFileSync } from "fs";

const [, , bundlePath, version] = process.argv;
if (!bundlePath || !version) {
  console.error("Uso: node ota-upload-bundle.mjs <bundlePath> <version>");
  process.exit(1);
}

const client = new Client();
const filename = `ota-${version}-${Date.now()}.js`;
const objectPath = `private/ota/${filename}`;

const buffer = readFileSync(bundlePath);
const result = await client.uploadFromBytes(objectPath, buffer, {
  headers: { "Content-Type": "application/javascript" },
});

if (!result.ok) {
  console.error("Upload fallito:", result.error?.message);
  process.exit(1);
}

process.stdout.write(JSON.stringify({ url: objectPath, filename }));
