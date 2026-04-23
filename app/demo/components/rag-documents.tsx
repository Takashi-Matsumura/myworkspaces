"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, RefreshCw, Trash2, Upload } from "lucide-react";

type RagDoc = {
  id: string;
  filename: string;
  bytes: number;
  chunkCount: number;
  createdAt: string;
};

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

export default function RagDocuments() {
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

  // 初回マウントでドキュメント一覧をロード。
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

  return (
    <div
      className={`flex h-full flex-col overflow-auto bg-white p-3 text-xs transition-colors ${
        dragOver ? "bg-[#eaf5ea]" : ""
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
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-[#1a5c38]">
          RAG ドキュメント（Business 用）
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded p-1 text-[#1a5c38] hover:bg-[#eaf5ea]"
          title="再読み込み"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <label className="flex cursor-pointer items-center justify-center gap-2 rounded border border-dashed border-[#b7d9b7] bg-[#f4faf4] p-3 text-[#1a5c38] hover:bg-[#eaf5ea]">
        <Upload className="h-4 w-4" />
        <span>
          {uploading ? "取り込み中..." : "ファイルをドラッグ / クリックで追加"}
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
        <div className="mb-1 text-[10px] uppercase tracking-wider text-[#1a5c38]">
          取り込み済み ({docs.length})
        </div>
        {docs.length === 0 ? (
          <div className="rounded border border-[#b7d9b7] bg-[#f4faf4] p-3 text-center text-[11px] leading-relaxed text-[#1a5c38]">
            まだドキュメントがありません。
            <br />
            .txt / .md / .pdf / .html を取り込むと、
            <br />
            <span className="font-semibold">Business パネル</span>の LLM が
            <br />
            それを根拠に回答します。
          </div>
        ) : (
          <ul className="space-y-1">
            {docs.map((d) => (
              <li
                key={d.id}
                className="flex items-center gap-2 rounded border border-[#b7d9b7] bg-white px-2 py-1"
              >
                <FileText className="h-3.5 w-3.5 shrink-0 text-[#1a5c38]" />
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
  );
}
