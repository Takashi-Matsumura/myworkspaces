import { NextResponse, type NextRequest } from "next/server";
import { getSub } from "@/lib/user";
import {
  getContainerStatus,
  removeContainer,
} from "@/lib/docker-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sub = getSub(request);
  try {
    const status = await getContainerStatus(sub);
    return NextResponse.json(status);
  } catch (err) {
    console.error("[api/container] status failed", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "status failed" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const sub = getSub(request);
  try {
    const removed = await removeContainer(sub);
    return NextResponse.json({ removed });
  } catch (err) {
    console.error("[api/container] remove failed", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "remove failed" },
      { status: 500 },
    );
  }
}
