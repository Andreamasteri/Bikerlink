# Unit-test database isolation

## Rule

The default Vitest projects load
`server/__tests__/setup/unit-environment.ts`, which replaces inherited database
environment variables with an inert loopback URL on port 1.

This guarantees:

- unit tests need no externally supplied `DATABASE_URL`;
- unit tests cannot accidentally contact DEV or production;
- modules may construct `pg`/Drizzle clients during import;
- any unmocked database operation fails locally and visibly.

Tests that genuinely need PostgreSQL belong in a separate integration project
with an explicitly provisioned disposable database. Do not weaken the unit
environment to make integration tests pass.

Comment-only `.test.ts` continuation placeholders are not valid suites. Add
tests to the original suite or create a real new suite before using a
`.test.ts` filename.
