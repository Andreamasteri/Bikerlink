import { Client } from "@replit/object-storage";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";

import { downloadBuffer, uploadBuffer } from "../server/objectStorage";

interface MigrationState {
  version: 1;
  completed: Record<string, { sha256: string; size: number }>;
}

const EXECUTE = process.argv.includes("--execute");
const STATE_PATH = resolve(
  process.env.R2_MIGRATION_STATE_FILE ?? ".r2-migration-state.json"
);
const source = new Client();

function contentTypeFor(name: string): string {
  const types: Record<string, string> = {
    ".avif": "image/avif",
    ".bin": "application/octet-stream",
    ".gz": "application/gzip",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".mp3": "audio/mpeg",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".zip": "application/zip",
  };
  return types[extname(name).toLowerCase()] ?? "application/octet-stream";
}

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function loadState(): MigrationState {
  if (!existsSync(STATE_PATH)) return { version: 1, completed: {} };
  const parsed = JSON.parse(readFileSync(STATE_PATH, "utf8")) as MigrationState;
  if (parsed.version !== 1 || !parsed.completed) {
    throw new Error("File di stato migrazione R2 non valido.");
  }
  return parsed;
}

function saveState(state: MigrationState): void {
  const temporary = `${STATE_PATH}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  renameSync(temporary, STATE_PATH);
}

async function listAllSourceObjects(): Promise<
  Array<{ name: string; size: number }>
> {
  const objects: Array<{ name: string; size: number }> = [];
  let startOffset: string | undefined;

  while (true) {
    const result = await source.list({ maxResults: 1000, startOffset });
    if (!result.ok) {
      throw new Error(`Lista Replit fallita: ${result.error.message}`);
    }
    const page = result.value.filter((item) => item.name !== startOffset);
    for (const item of page) {
      objects.push({ name: item.name, size: 0 });
    }
    if (result.value.length < 1000 || page.length === 0) break;
    startOffset = result.value.at(-1)?.name;
    if (!startOffset) break;
  }

  return objects;
}

async function migrate(): Promise<void> {
  const objects = await listAllSourceObjects();
  const privateCount = objects.filter(
    ({ name }) => name.startsWith("private/") || name.startsWith(".private/")
  ).length;
  console.log(
    JSON.stringify({
      event: "inventory",
      total: objects.length,
      public: objects.length - privateCount,
      private: privateCount,
      execute: EXECUTE,
    })
  );

  if (!EXECUTE) {
    console.log(
      JSON.stringify({
        event: "dry_run_complete",
        next_command:
          "npx tsx scripts/migrate-replit-object-storage-to-r2.ts --execute",
      })
    );
    return;
  }

  const state = loadState();
  let copied = 0;
  let skipped = 0;

  for (const [index, object] of objects.entries()) {
    if (state.completed[object.name]) {
      skipped += 1;
      continue;
    }

    const sourceResult = await source.downloadAsBytes(object.name);
    if (!sourceResult.ok) {
      throw new Error(
        `Download Replit fallito per ${object.name}: ${sourceResult.error.message}`
      );
    }
    const sourceBuffer = Buffer.from(sourceResult.value[0]);
    await uploadBuffer(
      object.name,
      sourceBuffer,
      contentTypeFor(object.name)
    );

    const destinationBuffer = await downloadBuffer(object.name);
    const sourceHash = sha256(sourceBuffer);
    const destinationHash = sha256(destinationBuffer);
    if (
      sourceBuffer.length !== destinationBuffer.length ||
      sourceHash !== destinationHash
    ) {
      throw new Error(`Verifica byte-per-byte fallita per ${object.name}.`);
    }

    state.completed[object.name] = {
      sha256: sourceHash,
      size: sourceBuffer.length,
    };
    saveState(state);
    copied += 1;
    console.log(
      JSON.stringify({
        event: "object_verified",
        index: index + 1,
        total: objects.length,
        name: object.name,
        size: sourceBuffer.length,
      })
    );
  }

  console.log(
    JSON.stringify({
      event: "migration_complete",
      source_total: objects.length,
      verified_total: Object.keys(state.completed).length,
      copied,
      skipped,
      source_deleted: false,
    })
  );
}

migrate().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      event: "migration_failed",
      message: error instanceof Error ? error.message : "Errore sconosciuto",
    })
  );
  process.exitCode = 1;
});
