import type { PreviewResult } from "@/lib/preview";
import {
  ApiErrorSchema,
  CreateWorkspaceResponseSchema,
  ListDirResponseSchema,
  ListWorkspacesResponseSchema,
  PreviewResultSchema,
} from "@/lib/api-schemas";

export type WorkspaceListEntry = {
  id: string;
  label: string;
  createdAt: number;
  lastOpenedAt: number;
};

export type Entry = {
  name: string;
  isDir: boolean;
  size: number;
  mtimeMs: number;
};

export type DroppedFile = { file: File; relativePath: string };

export function joinPath(base: string, name: string): string {
  return base.endsWith("/") ? `${base}${name}` : `${base}/${name}`;
}

async function readError(res: Response): Promise<string> {
  const body = ApiErrorSchema.safeParse(await res.json().catch(() => ({})));
  return body.success ? (body.data.error ?? `HTTP ${res.status}`) : `HTTP ${res.status}`;
}

export async function apiListDir(path: string): Promise<Entry[]> {
  const res = await fetch(`/api/workspace?path=${encodeURIComponent(path)}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res));
  const data = ListDirResponseSchema.parse(await res.json());
  return data.entries;
}

export async function apiPreviewFile(path: string): Promise<PreviewResult> {
  const res = await fetch(`/api/workspace/preview?path=${encodeURIComponent(path)}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res));
  return PreviewResultSchema.parse(await res.json());
}

export async function apiListWorkspaces(): Promise<WorkspaceListEntry[]> {
  const res = await fetch("/api/user/workspaces", { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = ListWorkspacesResponseSchema.parse(await res.json());
  return data.workspaces;
}

export async function apiCreateWorkspace(label: string): Promise<WorkspaceListEntry> {
  const res = await fetch("/api/user/workspaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label }),
  });
  const parsed = CreateWorkspaceResponseSchema.safeParse(await res.json().catch(() => ({})));
  const data = parsed.success ? parsed.data : {};
  if (!res.ok || !data.workspace) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data.workspace;
}

export async function apiDeleteWorkspace(id: string): Promise<void> {
  const res = await fetch(`/api/user/workspaces?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await readError(res));
}

export async function apiTouchWorkspace(id: string): Promise<void> {
  const res = await fetch("/api/user/workspaces", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export async function apiActivateOpencode(workspaceId: string): Promise<void> {
  const res = await fetch("/api/opencode/activate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export async function apiUploadFile(
  targetDir: string,
  relativePath: string,
  file: File,
): Promise<void> {
  const form = new FormData();
  form.append("targetDir", targetDir);
  form.append("relativePath", relativePath);
  form.append("file", file);
  const res = await fetch("/api/workspace/upload", { method: "POST", body: form });
  if (!res.ok) throw new Error(await readError(res));
}

export async function apiDeleteFile(path: string): Promise<void> {
  const res = await fetch(`/api/workspace/file?path=${encodeURIComponent(path)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await readError(res));
}

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

export async function collectDroppedFiles(items: DataTransferItemList): Promise<DroppedFile[]> {
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
