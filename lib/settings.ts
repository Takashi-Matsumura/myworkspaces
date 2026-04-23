import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { sanitizeSub } from "./user";

export type OpencodeProvider = "llama-server" | "anthropic" | "openai";

export type OpencodeSettings = {
  provider: OpencodeProvider;
  endpoint: string; // llama-server only
  model: string;
  apiKey: string; // base64-encoded (obfuscation only, demo scope)
};

export type AppearanceSettings = {
  defaultFontSize: number;
};

export type UserSettings = {
  opencode: OpencodeSettings;
  appearance: AppearanceSettings;
};

// 既定の endpoint は RAG サイドカー (per-user container、同じ user-network 上で
// "rag-sidecar" alias で解決される)。サイドカーが OpenAI 互換 proxy として動作し、
// 内部で検索→文脈注入→ホストの llama-server (:8080) に中継する。
// サイドカーを経由したくない場合は、Settings → OpenCode で endpoint を
// "http://host.docker.internal:8080" に上書きすれば従来の直結に戻せる。
const DEFAULT_SETTINGS: UserSettings = {
  opencode: {
    provider: "llama-server",
    endpoint: "http://rag-sidecar:9090",
    model: "gemma-4-e4b-it-Q4_K_M.gguf",
    apiKey: "",
  },
  appearance: {
    defaultFontSize: 13,
  },
};

const APP_DATA_DIR = path.join(os.homedir(), ".myworkspaces");
const USERS_DIR = path.join(APP_DATA_DIR, "users");

function settingsFilePath(sub: string): string {
  return path.join(USERS_DIR, `${sanitizeSub(sub)}.settings.json`);
}

async function ensureDirs(): Promise<void> {
  await fs.mkdir(USERS_DIR, { recursive: true, mode: 0o700 });
}

function mergeWithDefaults(partial: Partial<UserSettings>): UserSettings {
  return {
    opencode: { ...DEFAULT_SETTINGS.opencode, ...(partial.opencode ?? {}) },
    appearance: { ...DEFAULT_SETTINGS.appearance, ...(partial.appearance ?? {}) },
  };
}

export async function getSettings(sub: string): Promise<UserSettings> {
  await ensureDirs();
  try {
    const raw = await fs.readFile(settingsFilePath(sub), "utf-8");
    return mergeWithDefaults(JSON.parse(raw) as Partial<UserSettings>);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(sub: string, settings: UserSettings): Promise<void> {
  await ensureDirs();
  const finalPath = settingsFilePath(sub);
  const tmp = `${finalPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(settings, null, 2) + "\n", {
    encoding: "utf-8",
    mode: 0o600,
  });
  await fs.rename(tmp, finalPath);
}

// base64 は難読化のみで暗号化ではない。ローカルデモ用の妥協。
export function encodeApiKey(plain: string): string {
  return Buffer.from(plain, "utf-8").toString("base64");
}

export function decodeApiKey(encoded: string): string {
  if (!encoded) return "";
  try {
    return Buffer.from(encoded, "base64").toString("utf-8");
  } catch {
    return "";
  }
}

// 設定から opencode.json の内容を生成する。新規ワークスペース作成時に使用。
// 既存ワークスペースの opencode.json は変更しない。
export function buildOpencodeJson(settings: UserSettings): string {
  const s = settings.opencode;
  const instructions = [
    "language-rules.md",
    "vision-rules.md",
    "business-rules.md",
    "pdf-rules.md",
  ];

  if (s.provider === "llama-server") {
    const model = s.model.trim() || "gemma-4-e4b-it-Q4_K_M.gguf";
    const base = (s.endpoint.trim() || "http://host.docker.internal:8080").replace(/\/$/, "");
    const config = {
      $schema: "https://opencode.ai/config.json",
      instructions,
      provider: {
        llamacpp: {
          npm: "@ai-sdk/openai-compatible",
          name: "llama.cpp (local)",
          options: { baseURL: `${base}/v1` },
          models: {
            [model]: { name: model, reasoning: true },
          },
        },
      },
      model: `llamacpp/${model}`,
    };
    return JSON.stringify(config, null, 2) + "\n";
  }

  if (s.provider === "anthropic") {
    const model = s.model.trim() || "claude-sonnet-4-6";
    const config = {
      $schema: "https://opencode.ai/config.json",
      instructions,
      provider: {
        anthropic: {
          npm: "@ai-sdk/anthropic",
          name: "Anthropic",
          options: { apiKey: decodeApiKey(s.apiKey) },
          models: {
            [model]: { name: model },
          },
        },
      },
      model: `anthropic/${model}`,
    };
    return JSON.stringify(config, null, 2) + "\n";
  }

  // openai
  const model = s.model.trim() || "gpt-4o";
  const config = {
    $schema: "https://opencode.ai/config.json",
    instructions,
    provider: {
      openai: {
        npm: "@ai-sdk/openai",
        name: "OpenAI",
        options: { apiKey: decodeApiKey(s.apiKey) },
        models: {
          [model]: { name: model },
        },
      },
    },
    model: `openai/${model}`,
  };
  return JSON.stringify(config, null, 2) + "\n";
}
