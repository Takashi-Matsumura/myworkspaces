import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/user";
import { listSkills, writeSkill, SkillError } from "@/lib/opencode-skills";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/opencode/skills → 一覧 (name + description)
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const skills = await listSkills(user.id);
    return NextResponse.json({ skills });
  } catch (err) {
    const status = err instanceof SkillError ? err.status : 500;
    return NextResponse.json(
      { error: (err as Error).message },
      { status },
    );
  }
}

// POST /api/opencode/skills { name, description, body }
// 新規作成 / 上書きを兼ねる (PUT は name を URL パス側に持つ別 route で受ける)。
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let payload: { name?: unknown; description?: unknown; body?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const { name, description, body } = payload;
  if (
    typeof name !== "string" ||
    typeof description !== "string" ||
    typeof body !== "string"
  ) {
    return NextResponse.json(
      { error: "name, description, body are required strings" },
      { status: 400 },
    );
  }
  try {
    await writeSkill(user.id, name, description, body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const status = err instanceof SkillError ? err.status : 500;
    return NextResponse.json(
      { error: (err as Error).message },
      { status },
    );
  }
}
