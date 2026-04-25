import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/user";
import {
  encodeApiKey,
  getSettings,
  saveSettings,
  type UserSettings,
} from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitize(p: unknown): UserSettings {
  const body = (p ?? {}) as Record<string, unknown>;
  const oc = (body.opencode ?? {}) as Record<string, unknown>;
  const ap = (body.appearance ?? {}) as Record<string, unknown>;
  const providerRaw = oc.provider;
  const provider =
    providerRaw === "anthropic" || providerRaw === "openai" ? providerRaw : "llama-server";
  const cursorStyleRaw = ap.cursorStyle;
  const cursorStyle =
    cursorStyleRaw === "block" || cursorStyleRaw === "underline" ? cursorStyleRaw : "bar";
  return {
    opencode: {
      provider,
      endpoint: typeof oc.endpoint === "string" ? oc.endpoint : "",
      model: typeof oc.model === "string" ? oc.model : "",
      apiKey: encodeApiKey(typeof oc.apiKey === "string" ? oc.apiKey : ""),
    },
    appearance: {
      defaultFontSize: Math.max(10, Math.min(28, Number(ap.defaultFontSize) || 13)),
      defaultPanelWidth: Math.max(360, Math.min(1600, Number(ap.defaultPanelWidth) || 720)),
      defaultPanelHeight: Math.max(220, Math.min(1200, Number(ap.defaultPanelHeight) || 440)),
      cursorStyle,
      scrollback: Math.max(100, Math.min(50000, Number(ap.scrollback) || 10000)),
    },
  };
}

export async function GET(request: NextRequest) {
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const settings = await getSettings(user.id);
  return NextResponse.json({ settings });
}

export async function PUT(request: NextRequest) {
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as unknown;
  const next = sanitize(body);
  await saveSettings(user.id, next);
  return NextResponse.json({ settings: next });
}
