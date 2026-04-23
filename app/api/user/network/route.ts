import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/user";
import {
  ensureIsolatedNetwork,
  getContainerStatus,
  removeContainer,
  shutdownSessionsForSub,
} from "@/lib/docker-session";
import {
  getUserNetworkIsolation,
  setUserNetworkIsolation,
} from "@/lib/user-network";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const [requested, status] = await Promise.all([
      getUserNetworkIsolation(user.id),
      getContainerStatus(user.id),
    ]);
    return NextResponse.json({
      requested,
      effective: status.exists ? Boolean(status.isolated) : null,
      networkMode: status.networkMode ?? null,
    });
  } catch (err) {
    console.error("[api/user/network] get failed", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "get failed" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { isolated?: unknown };
  try {
    body = (await request.json()) as { isolated?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (typeof body.isolated !== "boolean") {
    return NextResponse.json({ error: "isolated must be boolean" }, { status: 400 });
  }
  const isolated = body.isolated;

  try {
    const current = await getUserNetworkIsolation(user.id);
    if (current === isolated) {
      return NextResponse.json({ noop: true, requested: current });
    }

    if (isolated) {
      await ensureIsolatedNetwork();
    }
    await setUserNetworkIsolation(user.id, isolated);

    // 既存コンテナはネットワーク設定を後から変更できないので、削除して次回 attach で再作成する。
    shutdownSessionsForSub(user.id);
    await removeContainer(user.id);

    return NextResponse.json({ requested: isolated, effective: null, networkMode: null });
  } catch (err) {
    console.error("[api/user/network] patch failed", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "patch failed" },
      { status: 500 },
    );
  }
}
