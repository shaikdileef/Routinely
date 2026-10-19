-- CreateEnum
CREATE TYPE "ColorTheme" AS ENUM ('LAVENDER', 'OCEAN', 'SUNSET', 'FOREST', 'ROSE', 'AURORA');

-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN     "colorTheme" "ColorTheme" NOT NULL DEFAULT 'LAVENDER';
