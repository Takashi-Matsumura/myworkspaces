"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMount } from "../hooks/use-mount";
import {
  CodeXml,
  Download,
  Eye,
  EyeOff,
  FileSearch,
  List,
  Plus,
  RefreshCw,
  TerminalSquare,
  X,
} from "lucide-react";
import { useWorkspace } from "./workspace-context";
import {
  apiCreateWorkspace,
  apiDeleteWorkspace,
  apiListWorkspaces,
  type WorkspaceListEntry,
} from "../api/workspace";

type Props = {
  showHidden: boolean;
  toggleShowHidden: () => void;
  onStartCoding: () => void;
  onStartBusiness: () => void;
  onStartUbuntu: () => void;
  onStartAnalyze: () => void;
  onRefresh: () => void;
  onOpen: (entry: WorkspaceListEntry) => Promise<void>;
};

export function FloatingWorkspaceSelector({
  showHidden,
  toggleShowHidden,
  onStartCoding,
  onStartBusiness,
  onStartUbuntu,
  onStartAnalyze,
  onRefresh,
  onOpen,
}: Props) {
  const { workspace, onWorkspaceChange, setError } = useWorkspace();
  const [registered, setRegistered] = useState<WorkspaceListEntry[]>([]);
  const [listOpen, setListOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const refreshList = useCallback(async () => {
    try {
      const list = await apiListWorkspaces();
      setRegistered(list);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [setError]);

  // 初回マウント時に 1 回だけ読み込む。
  useMount(() => { void refreshList(); });

  // 初回ロード時、登録済みワークスペースがあれば最も最近開いたものを自動で開く
  // (listWorkspaces は lastOpenedAt 降順で返るので、先頭 = 前回開いた ws)。
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (autoOpenedRef.current) return;
    if (workspace) return;
    if (registered.length === 0) return;
    autoOpenedRef.current = true;
    void onOpen(registered[0]).then(() => void refreshList());
  }, [registered, workspace, onOpen, refreshList]);

  const handleOpen = useCallback(
    async (e: WorkspaceListEntry) => {
      setListOpen(false);
      await onOpen(e);
      await refreshList();
    },
    [onOpen, refreshList],
  );

  const createWorkspace = useCallback(async () => {
    const label = prompt("新しいワークスペースの名前を入力", "workspace");
    if (!label || !label.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await apiCreateWorkspace(label.trim());
      await refreshList();
      await onOpen(created);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [onOpen, refreshList, setError]);

  const deleteWorkspace = useCallback(
    async (id: string) => {
      if (!confirm("このワークスペースを削除します。コンテナ内のファイルも消えます。続行しますか？")) {
        return;
      }
      try {
        await apiDeleteWorkspace(id);
        if (workspace?.id === id) onWorkspaceChange(null);
        await refreshList();
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [onWorkspaceChange, refreshList, setError, workspace],
  );

  return (
    <div className="relative flex flex-nowrap items-center gap-1.5 border-b border-slate-200 bg-white px-2 py-1">
      <button
        type="button"
        onClick={createWorkspace}
        disabled={busy}
        className="inline-flex shrink-0 items-center gap-1 rounded border border-sky-300 bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700 hover:bg-sky-100 disabled:opacity-40"
        title="新しいワークスペースを作成"
      >
        <Plus className="h-3.5 w-3.5 shrink-0" />
        {busy ? "作成中…" : "新規"}
      </button>
      <button
        type="button"
        onClick={() => setListOpen((v) => !v)}
        className={`inline-flex shrink-0 items-center gap-1 rounded border px-2 py-1 text-xs font-medium ${
          listOpen ? "border-slate-400 bg-slate-100 text-slate-800" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
        }`}
        title="ワークスペース一覧"
      >
        <List className="h-3.5 w-3.5" />
        一覧 ({registered.length})
      </button>
      <button
        type="button"
        onClick={onRefresh}
        disabled={!workspace}
        className="inline-flex shrink-0 items-center rounded border border-slate-300 bg-white p-1 text-slate-700 hover:bg-slate-50 disabled:opacity-30"
        title="Refresh"
      >
        <RefreshCw className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={toggleShowHidden}
        className={`inline-flex shrink-0 items-center rounded border p-1 ${
          showHidden
            ? "border-slate-400 bg-slate-100 text-slate-800"
            : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
        }`}
        title={showHidden ? "ドットファイルを隠す" : "ドットファイルを表示"}
      >
        {showHidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
      </button>
      <button
        type="button"
        onClick={() => {
          if (!workspace) return;
          // ZIP のダウンロードは <a download> で普通の GET navigation に。
          // Content-Disposition: attachment + filename* で UTF-8 ファイル名を
          // 渡すので、日本語を含んでいてもブラウザが正しく保存名にしてくれる。
          const url = `/api/workspace/download?workspaceId=${encodeURIComponent(workspace.id)}`;
          const a = document.createElement("a");
          a.href = url;
          a.rel = "noopener";
          document.body.appendChild(a);
          a.click();
          a.remove();
        }}
        disabled={!workspace}
        className="inline-flex shrink-0 items-center rounded border border-slate-300 bg-white p-1 text-slate-700 hover:bg-slate-50 disabled:opacity-30"
        title="ワークスペースを ZIP でダウンロード (Windows 互換 UTF-8)"
      >
        <Download className="h-3.5 w-3.5" />
      </button>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onStartCoding}
          disabled={!workspace}
          className="inline-flex shrink-0 items-center gap-1 rounded border border-[#15151c] bg-[#15151c] px-2 py-1 text-xs font-semibold text-white shadow-sm hover:bg-[#2a2a35] disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
          title={workspace ? `Coding パネルを ${workspace.cwd} で起動` : "先にワークスペースを選択してください"}
        >
          <CodeXml className="h-3.5 w-3.5 shrink-0" />
          Code
        </button>
        <button
          type="button"
          onClick={onStartBusiness}
          disabled={!workspace}
          className="inline-flex shrink-0 items-center gap-1 rounded border border-[#217346] bg-[#217346] px-2 py-1 text-xs font-semibold text-white shadow-sm hover:bg-[#1a5c38] disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
          title={workspace ? `Business パネルを ${workspace.cwd} で起動` : "先にワークスペースを選択してください"}
        >
          <CodeXml className="h-3.5 w-3.5 shrink-0" />
          Biz
        </button>
        <button
          type="button"
          onClick={onStartUbuntu}
          disabled={!workspace}
          className="inline-flex shrink-0 items-center gap-1 rounded border border-indigo-700 bg-indigo-700 px-2 py-1 text-xs font-semibold text-white shadow-sm hover:bg-indigo-600 disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
          title={workspace ? `Shell パネル (ubuntu / bash) を ${workspace.cwd} で起動` : "先にワークスペースを選択してください"}
        >
          <TerminalSquare className="h-3.5 w-3.5 shrink-0" />
          Shell
        </button>
        <button
          type="button"
          onClick={onStartAnalyze}
          disabled={!workspace}
          className="inline-flex shrink-0 items-center gap-1 rounded border border-[#7c3aed] bg-[#7c3aed] px-2 py-1 text-xs font-semibold text-white shadow-sm hover:bg-[#6d28d9] disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
          title={workspace ? `Analyze パネル (コード分析・設計資料生成) を ${workspace.cwd} で起動` : "先にワークスペースを選択してください"}
        >
          <FileSearch className="h-3.5 w-3.5 shrink-0" />
          Analyze
        </button>
      </div>

      {listOpen && (
        <div className="absolute left-2 top-full z-10 mt-1 max-h-72 w-80 overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {registered.length === 0 ? (
            <div className="px-3 py-2 font-mono text-[11px] text-slate-400">
              まだワークスペースがありません
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {registered.map((w) => (
                <li key={w.id} className="flex items-center gap-1 px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => void handleOpen(w)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex items-center gap-1">
                      <span className="truncate text-xs font-medium text-slate-800">{w.label}</span>
                    </div>
                    <div className="truncate font-mono text-[10px] text-slate-400">
                      /root/workspaces/{w.id}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteWorkspace(w.id)}
                    className="shrink-0 rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    title="削除"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
