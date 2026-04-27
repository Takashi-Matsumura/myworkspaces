import { z } from "zod";

// ===== Workspace API =====

export const EntrySchema = z.object({
  name: z.string(),
  isDir: z.boolean(),
  size: z.number(),
  mtimeMs: z.number(),
});

export const WorkspaceListEntrySchema = z.object({
  id: z.string(),
  label: z.string(),
  createdAt: z.number(),
  lastOpenedAt: z.number(),
});

export const ListDirResponseSchema = z.object({
  entries: z.array(EntrySchema),
});

export const ListWorkspacesResponseSchema = z.object({
  workspaces: z.array(WorkspaceListEntrySchema),
});

export const CreateWorkspaceResponseSchema = z.object({
  workspace: WorkspaceListEntrySchema.optional(),
  error: z.string().optional(),
});

// PreviewResult: lib/preview.ts と同形 (二重管理を避けるため z.infer は使わず、
// 既存 type は据え置き。ここでは parse 用の schema のみ定義する)。
export const PreviewResultSchema = z.object({
  kind: z.enum(["markdown", "text", "image", "unsupported"]),
  path: z.string(),
  size: z.number(),
  truncated: z.boolean(),
  content: z.string().optional(),
  language: z.string().optional(),
  rawUrl: z.string().optional(),
  converted: z.enum(["xlsx", "csv", "pdf"]).optional(),
});

// ===== Settings / Container / Network =====

export const SettingsShapeSchema = z.object({
  opencode: z.object({
    provider: z.enum(["llama-server", "anthropic", "openai"]),
    endpoint: z.string(),
    model: z.string(),
    apiKey: z.string(),
  }),
  appearance: z.object({
    defaultFontSize: z.number(),
    defaultPanelWidth: z.number(),
    defaultPanelHeight: z.number(),
    cursorStyle: z.enum(["bar", "block", "underline"]),
    scrollback: z.number(),
  }),
});

export const SettingsResponseSchema = z.object({
  settings: SettingsShapeSchema,
});

export const ContainerStatusSchema = z.object({
  exists: z.boolean(),
  running: z.boolean(),
  id: z.string().optional(),
  networkMode: z.string().optional(),
  isolated: z.boolean().optional(),
});

export const NetworkStatusSchema = z.object({
  requested: z.boolean(),
  effective: z.boolean().nullable(),
  networkMode: z.string().nullable(),
});

// ===== RAG =====

export const RagDocSchema = z.object({
  id: z.string(),
  filename: z.string(),
  bytes: z.number(),
  chunkCount: z.number(),
  createdAt: z.string(),
});

export const RagDocsResponseSchema = z.object({
  documents: z.array(RagDocSchema),
});

// ===== OpenCode Skills =====

export const SkillSummarySchema = z.object({
  name: z.string(),
  description: z.string(),
});

export const SkillsResponseSchema = z.object({
  skills: z.array(SkillSummarySchema),
});

export const SkillDetailSchema = z.object({
  name: z.string(),
  description: z.string(),
  body: z.string(),
});

// ===== Biz / DeepSearch Usage =====

export const BizUsageSchema = z.object({
  provider: z.string(),
  monthKey: z.string(),
  monthCount: z.number(),
  sessionCount: z.number(),
  cacheHitCount: z.number(),
  cacheSize: z.number(),
  lastErrorAt: z.number().nullable(),
  lastError: z.string().nullable(),
  // Phase E-B-2 で追加: RAG 取り込みの永続統計
  ragDocCount: z.number(),
  ragLastIngestAt: z.number().nullable(),
});

// Phase E-B-2: sync-rag route のレスポンス
const SyncedFileSchema = z.object({
  id: z.string(),
  relativePath: z.string(),
  bytes: z.number(),
  chunkCount: z.number(),
  updated: z.boolean(),
});

export const SyncRagResponseSchema = z.object({
  synced: z.array(SyncedFileSchema),
  skipped: z.array(SyncedFileSchema),
  failed: z.array(
    z.object({
      relativePath: z.string(),
      error: z.string(),
    }),
  ),
});

// ===== OpenCode Sessions / Config =====

export const SessionInfoSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  directory: z.string().optional(),
  projectID: z.string().optional(),
  version: z.string().optional(),
  time: z.object({
    created: z.number().optional(),
    updated: z.number().optional(),
  }).optional(),
  // opencode 側で他のフィールドが増える可能性に備えて passthrough
}).passthrough();

export const SessionsResponseSchema = z.array(SessionInfoSchema);

export const OpencodeConfigSchema = z.object({
  workspaceId: z.string(),
  providerID: z.string(),
  modelID: z.string(),
  providerName: z.string(),
  modelName: z.string(),
});

// ===== Workspaces sub-list (rules sync で使う最小形) =====

export const WorkspaceMinimalListSchema = z.object({
  workspaces: z.array(z.object({ id: z.string(), label: z.string() })),
});

// ===== 共通: error フィールドのみ拾う =====

export const ApiErrorSchema = z.object({
  error: z.string().optional(),
});
