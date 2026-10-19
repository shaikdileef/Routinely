import { resolveTestDatabaseUrl } from './testDb.js';

// Runs before each test file's imports, so the app's config sees the test database.
process.env.MAIN_DATABASE_URL ??= process.env.DATABASE_URL;
process.env.DATABASE_URL = resolveTestDatabaseUrl();
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= 'test-only-secret-that-is-long-enough-for-validation';
// Fake Spotify app credentials; tests stub every call to Spotify.
process.env.SPOTIFY_CLIENT_ID = 'test-spotify-client';
process.env.SPOTIFY_CLIENT_SECRET = 'test-spotify-secret';
// Real email/WhatsApp keys in backend/.env must never be used by tests (dotenv won't override these).
for (const key of ['SMTP_USER', 'SMTP_PASS', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN']) {
  process.env[key] = '';
}
