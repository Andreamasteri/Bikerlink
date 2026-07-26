// Unit tests must never inherit a developer or production database target.
// The inert loopback endpoint lets modules construct pg/Drizzle clients while
// guaranteeing that an accidental unmocked query fails locally and cannot
// reach an external database.
delete process.env.DATABASE_URL_DEV;
process.env.DATABASE_URL = "postgres://unit-test:unit-test@127.0.0.1:1/unit-test";
