import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { isExpired, isSafeRelativePath } from "@/lib/biz/share";
import { readFile, WorkspaceError } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Phase E-C-3: 公開閲覧 API (Cookie 認証なし、token 認証のみ)。
// /share/<token> ページがこの API を fetch して Markdown を取得する。
//
// 期限切れは 410 Gone、未知 token は 404、ファイル取得失敗は 502。

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const link = await prisma.shareLink.findUnique({
    where: { token },
    select: {
      userId: true,
      workspaceId: true,
      relativePath: true,
      expiresAt: true,
      createdAt: true,
    },
  });
  if (!link) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (isExpired(link.expiresAt)) {
    return NextResponse.json({ error: "link expired" }, { status: 410 });
  }
  if (!isSafeRelativePath(link.relativePath)) {
    // DB の値が壊れている場合のガード (実害はないが念のため)
    return NextResponse.json({ error: "invalid path" }, { status: 500 });
  }

  const absolutePath = `/root/workspaces/${link.workspaceId}/${link.relativePath}`;
  try {
    const payload = await readFile(link.userId, absolutePath);
    return NextResponse.json({
      token,
      workspaceId: link.workspaceId,
      relativePath: link.relativePath,
      content: payload.content,
      truncated: payload.truncated,
      size: payload.size,
      createdAt: link.createdAt.toISOString(),
      expiresAt: link.expiresAt?.toISOString() ?? null,
    });
  } catch (err) {
    if (err instanceof WorkspaceError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: (err as Error).message ?? "read failed" },
      { status: 502 },
    );
  }
}
