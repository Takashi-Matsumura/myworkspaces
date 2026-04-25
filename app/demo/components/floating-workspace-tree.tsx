"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  Trash2,
  Upload,
} from "lucide-react";
import { useWorkspace } from "./workspace-context";
import {
  apiDeleteFile,
  apiListDir,
  apiUploadFile,
  collectDroppedFiles,
  joinPath,
  type Entry,
} from "../api/workspace";
import type { Workspace } from "./floating-workspace";

type Props = {
  fontSize: number;
  showHidden: boolean;
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
  onAfterDelete: (path: string) => void;
  refreshSignal: number;
};

// 親で <FloatingWorkspaceTree key={workspace?.id ?? "none"} /> として
// 再マウントすることで、ws 切替時に内部 state を自動リセットする。
export function FloatingWorkspaceTree({
  fontSize,
  showHidden,
  selectedFile,
  onSelectFile,
  onAfterDelete,
  refreshSignal,
}: Props) {
  const { workspace, setError, setNotice } = useWorkspace();
  const [childEntries, setChildEntries] = useState<Map<string, Entry[]>>(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(() =>
    workspace ? new Set([workspace.cwd]) : new Set(),
  );
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const dragDepthRef = useRef(0);

  const loadDir = useCallback(
    async (path: string) => {
      setLoadingPaths((s) => { const n = new Set(s); n.add(path); return n; });
      try {
        const entries = await apiListDir(path);
        setChildEntries((m) => { const n = new Map(m); n.set(path, entries); return n; });
        setError(null);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoadingPaths((s) => { const n = new Set(s); n.delete(path); return n; });
      }
    },
    [setError],
  );

  // 初回マウント (workspace.id が変わって再マウントされた時) に root を読み込む。
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (workspace) void loadDir(workspace.cwd);
  }, [workspace, loadDir]);

  // refresh signal が変化したら expanded を全リロード。
  useEffect(() => {
    if (refreshSignal === 0 || !workspace) return;
    const paths = Array.from(expanded);
    void Promise.all(paths.map((p) => loadDir(p)));
    // expanded / loadDir は意図的に依存配列から外している (signal の単純な変化で trigger)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  const onToggleDir = useCallback(
    (p: string) => {
      if (!workspace) return;
      setExpanded((s) => {
        const n = new Set(s);
        if (n.has(p)) {
          n.delete(p);
        } else {
          n.add(p);
          if (!childEntries.has(p)) void loadDir(p);
        }
        return n;
      });
    },
    [childEntries, loadDir, workspace],
  );

  const onDeleteFile = useCallback(
    async (p: string) => {
      const name = p.split("/").pop() ?? p;
      if (!confirm(`「${name}」を削除します。元に戻せません。続けますか？`)) return;
      setError(null);
      try {
        await apiDeleteFile(p);
        const parent = p.slice(0, p.lastIndexOf("/"));
        if (parent) await loadDir(parent);
        onAfterDelete(p);
        setNotice(`削除しました: ${name}`);
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [loadDir, onAfterDelete, setError, setNotice],
  );

  const onDropFiles = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();
      dragDepthRef.current = 0;
      setDragOver(false);
      if (!workspace) return;
      if (!e.dataTransfer?.items) return;
      setUploadBusy(true);
      setError(null);
      try {
        const collected = await collectDroppedFiles(e.dataTransfer.items);
        if (collected.length === 0) return;
        let done = 0;
        for (const { file, relativePath } of collected) {
          await apiUploadFile(workspace.cwd, relativePath, file);
          done += 1;
          setNotice(`アップロード中 ${done}/${collected.length}`);
        }
        setNotice(`アップロード完了: ${collected.length} ファイル`);
        // 全 expanded を再読込 (アップロード先によらず確実に反映)
        await Promise.all(Array.from(expanded).map((p) => loadDir(p)));
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setUploadBusy(false);
      }
    },
    [expanded, loadDir, setError, setNotice, workspace],
  );

  const onDragEnter = useCallback(
    (e: DragEvent) => {
      if (!workspace) return;
      if (!e.dataTransfer?.types?.includes("Files")) return;
      e.preventDefault();
      dragDepthRef.current += 1;
      setDragOver(true);
    },
    [workspace],
  );

  const onDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragOver(false);
  }, []);

  const onDragOver = useCallback(
    (e: DragEvent) => {
      if (!workspace) return;
      if (!e.dataTransfer?.types?.includes("Files")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    },
    [workspace],
  );

  return (
    <div
      className={`relative h-full min-w-0 overflow-auto border-r border-slate-200 py-1 transition-colors ${
        dragOver ? "bg-sky-50 ring-2 ring-inset ring-sky-400" : "bg-slate-50/60"
      }`}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={(e) => void onDropFiles(e)}
    >
      {dragOver && workspace && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="flex items-center gap-2 rounded-md border border-sky-300 bg-white/90 px-3 py-1.5 font-mono text-[11px] text-sky-800 shadow">
            <Upload className="h-3.5 w-3.5" />
            ドロップで {workspace.label} にアップロード
          </div>
        </div>
      )}
      {uploadBusy && !dragOver && (
        <div className="border-b border-sky-200 bg-sky-50 px-3 py-1 font-mono text-[11px] text-sky-700">
          アップロード中…
        </div>
      )}
      {workspace ? (
        <TreeRootRow
          workspace={workspace}
          expanded={expanded}
          childEntries={childEntries}
          selectedFile={selectedFile}
          loadingPaths={loadingPaths}
          fontSize={fontSize}
          showHidden={showHidden}
          onToggleDir={onToggleDir}
          onSelectFile={onSelectFile}
          onDeleteFile={onDeleteFile}
        />
      ) : (
        <div className="px-3 py-2 font-mono text-slate-400" style={{ fontSize }}>
          「一覧」から選ぶか、「新規」でワークスペースを作成してください。
        </div>
      )}
    </div>
  );
}

