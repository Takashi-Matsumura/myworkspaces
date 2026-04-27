// Phase E-B-2: Biz パネルの「reports/ research/ を RAG に取り込む」機能のコア。
//
// 流れ:
//   1. ワークスペース内の reports/*.md と research/*.md を find で列挙
//   2. 各ファイルを読み出し、(userId, workspaceId, relativePath) で RagDocument を upsert
//   3. 既存ドキュメントが見つかったら sidecar 側の旧チャンクを削除してから新規 ingest
//   4. ingest が完了したら chunkCount / bytes / updatedAt を更新
//
// このモジュールは route 層を経由しない pure な関数で、テストはモック越しに書ける。
// (実 docker / sidecar への到達は route + integration test の範疇)

import { prisma } from "@/lib/prisma";
import { execCollect, isInsideWorkspaces, readFileBytes, shellQuote, WorkspaceError } from "@/lib/workspace";
import { getRagSidecarUrl } from "@/lib/docker-session";

const SCAN_SUBDIRS = ["reports", "research"] as const;
const MAX_SCAN_FILES = 200;

export type SyncRagResult = {
  synced: SyncedFile[];
  skipped: SyncedFile[];
  failed: { relativePath: string; error: string }[];
};

export type SyncedFile = {
  id: string;
  relativePath: string;
  bytes: number;
  chunkCount: number;
  updated: boolean; // true = upsert で既存を更新, false = 新規作成
};

// ワークスペース内の reports/*.md と research/*.md を find で列挙。
// シンボリックリンクや巨大ディレクトリを掘り過ぎないよう -maxdepth 4 で抑制。
export async function scanSyncableFiles(
  sub: string,
  workspaceId: string,
): Promise<{ relativePath: string; absolutePath: string }[]> {
  const wsRoot = `/root/workspaces/${workspaceId}`;
  if (!isInsideWorkspaces(wsRoot)) {
    throw new WorkspaceError("invalid workspace path", 403);
  }

  const subdirArgs = SCAN_SUBDIRS.map((d) => shellQuote(`${wsRoot}/${d}`)).join(" ");
  const cmd = [
    "/bin/bash",
    "-c",
    `find ${subdirArgs} -maxdepth 4 -type f -name '*.md' 2>/dev/null | head -n ${MAX_SCAN_FILES}`,
  ];
  const res = await execCollect(sub, cmd);
  // find は対象ディレクトリが無いと exit 1 を返すが stderr 抑止しているので exitCode は無視。

  const lines = res.stdout
    .toString("utf-8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const out: { relativePath: string; absolutePath: string }[] = [];
  for (const absolutePath of lines) {
    if (!absolutePath.startsWith(`${wsRoot}/`)) continue;
    const relativePath = absolutePath.slice(wsRoot.length + 1);
    out.push({ relativePath, absolutePath });
  }
  return out;
}

// 単一ファイルを sidecar に ingest し RagDocument を upsert する。
// 既存ドキュメント (sub + workspaceId + relativePath で一致) があれば、
// sidecar から旧チャンクを削除した上で同じ doc_id で再 ingest する。
export async function ingestOneFile(
  sub: string,
  workspaceId: string,
  relativePath: string,
  absolutePath: string,
  sidecarUrl: string,
): Promise<SyncedFile> {
  const { buffer, size } = await readFileBytes(sub, absolutePath);
  const filename = relativePath.split("/").pop() ?? relativePath;

  const existing = await prisma.ragDocument.findUnique({
    where: {
      uniq_user_workspace_path: {
        userId: sub,
        workspaceId,
        relativePath,
      },
    },
  });

  // 既存があれば sidecar から旧チャンクを削除 (失敗しても続行: 孤児が増えるだけ)
  if (existing) {
    await fetch(`${sidecarUrl}/documents/${encodeURIComponent(existing.id)}`, {
      method: "DELETE",
    }).catch(() => {});
  }

  // doc_id は既存があればそれを再利用、無ければ新規作成 (Prisma の cuid)
  const docId =
    existing?.id ??
    (
      await prisma.ragDocument.create({
        data: {
          userId: sub,
          filename,
          bytes: size,
          chunkCount: 0,
          workspaceId,
          relativePath,
        },
      })
    ).id;

  // sidecar の /ingest に FormData で投げる
  const form = new FormData();
  form.append("doc_id", docId);
  form.append("filename", filename);
  // Buffer → Blob (Node 20+)。relativePath ではなく filename だけ渡す (sidecar 側の payload に保存される)。
  form.append("file", new Blob([new Uint8Array(buffer)]), filename);

  const resp = await fetch(`${sidecarUrl}/ingest`, {
    method: "POST",
    body: form,
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    // 新規作成した場合は片付け (既存 update はそのまま残す: 旧チャンク消失 + メタ残存になる)
    if (!existing) {
      await prisma.ragDocument.delete({ where: { id: docId } }).catch(() => {});
    }
    throw new Error(`sidecar /ingest ${resp.status}: ${body.slice(0, 200)}`);
  }
  const payload = (await resp.json()) as { chunk_count?: number };
  const chunkCount = typeof payload.chunk_count === "number" ? payload.chunk_count : 0;

  const updated = await prisma.ragDocument.update({
    where: { id: docId },
    data: {
      filename,
      bytes: size,
      chunkCount,
      workspaceId,
      relativePath,
    },
  });
  return {
    id: updated.id,
    relativePath,
    bytes: updated.bytes,
    chunkCount: updated.chunkCount,
    updated: Boolean(existing),
  };
}

// ワークスペース全体を sync する。1 ファイル失敗しても他は継続。
export async function syncWorkspaceToRag(
  sub: string,
  workspaceId: string,
): Promise<SyncRagResult> {
  const files = await scanSyncableFiles(sub, workspaceId);
  if (files.length === 0) {
    return { synced: [], skipped: [], failed: [] };
  }

  const sidecarUrl = await getRagSidecarUrl(sub);

  const synced: SyncedFile[] = [];
  const skipped: SyncedFile[] = [];
  const failed: { relativePath: string; error: string }[] = [];

  // 直列で回す (sidecar の /ingest は埋め込み生成で重いので、並列にしてもネットワークが
  // 詰まるだけ。reports/research は通常 N=1〜30 程度の想定)。
  for (const f of files) {
    try {
      const result = await ingestOneFile(sub, workspaceId, f.relativePath, f.absolutePath, sidecarUrl);
      if (result.chunkCount === 0) {
        skipped.push(result);
      } else {
        synced.push(result);
      }
    } catch (err) {
      failed.push({
        relativePath: f.relativePath,
        error: (err as Error).message ?? String(err),
      });
    }
  }
  return { synced, skipped, failed };
}
