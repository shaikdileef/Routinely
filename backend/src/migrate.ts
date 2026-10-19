import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Backend package root (one level above both src/ and dist/), where prisma/ lives. */
const backendRoot = fileURLToPath(new URL('..', import.meta.url));

/**
 * Applies pending Prisma migrations so the tables always match schema.prisma.
 * Safe to run on every start: already-applied migrations are skipped and data is never reset.
 */
export function applyMigrations(): string {
  let output: string;
  try {
    output = execSync('npx prisma migrate deploy', {
      cwd: backendRoot,
      encoding: 'utf8',
      stdio: 'pipe',
    });
  } catch (err) {
    const { stdout = '', stderr = '' } = err as { stdout?: string; stderr?: string };
    const detail = `${stdout}\n${stderr}`.match(/Error: .*/)?.[0] ?? stderr.trim();
    throw new Error(`Database migration failed. ${detail}`);
  }

  const applied = output.match(/^\s+└─ (\S+)\/$/gm)?.length ?? 0;
  return applied > 0 ? `applied ${applied} new migration(s)` : 'up to date';
}
