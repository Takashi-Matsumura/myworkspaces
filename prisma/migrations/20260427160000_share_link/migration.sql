-- Phase E-C-3: 署名付き共有 URL の永続化。
-- /share/<token> で公開閲覧 (Cookie 不要)。同一 (userId, workspaceId, relativePath)
-- への 2 回目の発行は upsert で対応 (token は維持)。

-- CreateTable
CREATE TABLE "ShareLink" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "relativePath" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShareLink_token_key" ON "ShareLink"("token");
CREATE UNIQUE INDEX "ShareLink_userId_workspaceId_relativePath_key"
  ON "ShareLink"("userId", "workspaceId", "relativePath");
CREATE INDEX "ShareLink_userId_idx" ON "ShareLink"("userId");
CREATE INDEX "ShareLink_token_idx" ON "ShareLink"("token");

-- AddForeignKey
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
