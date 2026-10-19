-- The app-background feature was removed; only profile photos remain as user images.

-- Delete stored backgrounds before their enum value goes away.
DELETE FROM "UserImage" WHERE "kind" = 'BACKGROUND';

-- AlterEnum (Postgres cannot drop an enum value, so the type is rebuilt)
BEGIN;
CREATE TYPE "UserImageKind_new" AS ENUM ('AVATAR');
ALTER TABLE "UserImage" ALTER COLUMN "kind" TYPE "UserImageKind_new" USING ("kind"::text::"UserImageKind_new");
ALTER TYPE "UserImageKind" RENAME TO "UserImageKind_old";
ALTER TYPE "UserImageKind_new" RENAME TO "UserImageKind";
DROP TYPE "UserImageKind_old";
COMMIT;
