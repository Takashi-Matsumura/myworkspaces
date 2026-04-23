import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/user";
import { getSkill, deleteSkill, SkillError } from "@/lib/opencode-skills";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ name: string }> };

// GET /api/opencode/skills/<name> → frontmatter + 本文
export async function GET(req: NextRequest, ctx: Ctx) {
  const user = await getUser(req);
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { name } = await ctx.params;
  try {
    const skill = await getSkill(user.id, name);
    if (!skill) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json(skill);
  } catch (err) {
    const status = err instanceof SkillError ? err.status : 500;
    return NextResponse.json(
      { error: (err as Error).message },
      { status },
    );
  }
}

// DELETE /api/opencode/skills/<name>
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const user = await getUser(req);
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { name } = await ctx.params;
  try {
    await deleteSkill(user.id, name);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const status = err instanceof SkillError ? err.status : 500;
    return NextResponse.json(
      { error: (err as Error).message },
      { status },
    );
  }
}
