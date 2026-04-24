import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/user";
import { exportWorkspaceAsZip, WorkspaceError } from "@/lib/workspace";
import { findWorkspaceById } from "@/lib/user-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ワークスペース全体を ZIP にまとめてダウンロード。
// Windows の日本語ファイル名対策として archiver のデフォルト (bit 11 + Unicode
// Path Extra Field) を利用。レスポンスの Content-Disposition も RFC 5987 の
// filename*=UTF-8'' 形式で UTF-8 を宣言する。
export async function GET(request: NextRequest) {
  const user = await getUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const workspaceId = request.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) {
    return NextResponse.json(
      { error: "workspaceId required" },
      { status: 400 },
    );
  }

  // ユーザ所有のワークスペースかを確認 (他ユーザの id を叩けないように)
  const ws = await findWorkspaceById(user.id, workspaceId);
  if (!ws) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  try {
    const stream = exportWorkspaceAsZip(user.id, workspaceId);
    // Node.js Readable → Web ReadableStream に変換 (Next.js App Router 向け)
    const webStream = new ReadableStream<Uint8Array>({
      start(controller) {
        stream.on("data", (chunk: Buffer) => {
          controller.enqueue(new Uint8Array(chunk));
        });
        stream.on("end", () => controller.close());
        stream.on("error", (err) => controller.error(err));
      },
      cancel() {
        stream.destroy();
      },
    });

    const baseName = `${ws.label || workspaceId}.zip`;
    // Content-Disposition: RFC 5987 で UTF-8 宣言。ASCII fallback + filename*
    // の 2 本立てで出すのが最も互換性が高い。
    const asciiFallback = baseName.replace(/[^\x20-\x7e]/g, "_");
    const encoded = encodeURIComponent(baseName);

    return new Response(webStream, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof WorkspaceError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[api/workspace/download] zip failed", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "zip failed" },
      { status: 500 },
    );
  }
}
