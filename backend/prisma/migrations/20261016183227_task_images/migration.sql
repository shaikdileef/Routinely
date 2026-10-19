-- CreateEnum
CREATE TYPE "TaskImageKind" AS ENUM ('BEFORE', 'AFTER');

-- CreateTable
CREATE TABLE "TaskImage" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "kind" "TaskImageKind" NOT NULL,
    "mimeType" VARCHAR(32) NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskImage_taskId_kind_key" ON "TaskImage"("taskId", "kind");

-- AddForeignKey
ALTER TABLE "TaskImage" ADD CONSTRAINT "TaskImage_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
