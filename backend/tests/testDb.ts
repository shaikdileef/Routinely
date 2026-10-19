import 'dotenv/config';

/**
 * Resolves the test database URL and refuses to run against anything that does
 * not look like a dedicated test database, because the suite truncates tables.
 */
export function resolveTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL is not set. Add it to backend/.env (see backend/.env.example).',
    );
  }
  const dbName = new URL(url).pathname.replace(/^\//, '');
  const mainUrl = process.env.MAIN_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!/test/i.test(dbName) || url === mainUrl) {
    throw new Error(
      `Refusing to run tests against "${dbName}": TEST_DATABASE_URL must point at a separate *test* database.`,
    );
  }
  return url;
}
