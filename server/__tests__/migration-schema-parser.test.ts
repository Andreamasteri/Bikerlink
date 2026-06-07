import { describe, it, expect } from "vitest";
import {
  buildMigrationSchema,
  parseCreateBody,
  norm,
} from "../ai/db-integrity/migration-schema-parser";

describe("migration-schema-parser — buildMigrationSchema (table-qualified)", () => {
  it("è table-qualified: una colonna di una tabella NON copre lo stesso nome in un'altra", () => {
    // Questo è il bug del controllo precedente (ricerca token globale): una nuova
    // colonna `status` su `orders` veniva considerata migrata solo perché
    // `status` appariva nel CREATE di `users`. Il parser strutturale deve tenere
    // le colonne separate per tabella.
    const files = [
      `CREATE TABLE "users" (
         "id" varchar PRIMARY KEY,
         "status" varchar NOT NULL
       );`,
      `CREATE TABLE "orders" (
         "id" varchar PRIMARY KEY
       );`,
    ];
    const schema = buildMigrationSchema(files);
    expect(schema.get("users")?.has("status")).toBe(true);
    // `status` esiste in users ma NON in orders → niente falso negativo.
    expect(schema.get("orders")?.has("status")).toBe(false);
    expect(schema.get("orders")?.has("id")).toBe(true);
  });

  it("cattura una colonna aggiunta via ALTER ... ADD COLUMN", () => {
    const files = [
      `CREATE TABLE "users" ("id" varchar PRIMARY KEY);`,
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "marketing_consent" boolean NOT NULL DEFAULT false;`,
    ];
    const schema = buildMigrationSchema(files);
    expect(schema.get("users")?.has("marketing_consent")).toBe(true);
  });

  it("cattura PIÙ ADD COLUMN nello stesso statement (separati da virgola)", () => {
    const files = [
      `CREATE TABLE "route_affinity_matches" ("id" varchar PRIMARY KEY);`,
      `ALTER TABLE route_affinity_matches
         ADD COLUMN IF NOT EXISTS notification_priority varchar(10) NOT NULL DEFAULT 'normal',
         ADD COLUMN IF NOT EXISTS notified_at timestamp NULL,
         ADD COLUMN IF NOT EXISTS archived_at timestamp NULL;`,
    ];
    const cols = buildMigrationSchema(files).get("route_affinity_matches");
    expect(cols?.has("notification_priority")).toBe(true);
    expect(cols?.has("notified_at")).toBe(true);
    expect(cols?.has("archived_at")).toBe(true);
  });

  it("NON scambia una menzione di 'ALTER TABLE' in un commento per DDL reale", () => {
    // Il commento cita "ALTER TABLE manuale": non deve creare una tabella fantasma
    // né impedire il parsing dell'ALTER reale che segue.
    const files = [
      `CREATE TABLE "users" ("id" varchar PRIMARY KEY);`,
      `-- colonna già aggiunta via ALTER TABLE manuale in passato
       ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "flag" boolean DEFAULT false;`,
    ];
    const schema = buildMigrationSchema(files);
    expect(schema.get("users")?.has("flag")).toBe(true);
    expect(schema.has("manuale")).toBe(false);
  });

  it("NON confonde ADD CONSTRAINT con una colonna", () => {
    const files = [
      `CREATE TABLE "a" ("id" varchar PRIMARY KEY);`,
      `ALTER TABLE "a" ADD CONSTRAINT "a_id_fk" FOREIGN KEY ("id") REFERENCES "b"("id");`,
    ];
    const cols = buildMigrationSchema(files).get("a");
    expect(cols?.has("constraint")).toBe(false);
    expect([...(cols ?? [])]).toEqual(["id"]);
  });

  it("applica RENAME e DROP COLUMN nell'ordine documentale", () => {
    const files = [
      `CREATE TABLE "t" ("id" varchar PRIMARY KEY, "old_name" text, "tmp" text);`,
      `ALTER TABLE "t" RENAME COLUMN "old_name" TO "new_name";`,
      `ALTER TABLE "t" DROP COLUMN IF EXISTS "tmp";`,
    ];
    const cols = buildMigrationSchema(files).get("t");
    expect(cols?.has("new_name")).toBe(true);
    expect(cols?.has("old_name")).toBe(false);
    expect(cols?.has("tmp")).toBe(false);
  });

  it("riconosce un ADD COLUMN dentro un blocco DO/EXECUTE", () => {
    const files = [
      `CREATE TABLE "user_profiles" ("id" varchar PRIMARY KEY);`,
      `DO $$ BEGIN
         EXECUTE 'ALTER TABLE user_profiles ADD COLUMN geom geography(Point, 4326)';
       END $$;`,
    ];
    expect(buildMigrationSchema(files).get("user_profiles")?.has("geom")).toBe(true);
  });
});

describe("migration-schema-parser — parseCreateBody", () => {
  it("cattura una colonna che si chiama come una parola riservata ('key')", () => {
    const body = `
      "id" varchar(36) PRIMARY KEY,
      "key" varchar(100) NOT NULL,
      "value" text,
      CONSTRAINT "app_settings_key_unique" UNIQUE("key")
    `;
    const cols = parseCreateBody(body);
    expect(cols).toContain("key");
    expect(cols).toContain("value");
    // Il vincolo CONSTRAINT non è una colonna.
    expect(cols).not.toContain("constraint");
  });

  it("salta le righe di vincolo (PRIMARY/FOREIGN/UNIQUE/CHECK)", () => {
    const body = `
      "id" varchar PRIMARY KEY,
      "a" text,
      PRIMARY KEY ("id"),
      FOREIGN KEY ("a") REFERENCES "x"("id"),
      UNIQUE ("a"),
      CHECK ("a" <> '')
    `;
    expect(parseCreateBody(body)).toEqual(["id", "a"]);
  });
});

describe("migration-schema-parser — norm", () => {
  it("rimuove virgolette, prefisso schema e normalizza in minuscolo", () => {
    expect(norm(`"public"."Users"`)).toBe("users");
    expect(norm(`"Notified_At"`)).toBe("notified_at");
  });
});
