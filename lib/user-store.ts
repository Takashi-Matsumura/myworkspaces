import { randomUUID } from "node:crypto";
import { prisma } from "./prisma";

// 各ワークスペースはコンテナ内 /root/workspaces/{id}/ に 1 対 1 で対応する。
export type WorkspaceEntry = {
  id: string;
  label: string;
  createdAt: number;
  lastOpenedAt: number;
};

function toEntry(row: {
  id: string;
  label: string;
  createdAt: Date;
  lastOpenedAt: Date;
}): WorkspaceEntry {
  return {
    id: row.id,
    label: row.label,
    createdAt: row.createdAt.getTime(),
    lastOpenedAt: row.lastOpenedAt.getTime(),
  };
}

export function workspaceCwd(id: string): string {
  return `/root/workspaces/${id}`;
}

export async function listWorkspaces(sub: string): Promise<WorkspaceEntry[]> {
  const rows = await prisma.workspace.findMany({
    where: { userId: sub },
    orderBy: { lastOpenedAt: "desc" },
  });
  return rows.map(toEntry);
}

export async function findWorkspaceById(
  sub: string,
  id: string,
): Promise<WorkspaceEntry | null> {
  const row = await prisma.workspace.findFirst({ where: { userId: sub, id } });
  return row ? toEntry(row) : null;
}

export async function createWorkspaceEntry(
  sub: string,
  label: string,
): Promise<WorkspaceEntry> {
  const id = `ws_${randomUUID().slice(0, 12)}`;
  const row = await prisma.workspace.create({
    data: { id, userId: sub, label },
  });
  return toEntry(row);
}

export async function touchWorkspace(
  sub: string,
  id: string,
): Promise<WorkspaceEntry | null> {
  const row = await prisma.workspace
    .update({
      where: { id },
      data: { lastOpenedAt: new Date() },
    })
    .catch(() => null);
  // userId の一致を保証 (update where は id のみだったため)
  if (!row || row.userId !== sub) return null;
  return toEntry(row);
}

export async function renameWorkspace(
  sub: string,
  id: string,
  label: string,
): Promise<WorkspaceEntry | null> {
  const existing = await prisma.workspace.findFirst({
    where: { userId: sub, id },
  });
  if (!existing) return null;
  const row = await prisma.workspace.update({
    where: { id },
    data: { label },
  });
  return toEntry(row);
}

export async function removeWorkspaceEntry(
  sub: string,
  id: string,
): Promise<boolean> {
  const res = await prisma.workspace.deleteMany({
    where: { userId: sub, id },
  });
  return res.count > 0;
}
