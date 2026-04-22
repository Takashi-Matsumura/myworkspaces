import type { IncomingMessage } from "node:http";
import { SESSION_COOKIE, parseCookie, resolveSessionCookie, type SessionUser } from "./auth";

export type UserIdentity = { sub: string; username: string };

function cookieHeaderFrom(req: Request | IncomingMessage | undefined): string | null | undefined {
  if (!req) return undefined;
  if ("headers" in req) {
    const h = (req as { headers: unknown }).headers;
    if (h && typeof h === "object") {
      if (typeof (h as Headers).get === "function") {
        return (h as Headers).get("cookie");
      }
      const raw = (h as Record<string, string | string[] | undefined>).cookie;
      if (Array.isArray(raw)) return raw.join("; ");
      return raw ?? null;
    }
  }
  return null;
}

async function resolve(req: Request | IncomingMessage | undefined): Promise<SessionUser | null> {
  const header = cookieHeaderFrom(req);
  const raw = parseCookie(header ?? "", SESSION_COOKIE);
  return resolveSessionCookie(raw);
}

// 未認証なら null を返す。ルート側で 401 を返す責務。
export async function getUser(req: Request | IncomingMessage | undefined): Promise<SessionUser | null> {
  return resolve(req);
}

export async function getIdentity(req: Request | IncomingMessage | undefined): Promise<UserIdentity | null> {
  const u = await resolve(req);
  return u ? { sub: u.id, username: u.username } : null;
}

// 認証済み前提で sub を取り出す。未認証なら例外。API ルートは requireUser を使う。
export async function requireUser(req: Request | IncomingMessage | undefined): Promise<SessionUser> {
  const u = await resolve(req);
  if (!u) throw new UnauthorizedError();
  return u;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("unauthorized");
    this.name = "UnauthorizedError";
  }
}

export function sanitizeSub(sub: string): string {
  return sub.replace(/[^a-zA-Z0-9_-]/g, "_");
}
