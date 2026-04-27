import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/user";
import { prisma } from "@/lib/prisma";
import {
  expiresAtFromChoice,
  generateShareToken,
  isSafeRelativePath,
  type ExpiryChoice,
} from "@/lib/biz/share";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Phase E-C-3: 署名付き共有 URL の発行 + 一覧。
//
// POST { workspaceId, relativePath, expiry: "7d" | "30d" | "never" }
//   → ShareLink を upsert。同じ (userId, workspaceId, relativePath) は token を維持して
//      expiresAt のみ更新。
// GET  → 自分の発行済み一覧を返す (BizTab で表示する想定)。

const ALLOWED_EXPIRY = new Set<ExpiryChoice>(["7d", "30d", "never"]);

type CreateBody = {
  workspaceId?: string;
  relativePath?: string;
  expiry?: ExpiryChoice;
};

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  if (typeof body.workspaceId !== "string" || body.workspaceId.length === 0) {
    return NextResponse.json(
      { error: "workspaceId (string) is required" },
      { status: 400 },
    );
  }
  if (
    typeof body.relativePath !== "string" ||
    !isSafeRelativePath(body.relativePath)
  ) {
    return NextResponse.json(
      { error: "relativePath must be a safe workspace-relative path" },
      { status: 400 },
    );
  }
  const expiry: ExpiryChoice = ALLOWED_EXPIRY.has(body.expiry as ExpiryChoice)
    ? (body.expiry as ExpiryChoice)
    : "7d";
  const expiresAt = expiresAtFromChoice(expiry);

  // Workspace の所有確認 (cuid 衝突攻撃対策)
  const ws = await prisma.workspace.findUnique({
    where: { id: body.workspaceId },
    select: { userId: true },
  });
  if (!ws || ws.userId !== user.id) {
    return NextResponse.json({ error: "workspace not found" }, { status: 404 });
  }

  // upsert: 既存がある場合は token は維持し expiresAt だけ更新
  const existing = await prisma.shareLink.findUnique({
    where: {
      uniq_share_user_workspace_path: {
        userId: user.id,
        workspaceId: body.workspaceId,
        relativePath: body.relativePath,
      },
    },
  });

  const link = existing
    ? await prisma.shareLink.update({
        where: { id: existing.id },
        data: { expiresAt },
      })
    : await prisma.shareLink.create({
        data: {
          token: generateShareToken(),
          userId: user.id,
          workspaceId: body.workspaceId,
          relativePath: body.relativePath,
          expiresAt,
        },
      });

  return NextResponse.json({
    token: link.token,
    workspaceId: link.workspaceId,
    relativePath: link.relativePath,
    expiresAt: link.expiresAt?.toISOString() ?? null,
    createdAt: link.createdAt.toISOString(),
    updatedAt: link.updatedAt.toISOString(),
  });
}

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const links = await prisma.shareLink.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    select: {
      token: true,
      workspaceId: true,
      relativePath: true,
      expiresAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    links: links.map((l) => ({
      token: l.token,
      workspaceId: l.workspaceId,
      relativePath: l.relativePath,
      expiresAt: l.expiresAt?.toISOString() ?? null,
      createdAt: l.createdAt.toISOString(),
      updatedAt: l.updatedAt.toISOString(),
    })),
  });
}
