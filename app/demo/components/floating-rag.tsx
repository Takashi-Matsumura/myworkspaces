"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import {
  Database,
  FileText,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { View } from "./whiteboard-canvas";

type RagDoc = {
  id: string;
  filename: string;
  bytes: number;
  chunkCount: number;
  createdAt: string;
};

type ScenePos = { x: number; y: number };
type SceneSize = { w: number; h: number };

const INITIAL_W = 380;
const INITIAL_H = 500;

async function apiList(): Promise<RagDoc[]> {
  const res = await fetch("/api/rag/documents", { cache: "no-store" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  const data = (await res.json()) as { documents: RagDoc[] };
  return data.documents;
}

async function apiUpload(file: File): Promise<void> {
  const fd = new FormData();
  fd.append("file", file, file.name);
  const res = await fetch("/api/rag/upload", { method: "POST", body: fd });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status} for ${file.name}`);
  }
}

async function apiDelete(id: string): Promise<void> {
  const res = await fetch(`/api/rag/documents?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function FloatingRag({
  view,
  onStop,
  z,
  onFocus,
}: {
  view: View;
  onStop: () => void;
  z: number;
  onFocus?: () => void;
}) {
  const [scenePos, setScenePos] = useState<ScenePos>(() => {
    if (typeof window === "undefined") return { x: 80, y: 80 };
    return {
      x: Math.max(40, window.innerWidth - INITIAL_W - 120),
      y: 100,
    };
  });
  const [sceneSize] = useState<SceneSize>({ w: INITIAL_W, h: INITIAL_H });

  const [docs, setDocs] = useState<RagDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDocs(await apiList());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // 初回マウントでドキュメント一覧をロード。setLoading が即同期で setState するが、
  // 他の floating-* パネルでも同じパターンを使っている (floating-workspace の refetchContainer)。
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refresh(); }, [refresh]);

  const handleUpload = useCallback(
    async (files: FileList | File[]) => {
      setUploading(true);
      setError(null);
      try {
        for (const file of Array.from(files)) {
          await apiUpload(file);
        }
        await refresh();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setUploading(false);
      }
    },
    [refresh],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm("このドキュメントを RAG から削除しますか？")) return;
      try {
        await apiDelete(id);
        await refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [refresh],
  );

  // ─── Drag by header (シーン座標系。他パネルと同じ計算式) ───
  const dragRef = useRef<{ sx: number; sy: number; px: number; py: number } | null>(
    null,
  );
  const onHeaderPointerDown = (ev: PointerEvent<HTMLDivElement>) => {
    const target = ev.target as HTMLElement;
    if (target.closest("button")) return;
    target.setPointerCapture?.(ev.pointerId);
    dragRef.current = {
      sx: ev.clientX,
      sy: ev.clientY,
      px: scenePos.x,
      py: scenePos.y,
    };
    onFocus?.();
  };
  const onHeaderPointerMove = (ev: PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    setScenePos({
      x: d.px + (ev.clientX - d.sx) / view.zoom,
      y: d.py + (ev.clientY - d.sy) / view.zoom,
    });
  };
  const onHeaderPointerUp = (ev: PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    try {
      (ev.target as HTMLElement).releasePointerCapture?.(ev.pointerId);
    } catch {}
  };

  // scene -> screen 変換 (他パネルと同じ式)
  const left = (scenePos.x + view.x) * view.zoom;
  const top = (scenePos.y + view.y) * view.zoom;

  return (
    <div
      className="fixed overflow-hidden rounded-lg border border-slate-300 bg-white shadow-xl"
      style={{
        left: 0,
        top: 0,
        width: sceneSize.w,
        height: sceneSize.h,
        transform: `translate(${left}px, ${top}px) scale(${view.zoom})`,
        transformOrigin: "top left",
        zIndex: z,
      }}
      onMouseDown={onFocus}
    >
      <div className="flex h-full flex-col">
        <div
          className="flex h-7 shrink-0 cursor-grab items-center gap-2 border-b border-slate-200 bg-indigo-50 px-2 select-none active:cursor-grabbing"
          onPointerDown={onHeaderPointerDown}
          onPointerMove={onHeaderPointerMove}
          onPointerUp={onHeaderPointerUp}
          onPointerCancel={onHeaderPointerUp}
        >
          <Database className="h-3.5 w-3.5 text-indigo-600" />
          <span className="text-xs font-medium text-slate-700">RAG ドキュメント</span>
          <div className="ml-auto flex items-center gap-0.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void refresh();
              }}
              className="rounded p-1 text-slate-500 hover:bg-indigo-100"
              title="再読み込み"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onStop();
              }}
              className="rounded p-1 text-slate-500 hover:bg-indigo-100"
              title="閉じる"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div
          className={`flex flex-1 flex-col overflow-auto p-3 text-xs transition-colors ${
            dragOver ? "bg-indigo-50" : ""
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files.length > 0) {
              void handleUpload(e.dataTransfer.files);
            }
          }}
        >
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded border border-dashed border-slate-300 bg-slate-50 p-3 text-slate-600 hover:bg-slate-100">
            <Upload className="h-4 w-4" />
            <span>
              {uploading
                ? "取り込み中..."
                : "ファイルをドラッグ / クリックで追加"}
            </span>
            <input
              type="file"
              multiple
              accept=".txt,.md,.pdf,.html,.htm"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  void handleUpload(e.target.files);
                  e.target.value = "";
                }
              }}
            />
          </label>

          {error && (
            <div className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700">
              {error}
            </div>
          )}

          <div className="mt-3 flex-1">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">
              取り込み済み ({docs.length})
            </div>
            {docs.length === 0 ? (
              <div className="rounded border border-slate-200 bg-slate-50 p-3 text-center text-[11px] leading-relaxed text-slate-500">
                まだドキュメントがありません。
                <br />
                .txt / .md / .pdf / .html を取り込むと、
                <br />
                Coding / Business パネルの LLM が
                <br />
                それを根拠に回答します。
              </div>
            ) : (
              <ul className="space-y-1">
                {docs.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center gap-2 rounded border border-slate-200 bg-white px-2 py-1"
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                    <div className="flex-1 overflow-hidden">
                      <div className="truncate text-slate-800" title={d.filename}>
                        {d.filename}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {d.chunkCount} chunks · {formatBytes(d.bytes)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleDelete(d.id)}
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      title="削除"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
