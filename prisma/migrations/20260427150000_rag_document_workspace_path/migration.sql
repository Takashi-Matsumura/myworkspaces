-- Phase E-B-2: RagDocument に workspaceId / relativePath / updatedAt を追加
--
-- 目的:
--   - Biz パネル sync-rag が reports/<file>.md / research/<file>.md を upsert で
--     再取り込みできるよう、(userId, workspaceId, relativePath) 一意制約を新設
--   - updatedAt で「最終 ingest 時刻」を Biz タブに表示
--   - 既存の手動アップロード経路 (/api/rag/upload) は workspaceId / relativePath を
--     NULL のままにする (互換維持)

-- AlterTable
ALTER TABLE "RagDocument"
  ADD COLUMN "workspaceId" TEXT,
  ADD COLUMN "relativePath" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex (composite uniq + updatedAt index)
CREATE UNIQUE INDEX "RagDocument_userId_workspaceId_relativePath_key"
  ON "RagDocument"("userId", "workspaceId", "relativePath");

CREATE INDEX "RagDocument_userId_updatedAt_idx"
  ON "RagDocument"("userId", "updatedAt");
