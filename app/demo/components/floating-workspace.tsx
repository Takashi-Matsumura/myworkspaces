"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import {
  RefreshCw,
  CodeXml,
  Folder,
  FileText,
  ChevronRight,
  ChevronDown,
  Maximize2,
  TerminalSquare,
  List,
  X,
  Plus,
  Upload,
  Settings,
  ArrowLeft,
} from "lucide-react";
import type { View } from "./whiteboard-canvas";
import SettingsPanel from "./settings-panel";

type ContainerInfo = {
  exists: boolean;
  running: boolean;
  id?: string;
};

type ScenePos = { x: number; y: number };
type SceneSize = { w: number; h: number };

export type Workspace = {
  id: string;
  label: string;
  cwd: string; // /root/workspaces/{id}
  createdAt: number;
  lastOpenedAt: number;
};

type WorkspaceListEntry = {
  id: string;
  label: string;
  createdAt: number;
  lastOpenedAt: number;
};

type Entry = {
  name: string;
  isDir: boolean;
  size: number;
  mtimeMs: number;
};

type FilePayload = {
  path: string;
  size: number;
  truncated: boolean;
  content: string;
};

function workspaceToFull(e: WorkspaceListEntry): Workspace {
  return { ...e, cwd: `/root/workspaces/${e.id}` };
}

function join(base: string, name: string): string {
  return base.endsWith("/") ? `${base}${name}` : `${base}/${name}`;
}