function TreeRow({
  parentPath,
  entry,
  depth,
  expanded,
  childEntries,
  selectedFile,
  loadingPaths,
  fontSize,
  showHidden,
  onToggleDir,
  onSelectFile,
  onDeleteFile,
}: {
  parentPath: string;
  entry: Entry;
  depth: number;
  expanded: Set<string>;
  childEntries: Map<string, Entry[]>;
  selectedFile: string | null;
  loadingPaths: Set<string>;
  fontSize: number;
  showHidden: boolean;
  onToggleDir: (p: string) => void;
  onSelectFile: (p: string) => void;
  onDeleteFile: (p: string) => void;
}) {
  const path = joinPath(parentPath, entry.name);
  const isDir = entry.isDir;
  const isOpen = expanded.has(path);
  const isLoading = loadingPaths.has(path);
  const rawChildren = childEntries.get(path);
  const children = rawChildren && (showHidden ? rawChildren : rawChildren.filter((c) => !c.name.startsWith(".")));
  const isSelected = selectedFile === path;
  return (
    <div>
      <div
        className={`group relative flex w-full items-center transition-colors ${
          isSelected ? "bg-sky-100 text-sky-900" : "text-slate-700 hover:bg-slate-100"
        }`}
      >
        <button
          type="button"
          onClick={() => (isDir ? onToggleDir(path) : onSelectFile(path))}
          className="flex min-w-0 flex-1 items-center gap-1 px-2 py-0.5 text-left font-mono"
          style={{ paddingLeft: 8 + depth * 12, fontSize }}
          title={path}
        >
          <span className="w-3 shrink-0 text-slate-400">
            {isDir ? (isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />) : <span className="h-3 w-3" />}
          </span>
          <span className="shrink-0 text-slate-500">{isDir ? <Folder className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}</span>
          <span className="truncate">{entry.name}</span>
          {isLoading && <span className="ml-auto text-slate-400">…</span>}
        </button>
        {!isDir && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteFile(path);
            }}
            className={`mr-1 shrink-0 rounded p-0.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 ${
              isSelected ? "" : "opacity-0 group-hover:opacity-100 focus:opacity-100"
            }`}
            title="削除"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
      {isDir && isOpen && children && (
        <div>
          {children.map((c) => (
            <TreeRow
              key={joinPath(path, c.name)}
              parentPath={path}
              entry={c}
              depth={depth + 1}
              expanded={expanded}
              childEntries={childEntries}
              selectedFile={selectedFile}
              loadingPaths={loadingPaths}
              fontSize={fontSize}
              showHidden={showHidden}
              onToggleDir={onToggleDir}
              onSelectFile={onSelectFile}
              onDeleteFile={onDeleteFile}
            />
          ))}
          {children.length === 0 && (
            <div
              className="px-2 py-0.5 font-mono text-slate-400"
              style={{ paddingLeft: 8 + (depth + 1) * 12, fontSize }}
            >
              (empty)
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TreeRootRow({
  workspace,
  expanded,
  childEntries,
  selectedFile,
  loadingPaths,
  fontSize,
  showHidden,
  onToggleDir,
  onSelectFile,
  onDeleteFile,
}: {
  workspace: Workspace;
  expanded: Set<string>;
  childEntries: Map<string, Entry[]>;
  selectedFile: string | null;
  loadingPaths: Set<string>;
  fontSize: number;
  showHidden: boolean;
  onToggleDir: (p: string) => void;
  onSelectFile: (p: string) => void;
  onDeleteFile: (p: string) => void;
}) {
  const rootPath = workspace.cwd;
  const isOpen = expanded.has(rootPath);
  const isLoading = loadingPaths.has(rootPath);
  const rawChildren = childEntries.get(rootPath);
  const children = rawChildren && (showHidden ? rawChildren : rawChildren.filter((c) => !c.name.startsWith(".")));
  return (
    <div>
      <button
        type="button"
        onClick={() => onToggleDir(rootPath)}
        className="flex w-full items-center gap-1 px-2 py-0.5 text-left font-mono text-slate-700 hover:bg-slate-100"
        style={{ fontSize }}
        title={rootPath}
      >
        <span className="w-3 shrink-0 text-slate-400">
          {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </span>
        <span className="shrink-0 text-slate-500"><Folder className="h-3.5 w-3.5" /></span>
        <span className="truncate font-medium">{workspace.label}</span>
        {isLoading && <span className="ml-auto text-slate-400">…</span>}
      </button>
      {isOpen && children && (
        <div>
          {children.map((c) => (
            <TreeRow
              key={joinPath(rootPath, c.name)}
              parentPath={rootPath}
              entry={c}
              depth={1}
              expanded={expanded}
              childEntries={childEntries}
              selectedFile={selectedFile}
              loadingPaths={loadingPaths}
              fontSize={fontSize}
              showHidden={showHidden}
              onToggleDir={onToggleDir}
              onSelectFile={onSelectFile}
              onDeleteFile={onDeleteFile}
            />
          ))}
          {children.length === 0 && (
            <div
              className="px-2 py-0.5 font-mono text-slate-400"
              style={{ paddingLeft: 20, fontSize }}
            >
              (empty)
            </div>
          )}
        </div>
      )}
    </div>
  );
}
