import { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';
import { resolveTestDatabaseUrl } from './testDb.js';

/** Creates the test database if needed and applies all migrations to it. */
export default async function globalSetup() {
  const testUrl = resolveTestDatabaseUrl();
  const dbName = new URL(testUrl).pathname.replace(/^\//, '');

  const adminUrl = new URL(testUrl);
  adminUrl.pathname = '/postgres';
  const admin = new PrismaClient({ datasourceUrl: adminUrl.toString() });
  try {
    const rows = await admin.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = ${dbName}) AS "exists"`;
    if (!/^[a-zA-Z0-9_]+$/.test(dbName)) throw new Error(`Unsafe database name: ${dbName}`);
    if (!rows[0]?.exists) await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
    // Run tests in a non-UTC server time zone (as on a local install in India), so code that
    // mixes Prisma's UTC timestamps with database time handling is caught.
    await admin.$executeRawUnsafe(`ALTER DATABASE "${dbName}" SET timezone TO 'Asia/Kolkata'`);
  } finally {
    await admin.$disconnect();
  }

  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'inherit',
  });
}