async function apiListDir(path: string): Promise<Entry[]> {
  const res = await fetch(`/api/workspace?path=${encodeURIComponent(path)}`, { cache: "no-store" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  const data = (await res.json()) as { entries: Entry[] };
  return data.entries;
}

async function apiReadFile(path: string): Promise<FilePayload> {
  const res = await fetch(`/api/workspace/file?path=${encodeURIComponent(path)}`, { cache: "no-store" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as FilePayload;
}

async function apiListWorkspaces(): Promise<WorkspaceListEntry[]> {
  const res = await fetch("/api/user/workspaces", { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { workspaces: WorkspaceListEntry[] };
  return data.workspaces;
}

async function apiCreateWorkspace(label: string): Promise<WorkspaceListEntry> {
  const res = await fetch("/api/user/workspaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label }),
  });
  const data = (await res.json().catch(() => ({}))) as { workspace?: WorkspaceListEntry; error?: string };
  if (!res.ok || !data.workspace) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data.workspace;
}

async function apiDeleteWorkspace(id: string): Promise<void> {
  const res = await fetch(`/api/user/workspaces?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
}

async function apiUploadFile(
  targetDir: string,
  relativePath: string,
  file: File,
): Promise<void> {
  const form = new FormData();
  form.append("targetDir", targetDir);
  form.append("relativePath", relativePath);
  form.append("file", file);
  const res = await fetch("/api/workspace/upload", { method: "POST", body: form });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
}

type DroppedFile = { file: File; relativePath: string };

async function collectFromEntry(
  entry: FileSystemEntry,
  prefix: string,
  out: DroppedFile[],
): Promise<void> {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    const file = await new Promise<File>((resolve, reject) => fileEntry.file(resolve, reject));
    out.push({ file, relativePath: `${prefix}${entry.name}` });
    return;
  }
  if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry;
    const reader = dirEntry.createReader();
    let done = false;
    while (!done) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
        reader.readEntries(resolve, reject),
      );
      if (batch.length === 0) {
        done = true;
        break;
      }
      for (const child of batch) {
        await collectFromEntry(child, `${prefix}${entry.name}/`, out);
      }
    }
  }
}

async function collectDroppedFiles(items: DataTransferItemList): Promise<DroppedFile[]> {
  const out: DroppedFile[] = [];
  const promises: Promise<void>[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind !== "file") continue;
    const entry = (item as unknown as { webkitGetAsEntry?: () => FileSystemEntry | null }).webkitGetAsEntry?.();
    if (entry) {
      promises.push(collectFromEntry(entry, "", out));
    } else {
      const f = item.getAsFile();
      if (f) out.push({ file: f, relativePath: f.name });
    }
  }
  await Promise.all(promises);
  return out;
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
  onToggleDir,
  onSelectFile,
}: {
  parentPath: string;
  entry: Entry;
  depth: number;
  expanded: Set<string>;
  childEntries: Map<string, Entry[]>;
  selectedFile: string | null;
  loadingPaths: Set<string>;
  fontSize: number;
  onToggleDir: (p: string) => void;
  onSelectFile: (p: string) => void;
}) {
  const path = join(parentPath, entry.name);
  const isDir = entry.isDir;
  const isOpen = expanded.has(path);
  const isLoading = loadingPaths.has(path);
  const children = childEntries.get(path);
  const isSelected = selectedFile === path;
  return (
    <div>
      <button
        type="button"
        onClick={() => (isDir ? onToggleDir(path) : onSelectFile(path))}
        className={`flex w-full items-center gap-1 px-2 py-0.5 text-left font-mono transition-colors ${
          isSelected ? "bg-sky-100 text-sky-900" : "text-slate-700 hover:bg-slate-100"
        }`}
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
      {isDir && isOpen && children && (
        <div>
          {children.map((c) => (
            <TreeRow
              key={join(path, c.name)}
              parentPath={path}
              entry={c}
              depth={depth + 1}
              expanded={expanded}
              childEntries={childEntries}
              selectedFile={selectedFile}
              loadingPaths={loadingPaths}
              fontSize={fontSize}
              onToggleDir={onToggleDir}
              onSelectFile={onSelectFile}
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
  onToggleDir,
  onSelectFile,
}: {
  workspace: Workspace;
  expanded: Set<string>;
  childEntries: Map<string, Entry[]>;
  selectedFile: string | null;
  loadingPaths: Set<string>;
  fontSize: number;
  onToggleDir: (p: string) => void;
  onSelectFile: (p: string) => void;
}) {
  const rootPath = workspace.cwd;
  const isOpen = expanded.has(rootPath);
  const isLoading = loadingPaths.has(rootPath);
  const children = childEntries.get(rootPath);
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
              key={join(rootPath, c.name)}
              parentPath={rootPath}
              entry={c}
              depth={1}
              expanded={expanded}
              childEntries={childEntries}
              selectedFile={selectedFile}
              loadingPaths={loadingPaths}
              fontSize={fontSize}
              onToggleDir={onToggleDir}
              onSelectFile={onSelectFile}
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

export default function FloatingWorkspace({
  view,
  workspace,
  onWorkspaceChange,
  onStartCoding,
  onStartBusiness,
  onStartUbuntu,
  onZoomToFit,
  onResetContainer,
  z,
  onFocus,
}: {
  view: View;
  workspace: Workspace | null;
  onWorkspaceChange: (ws: Workspace | null) => void;
  onStartCoding: () => void;
  onStartBusiness: () => void;
  onStartUbuntu: () => void;
  onZoomToFit?: (rect: { x: number; y: number; w: number; h: number }) => void;
  onResetContainer: () => Promise<boolean>;
  z: number;
  onFocus?: () => void;
}) {
  const [flipped, setFlipped] = useState(false);
  // 初期位置は window 参照が必要だが、SSR 時は window が無いので lazy initializer の中で分岐。
  const [scenePos, setScenePos] = useState<ScenePos>(() => {
    if (typeof window === "undefined") return { x: 60, y: 60 };
    return {
      x: Math.max(0, (window.innerWidth - 640) / 2),
      y: Math.max(0, (window.innerHeight - 460) / 2),
    };
  });
  const [sceneSize, setSceneSize] = useState<SceneSize>({ w: 640, h: 460 });

  const [splitPct, setSplitPct] = useState(45);
  const [fontSize, setFontSize] = useState(() => {
    if (typeof window === "undefined") return 12;
    const saved = localStorage.getItem("workspace-fontSize");
    return saved ? Number(saved) : 12;
  });
  const changeFontSize = (delta: number) => {
    setFontSize((prev) => {
      const next = Math.min(20, Math.max(10, prev + delta));
      localStorage.setItem("workspace-fontSize", String(next));
      return next;
    });
  };
  const [childEntries, setChildEntries] = useState<Map<string, Entry[]>>(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<FilePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [registered, setRegistered] = useState<WorkspaceListEntry[]>([]);
  const [listOpen, setListOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [containerInfo, setContainerInfo] = useState<ContainerInfo | null>(null);

  const refetchContainer = useCallback(async () => {
    try {
      const res = await fetch("/api/container", { cache: "no-store" });
      if (res.ok) setContainerInfo((await res.json()) as ContainerInfo);
    } catch {
      // noop: ヘッダバッジが出ないだけなので握り潰す
    }
  }, []);

  // 初回 + コンテナが存在しない間は数秒おきにポーリング (ターミナル起動やリセット後に自動で反映される)。
  // 一度 id を掴んだら止まる。
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refetchContainer(); }, [refetchContainer]);
  useEffect(() => {
    if (containerInfo?.id) return;
    const t = setInterval(() => void refetchContainer(), 3000);
    return () => clearInterval(t);
  }, [containerInfo?.id, refetchContainer]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  const refreshList = useCallback(async () => {
    try {
      const list = await apiListWorkspaces();
      setRegistered(list);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  // 初回マウント時に 1 回だけ読み込む。
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refreshList(); }, [refreshList]);

  // 初回ロード時、登録済みワークスペースがあれば最も最近開いたものを自動で開く
  // (listWorkspaces は lastOpenedAt 降順で返るので、先頭 = 前回開いた ws)。
  // openWorkspace は下で定義されるので、effect 本体はマウント後に実行される。
  const autoOpenedRef = useRef(false);

  const dragRef = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);
  const resizeRef = useRef<{ sx: number; sy: number; sw: number; sh: number } | null>(null);
  const splitRef = useRef<{ sx: number; startPct: number; containerW: number } | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const onHeaderPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button,input")) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { sx: e.clientX, sy: e.clientY, px: scenePos.x, py: scenePos.y };
  };
  const onHeaderPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const d = dragRef.current;
    setScenePos({ x: d.px + (e.clientX - d.sx) / view.zoom, y: d.py + (e.clientY - d.sy) / view.zoom });
  };
  const onHeaderPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    dragRef.current = null;
  };

  const onResizePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    resizeRef.current = { sx: e.clientX, sy: e.clientY, sw: sceneSize.w, sh: sceneSize.h };
  };
  const onResizePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!resizeRef.current) return;
    const r = resizeRef.current;
    setSceneSize({
      w: Math.max(360, r.sw + (e.clientX - r.sx) / view.zoom),
      h: Math.max(220, r.sh + (e.clientY - r.sy) / view.zoom),
    });
  };
  const onResizePointerUp = (e: PointerEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    resizeRef.current = null;
  };

  const onSplitPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const rect = bodyRef.current?.getBoundingClientRect();
    if (!rect) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    splitRef.current = { sx: e.clientX, startPct: splitPct, containerW: rect.width / view.zoom };
  };
  const onSplitPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!splitRef.current) return;
    const s = splitRef.current;
    const deltaPct = ((e.clientX - s.sx) / view.zoom / s.containerW) * 100;
    const next = Math.max(15, Math.min(85, s.startPct + deltaPct));
    setSplitPct(next);
  };
  const onSplitPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    splitRef.current = null;
  };

  const loadDir = useCallback(async (path: string) => {
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
  }, []);

  const openWorkspace = useCallback(
    async (e: WorkspaceListEntry) => {
      const ws = workspaceToFull(e);
      onWorkspaceChange(ws);
      setExpanded(new Set([ws.cwd]));
      setChildEntries(new Map());
      setSelectedFile(null);
      setFileContent(null);
      setListOpen(false);
      await loadDir(ws.cwd);
      // touch lastOpenedAt
      try {
        await fetch("/api/user/workspaces", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: ws.id }),
        });
      } catch {}
      await refreshList();
    },
    [loadDir, onWorkspaceChange, refreshList],
  );

  useEffect(() => {
    if (autoOpenedRef.current) return;
    if (workspace) return;
    if (registered.length === 0) return;
    autoOpenedRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void openWorkspace(registered[0]);
  }, [registered, workspace, openWorkspace]);

  const createWorkspace = useCallback(async () => {
    const label = prompt("新しいワークスペースの名前を入力", "project");
    if (!label || !label.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await apiCreateWorkspace(label.trim());
      await refreshList();
      await openWorkspace(created);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [openWorkspace, refreshList]);

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
    [onWorkspaceChange, refreshList, workspace],
  );

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

  const onSelectFile = useCallback(
    async (p: string) => {
      if (!workspace) return;
      setSelectedFile(p);
      setFileContent(null);
      setFileLoading(true);
      setError(null);
      try {
        const data = await apiReadFile(p);
        setFileContent(data);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setFileLoading(false);
      }
    },
    [workspace],
  );

  const onRefresh = useCallback(async () => {
    if (!workspace) return;
    const paths = Array.from(expanded);
    await Promise.all(paths.map((p) => loadDir(p)));
    if (selectedFile) {
      try {
        const data = await apiReadFile(selectedFile);
        setFileContent(data);
      } catch (e) {
        setError((e as Error).message);
      }
    }
  }, [expanded, loadDir, selectedFile, workspace]);

  const [dragOver, setDragOver] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const dragDepthRef = useRef(0);

  const onDropFiles = useCallback(
    async (e: React.DragEvent) => {
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
        await onRefresh();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setUploadBusy(false);
      }
    },
    [onRefresh, workspace],
  );

  const onDragEnter = useCallback((e: React.DragEvent) => {
    if (!workspace) return;
    if (!e.dataTransfer?.types?.includes("Files")) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setDragOver(true);
  }, [workspace]);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragOver(false);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (!workspace) return;
    if (!e.dataTransfer?.types?.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, [workspace]);

  const left = (scenePos.x + view.x) * view.zoom;
  const top = (scenePos.y + view.y) * view.zoom;

  return (
    <div
      className="fixed"
      style={{
        left: 0,
        top: 0,
        width: sceneSize.w,
        height: sceneSize.h,
        transform: `translate(${left}px, ${top}px) scale(${view.zoom})`,
        transformOrigin: "top left",
        perspective: 1200,
        zIndex: z,
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        onFocus?.();
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          transformStyle: "preserve-3d",
          transition: "transform 0.6s ease-in-out",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        {/* Front */}
        <div
          className="flex flex-col overflow-hidden rounded-lg border border-slate-300 bg-white shadow-2xl shadow-slate-900/20"
          style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden" }}
        >
      <div
        className="flex h-9 cursor-grab items-center justify-between gap-2 rounded-t-lg border-b border-slate-200 bg-slate-50 px-3 text-xs text-slate-600 active:cursor-grabbing select-none"
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onZoomToFit?.({ x: scenePos.x, y: scenePos.y, w: sceneSize.w, h: sceneSize.h });
            }}
            className="group h-3 w-3 rounded-full bg-[#28c840] hover:brightness-110"
            title="80% フィット表示"
          >
            <Maximize2 className="hidden h-2.5 w-2.5 stroke-[3] text-black/60 group-hover:block" style={{ margin: "0.5px" }} />
          </button>
          <span className="font-mono font-medium text-slate-700">workspace</span>
          {containerInfo?.id && (
            <span
              className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-500"
              title={`Docker container ID (${containerInfo.running ? "running" : "stopped"})`}
            >
              {containerInfo.id}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="truncate font-mono text-[10px] text-slate-400">
            {workspace?.cwd ?? "(no workspace open)"}
          </span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                changeFontSize(-1);
              }}
              className="rounded px-1 text-[10px] text-slate-500 hover:bg-slate-200 hover:text-slate-700"
              title="文字サイズを下げる"
            >
              A-
            </button>
            <span className="min-w-[1.5rem] text-center font-mono text-[10px] text-slate-500">{fontSize}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                changeFontSize(1);
              }}
              className="rounded px-1 text-[10px] text-slate-500 hover:bg-slate-200 hover:text-slate-700"
              title="文字サイズを上げる"
            >
              A+
            </button>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setFlipped(true);
            }}
            className="rounded p-0.5 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
            title="設定"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

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
          onClick={() => void onRefresh()}
          disabled={!workspace}
          className="inline-flex shrink-0 items-center rounded border border-slate-300 bg-white p-1 text-slate-700 hover:bg-slate-50 disabled:opacity-30"
          title="Refresh"
        >
          <RefreshCw className="h-3.5 w-3.5" />
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
            Coding
          </button>
          <button
            type="button"
            onClick={onStartBusiness}
            disabled={!workspace}
            className="inline-flex shrink-0 items-center gap-1 rounded border border-[#217346] bg-[#217346] px-2 py-1 text-xs font-semibold text-white shadow-sm hover:bg-[#1a5c38] disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
            title={workspace ? `Business パネルを ${workspace.cwd} で起動` : "先にワークスペースを選択してください"}
          >
            <CodeXml className="h-3.5 w-3.5 shrink-0" />
            Business
          </button>
          <button
            type="button"
            onClick={onStartUbuntu}
            disabled={!workspace}
            className="inline-flex shrink-0 items-center gap-1 rounded border border-indigo-700 bg-indigo-700 px-2 py-1 text-xs font-semibold text-white shadow-sm hover:bg-indigo-600 disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
            title={workspace ? `Bash パネルを ${workspace.cwd} で起動` : "先にワークスペースを選択してください"}
          >
            <TerminalSquare className="h-3.5 w-3.5 shrink-0" />
            Bash
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
                      onClick={() => void openWorkspace(w)}
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

      {error && (
        <div className="border-b border-rose-200 bg-rose-50 px-3 py-1 font-mono text-[11px] text-rose-700">{error}</div>
      )}
      {notice && (
        <div className="border-b border-sky-200 bg-sky-50 px-3 py-1 font-mono text-[11px] text-sky-800 break-all">{notice}</div>
      )}

      <div ref={bodyRef} className="flex min-h-0 flex-1">
        <div
          className={`relative min-w-0 overflow-auto border-r border-slate-200 py-1 transition-colors ${
            dragOver ? "bg-sky-50 ring-2 ring-inset ring-sky-400" : "bg-slate-50/60"
          }`}
          style={{ width: `${splitPct}%` }}
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
              onToggleDir={onToggleDir}
              onSelectFile={onSelectFile}
            />
          ) : (
            <div className="px-3 py-2 font-mono text-slate-400" style={{ fontSize }}>
              「一覧」から選ぶか、「新規」でワークスペースを作成してください。
            </div>
          )}
        </div>
        <div
          className="w-1 shrink-0 cursor-ew-resize bg-slate-200 hover:bg-sky-300"
          onPointerDown={onSplitPointerDown}
          onPointerMove={onSplitPointerMove}
          onPointerUp={onSplitPointerUp}
        />
        <div className="relative min-w-0 flex-1 overflow-auto bg-white">
          {fileLoading && (
            <div className="px-3 py-2 font-mono text-slate-400" style={{ fontSize }}>reading…</div>
          )}
          {!fileLoading && fileContent && (
            <>
              <div className="sticky top-0 border-b border-slate-200 bg-slate-50 px-3 py-1 font-mono text-[10px] text-slate-500">
                {fileContent.path.split("/").pop()}
                {fileContent.truncated && <span className="ml-2 text-amber-600">(truncated to 512KB)</span>}
              </div>
              <pre
                className="px-3 py-2 font-mono whitespace-pre-wrap break-words text-slate-800"
                style={{ fontSize }}
              >
                {fileContent.content}
              </pre>
            </>
          )}
          {!fileLoading && !fileContent && (
            <div className="px-3 py-2 font-mono text-slate-400" style={{ fontSize }}>ファイル表示（簡易）</div>
          )}
          <div
            className="absolute right-0 bottom-0 h-4 w-4 cursor-nwse-resize"
            onPointerDown={onResizePointerDown}
            onPointerMove={onResizePointerMove}
            onPointerUp={onResizePointerUp}
            style={{ background: "linear-gradient(135deg, transparent 50%, rgba(100,116,139,0.4) 50%)" }}
          />
        </div>
      </div>
        </div>

        {/* Back (settings) */}
        <div
          className="flex flex-col overflow-hidden rounded-lg border border-slate-300 bg-white shadow-2xl shadow-slate-900/20"
          style={{
            position: "absolute",
            inset: 0,
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          <div
            className="flex h-9 cursor-grab items-center justify-between gap-2 rounded-t-lg border-b border-slate-200 bg-slate-50 px-3 text-xs text-slate-600 active:cursor-grabbing select-none"
            onPointerDown={onHeaderPointerDown}
            onPointerMove={onHeaderPointerMove}
            onPointerUp={onHeaderPointerUp}
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setFlipped(false);
                }}
                className="rounded p-0.5 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                title="Workspace パネルに戻る"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
              <Settings className="h-3.5 w-3.5 text-slate-500" />
              <span className="font-mono font-medium text-slate-700">settings</span>
            </div>
            <span className="truncate font-mono text-[10px] text-slate-400">
              sub: demo
            </span>
          </div>
          <SettingsPanel onResetContainer={onResetContainer} />
          <div
            className="absolute right-0 bottom-0 h-4 w-4 cursor-nwse-resize"
            onPointerDown={onResizePointerDown}
            onPointerMove={onResizePointerMove}
            onPointerUp={onResizePointerUp}
            style={{ background: "linear-gradient(135deg, transparent 50%, rgba(100,116,139,0.4) 50%)" }}
          />
        </div>
      </div>
    </div>
  );
}
