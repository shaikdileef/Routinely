-- CreateEnum
CREATE TYPE "DeliveryMode" AS ENUM ('LIVE', 'PREVIEW');

-- CreateTable
CREATE TABLE "DeliveryLog" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "reminderId" UUID,
    "channel" "ReminderChannel" NOT NULL,
    "destination" VARCHAR(254) NOT NULL,
    "subject" VARCHAR(300) NOT NULL,
    "body" TEXT NOT NULL,
    "mode" "DeliveryMode" NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "error" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliveryLog_userId_createdAt_idx" ON "DeliveryLog"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "DeliveryLog" ADD CONSTRAINT "DeliveryLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
