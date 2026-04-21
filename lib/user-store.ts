import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { sanitizeSub } from "./user";

// 各ワークスペースはコンテナ内 /root/workspaces/{id}/ に 1 対 1 で対応する。
// path フィールドはホスト側には持たない (named volume で隔離されているため)。
export type WorkspaceEntry = {
  id: string;
  label: string;
  createdAt: number;
  lastOpenedAt: number;
};

export type UserProfile = {
  sub: string;
  workspaces: WorkspaceEntry[];
};

const APP_DATA_DIR = path.join(os.homedir(), ".myworkspaces");
const USERS_DIR = path.join(APP_DATA_DIR, "users");

function userFilePath(sub: string): string {
  return path.join(USERS_DIR, `${sanitizeSub(sub)}.json`);
}

async function ensureDirs(): Promise<void> {
  await fs.mkdir(USERS_DIR, { recursive: true, mode: 0o700 });
}

async function readProfile(sub: string): Promise<UserProfile | null> {
  try {
    const raw = await fs.readFile(userFilePath(sub), "utf-8");
    return JSON.parse(raw) as UserProfile;
  } catch {
    return null;
  }
}

async function writeProfileAtomic(profile: UserProfile): Promise<void> {
  const finalPath = userFilePath(profile.sub);
  const tmp = `${finalPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(profile, null, 2) + "\n", {
    encoding: "utf-8",
    mode: 0o600,
  });
  await fs.rename(tmp, finalPath);
}

export async function getUserProfile(sub: string): Promise<UserProfile> {
  await ensureDirs();
  const existing = await readProfile(sub);
  if (existing) return existing;
  const fresh: UserProfile = { sub, workspaces: [] };
  await writeProfileAtomic(fresh);
  return fresh;
}

async function mutate(
  sub: string,
  fn: (p: UserProfile) => UserProfile,
): Promise<UserProfile> {
  const current = await getUserProfile(sub);
  const next = fn(current);
  await writeProfileAtomic(next);
  return next;
}

export function workspaceCwd(id: string): string {
  return `/root/workspaces/${id}`;
}

export async function listWorkspaces(sub: string): Promise<WorkspaceEntry[]> {
  const profile = await getUserProfile(sub);
  return [...profile.workspaces].sort(
    (a, b) => b.lastOpenedAt - a.lastOpenedAt,
  );
}

export async function findWorkspaceById(
  sub: string,
  id: string,
): Promise<WorkspaceEntry | null> {
  const profile = await getUserProfile(sub);
  return profile.workspaces.find((w) => w.id === id) ?? null;
}

export async function createWorkspaceEntry(
  sub: string,
  label: string,
): Promise<WorkspaceEntry> {
  const entry: WorkspaceEntry = {
    id: `ws_${randomUUID().slice(0, 12)}`,
    label,
    createdAt: Date.now(),
    lastOpenedAt: Date.now(),
  };
  await mutate(sub, (p) => ({ ...p, workspaces: [...p.workspaces, entry] }));
  return entry;
}

export async function touchWorkspace(
  sub: string,
  id: string,
): Promise<WorkspaceEntry | null> {
  let touched: WorkspaceEntry | null = null;
  await mutate(sub, (p) => {
    const found = p.workspaces.find((w) => w.id === id);
    if (found) {
      found.lastOpenedAt = Date.now();
      touched = found;
    }
    return p;
  });
  return touched;
}

export async function renameWorkspace(
  sub: string,
  id: string,
  label: string,
): Promise<WorkspaceEntry | null> {
  let updated: WorkspaceEntry | null = null;
  await mutate(sub, (p) => {
    const found = p.workspaces.find((w) => w.id === id);
    if (found) {
      found.label = label;
      updated = found;
    }
    return p;
  });
  return updated;
}

export async function removeWorkspaceEntry(
  sub: string,
  id: string,
): Promise<boolean> {
  let removed = false;
  await mutate(sub, (p) => {
    const next = p.workspaces.filter((w) => w.id !== id);
    removed = next.length !== p.workspaces.length;
    return { ...p, workspaces: next };
  });
  return removed;
}
