-- AlterTable
ALTER TABLE "RagDocument" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "Rope" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fromPanel" TEXT NOT NULL,
    "toPanel" TEXT NOT NULL,
    "fromSessionId" TEXT NOT NULL,
    "toSessionId" TEXT NOT NULL,
    "hopLimit" INTEGER NOT NULL DEFAULT 5,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "A2AMessage" (
    "id" TEXT NOT NULL,
    "ropeId" TEXT NOT NULL,
    "fromPanel" TEXT NOT NULL,
    "hopCount" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "contentPreview" TEXT NOT NULL,
    "delivered" BOOLEAN NOT NULL DEFAULT false,
    "skipReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "A2AMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Rope_userId_active_idx" ON "Rope"("userId", "active");

-- CreateIndex
CREATE INDEX "Rope_fromSessionId_idx" ON "Rope"("fromSessionId");

-- CreateIndex
CREATE INDEX "A2AMessage_ropeId_createdAt_idx" ON "A2AMessage"("ropeId", "createdAt");

-- AddForeignKey
ALTER TABLE "Rope" ADD CONSTRAINT "Rope_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "A2AMessage" ADD CONSTRAINT "A2AMessage_ropeId_fkey" FOREIGN KEY ("ropeId") REFERENCES "Rope"("id") ON DELETE CASCADE ON UPDATE CASCADE;
