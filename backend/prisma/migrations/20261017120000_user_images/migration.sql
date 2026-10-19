-- Profile photos and app backgrounds share one table, keyed by (userId, kind).

-- CreateEnum
CREATE TYPE "UserImageKind" AS ENUM ('AVATAR', 'BACKGROUND');

-- CreateTable
CREATE TABLE "UserImage" (
    "userId" UUID NOT NULL,
    "kind" "UserImageKind" NOT NULL,
    "mimeType" VARCHAR(32) NOT NULL,
    "data" BYTEA NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserImage_pkey" PRIMARY KEY ("userId","kind")
);

-- AddForeignKey
ALTER TABLE "UserImage" ADD CONSTRAINT "UserImage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep every existing profile photo.
INSERT INTO "UserImage" ("userId", "kind", "mimeType", "data", "updatedAt")
SELECT "userId", 'AVATAR', "mimeType", "data", "updatedAt" FROM "UserAvatar";

-- DropTable
DROP TABLE "UserAvatar";
