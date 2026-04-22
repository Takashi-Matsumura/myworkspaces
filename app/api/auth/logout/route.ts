import { NextResponse, type NextRequest } from "next/server";
import {
  cookieHeader,
  destroySessionByCookie,
  parseCookie,
  resolveSessionCookie,
  SESSION_COOKIE,
} from "@/lib/auth";
import { shutdownSessionsForSub, stopContainer } from "@/lib/docker-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const raw = parseCookie(request.headers.get("cookie"), SESSION_COOKIE);
  if (raw) {
    // 先にユーザ解決 → PTY セッションとコンテナを停止 → その後で DB セッションと Cookie を破棄。
    // コンテナ停止に失敗してもログアウト自体は成功させる (Cookie は必ずクリア)。
    const user = await resolveSessionCookie(raw);
    if (user) {
      try {
        shutdownSessionsForSub(user.id);
        await stopContainer(user.id);
      } catch (err) {
        console.warn("[auth/logout] container stop failed", err);
      }
    }
    await destroySessionByCookie(raw);
  }
  const res = NextResponse.json({ ok: true });
  res.headers.set(
    "Set-Cookie",
    cookieHeader(SESSION_COOKIE, "", { clear: true }),
  );
  return res;
}
