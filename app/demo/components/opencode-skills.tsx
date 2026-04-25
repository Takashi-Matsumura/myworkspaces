"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Save, Trash2, RefreshCw, X } from "lucide-react";
import {
  ApiErrorSchema,
  SkillDetailSchema,
  SkillsResponseSchema,
} from "@/lib/api-schemas";

type SkillSummary = {
  name: string;
  description: string;
};

type SkillDetail = SkillSummary & { body: string };

type SkillsVariant = "business" | "coding";

type SkillsTheme = {
  rootBg: string;
  rootText: string;
  sidebarBg: string;
  sidebarBorder: string;
  sidebarHeaderBorder: string;
  newBtn: string;
  iconBtn: string;
  mutedText: string;
  itemBorder: string;
  itemActive: string;
  itemHover: string;
  itemDescription: string;
  itemDangerIcon: string;
  emptyText: string;
  codeBox: string;
  editHeaderBg: string;
  editHeaderBorder: string;
  editLabel: string;
  fieldLabel: string;
  nameInput: string;
  fieldInput: string;
  fieldTextarea: string;
  saveBtn: string;
  closeBtn: string;
  errorBanner: string;
};

const SKILLS_THEMES: Record<SkillsVariant, SkillsTheme> = {
  business: {
    rootBg: "bg-white",
    rootText: "text-gray-900",
    sidebarBg: "bg-gray-50",
    sidebarBorder: "border-gray-200",
    sidebarHeaderBorder: "border-gray-200",
    newBtn: "bg-emerald-600 text-white hover:bg-emerald-500",
    iconBtn: "text-gray-500 hover:bg-gray-200",
    mutedText: "text-gray-400",
    itemBorder: "border-gray-100",
    itemActive: "bg-emerald-100",
    itemHover: "hover:bg-white",
    itemDescription: "text-gray-500",
    itemDangerIcon: "text-gray-400 hover:text-red-600",
    emptyText: "text-gray-400",
    codeBox: "bg-gray-100 text-gray-600",
    editHeaderBg: "bg-gray-50",
    editHeaderBorder: "border-gray-200",
    editLabel: "text-gray-500",
    fieldLabel: "text-gray-600",
    nameInput:
      "border border-gray-300 bg-white text-gray-900 focus:border-emerald-500 disabled:bg-gray-100 disabled:text-gray-600",
    fieldInput:
      "border border-gray-300 bg-white text-gray-900 focus:border-emerald-500",
    fieldTextarea:
      "border border-gray-300 bg-white text-gray-900 focus:border-emerald-500",
    saveBtn:
      "bg-emerald-600 text-white hover:bg-emerald-500 disabled:bg-gray-300 disabled:text-white",
    closeBtn: "text-gray-500 hover:bg-gray-200",
    errorBanner: "border-t border-red-200 bg-red-50 text-red-700",
  },
  coding: {
    rootBg: "bg-[#0b0b0f]",
    rootText: "text-white/90",
    sidebarBg: "bg-[#15151c]",
    sidebarBorder: "border-white/10",
    sidebarHeaderBorder: "border-white/10",
    newBtn: "bg-emerald-600 text-white hover:bg-emerald-500",
    iconBtn: "text-white/60 hover:bg-white/10 hover:text-white/90",
    mutedText: "text-white/40",
    itemBorder: "border-white/5",
    itemActive: "bg-emerald-500/20",
    itemHover: "hover:bg-white/5",
    itemDescription: "text-white/50",
    itemDangerIcon: "text-white/40 hover:text-red-400",
    emptyText: "text-white/50",
    codeBox: "bg-white/10 text-white/80",
    editHeaderBg: "bg-[#15151c]",
    editHeaderBorder: "border-white/10",
    editLabel: "text-white/60",
    fieldLabel: "text-white/70",
    nameInput:
      "border border-white/20 bg-[#0f0f14] text-white/90 focus:border-emerald-400 disabled:bg-white/5 disabled:text-white/40",
    fieldInput:
      "border border-white/20 bg-[#0f0f14] text-white/90 focus:border-emerald-400",
    fieldTextarea:
      "border border-white/20 bg-[#0f0f14] text-white/90 focus:border-emerald-400",
    saveBtn:
      "bg-emerald-600 text-white hover:bg-emerald-500 disabled:bg-white/10 disabled:text-white/40",
    closeBtn: "text-white/60 hover:bg-white/10 hover:text-white/90",
    errorBanner: "border-t border-red-500/30 bg-red-500/10 text-red-300",
  },
};

async function apiList(): Promise<SkillSummary[]> {
  const res = await fetch("/api/opencode/skills", { cache: "no-store" });
  if (!res.ok) {
    const parsed = ApiErrorSchema.safeParse(await res.json().catch(() => ({})));
    throw new Error(parsed.success ? (parsed.data.error ?? `HTTP ${res.status}`) : `HTTP ${res.status}`);
  }
  return SkillsResponseSchema.parse(await res.json()).skills;
}

async function apiGet(name: string): Promise<SkillDetail> {
  const res = await fetch(`/api/opencode/skills/${encodeURIComponent(name)}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    const parsed = ApiErrorSchema.safeParse(await res.json().catch(() => ({})));
    throw new Error(parsed.success ? (parsed.data.error ?? `HTTP ${res.status}`) : `HTTP ${res.status}`);
  }
  return SkillDetailSchema.parse(await res.json());
}

async function apiSave(detail: SkillDetail): Promise<void> {
  const res = await fetch("/api/opencode/skills", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(detail),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
}

async function apiDelete(name: string): Promise<void> {
  const res = await fetch(`/api/opencode/skills/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
}

// ユーザー全体スキル (~/.config/opencode/skills/<name>/SKILL.md) の CRUD UI。
// 左: 一覧 + 新規ボタン、右: 選択中スキルのフォーム (name / description / body)。
export default function OpencodeSkills({
  fontSize = 13,
  variant = "business",
}: {
  fontSize?: number;
  variant?: SkillsVariant;
}) {
  const theme = SKILLS_THEMES[variant];
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<SkillDetail | null>(null);
  // 新規作成モード: name はユーザー入力。編集モード: name は read-only。
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSkills(await apiList());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectSkill = useCallback(async (name: string) => {
    setError(null);
    setCreating(false);
    setDirty(false);
    try {
      const detail = await apiGet(name);
      setSelected(detail);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  const startCreate = useCallback(() => {
    setCreating(true);
    setDirty(false);
    setError(null);
    setSelected({ name: "", description: "", body: "" });
  }, []);

  const cancelEdit = useCallback(() => {
    setSelected(null);
    setCreating(false);
    setDirty(false);
    setError(null);
  }, []);

  const save = useCallback(async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await apiSave(selected);
      await refresh();
      setDirty(false);
      setCreating(false);
      // 作成直後は selected の name をそのまま維持 (編集モードに移行)
      window.dispatchEvent(new CustomEvent("myworkspaces:skills-changed"));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }, [selected, refresh]);

  const remove = useCallback(
    async (name: string) => {
      if (!confirm(`スキル「${name}」を削除します。よろしいですか？`)) return;
      setError(null);
      try {
        await apiDelete(name);
        if (selected?.name === name) cancelEdit();
        await refresh();
        window.dispatchEvent(new CustomEvent("myworkspaces:skills-changed"));
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [selected, cancelEdit, refresh],
  );

  const updateField = useCallback(
    <K extends keyof SkillDetail>(key: K, value: SkillDetail[K]) => {
      setSelected((prev) => (prev ? { ...prev, [key]: value } : prev));
      setDirty(true);
    },
    [],
  );

  const nameValid = useMemo(() => {
    if (!selected) return false;
    return /^[a-z0-9][a-z0-9_-]{0,62}$/.test(selected.name);
  }, [selected]);

  return (
    <div
      className={`flex h-full w-full ${theme.rootBg} ${theme.rootText}`}
      style={{ fontSize: `${fontSize}px`, lineHeight: 1.4 }}
    >
      <aside
        className={`flex w-56 flex-none flex-col border-r ${theme.sidebarBorder} ${theme.sidebarBg}`}
        style={{ fontSize: "0.9em" }}
      >
        <div
          className={`flex items-center gap-1 border-b ${theme.sidebarHeaderBorder} px-2 py-1.5`}
        >
          <button
            type="button"
            onClick={startCreate}
            className={`flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 font-medium ${theme.newBtn}`}
          >
            <Plus style={{ width: "1em", height: "1em" }} />
            新規スキル
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            className={`rounded p-1 ${theme.iconBtn}`}
            title="一覧を再取得"
          >
            <RefreshCw style={{ width: "1em", height: "1em" }} />
          </button>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {loading && skills.length === 0 ? (
            <li className={`px-3 py-4 ${theme.mutedText}`}>読み込み中...</li>
          ) : skills.length === 0 ? (
            <li className={`px-3 py-4 ${theme.mutedText}`}>
              スキルがまだありません。「新規スキル」で作成できます。
            </li>
          ) : (
            skills.map((s) => {
              const active = selected?.name === s.name && !creating;
              return (
                <li
                  key={s.name}
                  className={`group flex items-center gap-1 border-b ${theme.itemBorder} px-2 py-1.5 ${
                    active ? theme.itemActive : theme.itemHover
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => void selectSkill(s.name)}
                    className="min-w-0 flex-1 text-left"
                    title={s.name}
                  >
                    <div className="truncate font-medium">{s.name}</div>
                    <div
                      className={`truncate ${theme.itemDescription}`}
                      style={{ fontSize: "0.85em" }}
                    >
                      {s.description || "(説明なし)"}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(s.name)}
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                    title="削除"
                  >
                    <Trash2
                      className={theme.itemDangerIcon}
                      style={{ width: "1em", height: "1em" }}
                    />
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </aside>

      <section className="flex flex-1 flex-col overflow-hidden">
        {!selected ? (
          <div
            className={`flex flex-1 items-center justify-center px-6 ${theme.emptyText}`}
          >
            <div className="max-w-md text-center leading-relaxed">
              <p>左の一覧からスキルを選ぶか「新規スキル」で作成してください。</p>
              <p className="mt-2">
                ユーザー全体で使える SKILL.md は{" "}
                <code className={`rounded px-1 ${theme.codeBox}`}>
                  ~/.config/opencode/skills/
                </code>{" "}
                に保存されます。
              </p>
            </div>
          </div>
        ) : (
          <form
            className="flex flex-1 flex-col overflow-hidden"
            onSubmit={(e) => {
              e.preventDefault();
              if (!saving && nameValid) void save();
            }}
          >
            <div
              className={`flex items-center gap-2 border-b ${theme.editHeaderBorder} ${theme.editHeaderBg} px-3 py-2`}
            >
              <span className={theme.editLabel} style={{ fontSize: "0.85em" }}>
                {creating ? "新規スキル" : "編集中:"}
              </span>
              <input
                type="text"
                value={selected.name}
                onChange={(e) => updateField("name", e.target.value)}
                placeholder="skill-name (小文字英数 + - _)"
                disabled={!creating}
                className={`flex-1 rounded px-2 py-1 font-mono focus:outline-none ${theme.nameInput}`}
                style={{ fontSize: "0.9em" }}
              />
              <button
                type="submit"
                disabled={!dirty || saving || !nameValid}
                className={`flex items-center gap-1 rounded px-3 py-1 font-medium ${theme.saveBtn}`}
                style={{ fontSize: "0.85em" }}
                title={
                  !nameValid
                    ? "name は /^[a-z0-9][a-z0-9_-]{0,62}$/ の形式で入力"
                    : ""
                }
              >
                <Save style={{ width: "1em", height: "1em" }} />
                保存
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                className={`rounded p-1 ${theme.closeBtn}`}
                title="閉じる"
              >
                <X style={{ width: "1em", height: "1em" }} />
              </button>
            </div>

            <div className="flex flex-col gap-2 overflow-y-auto px-3 py-3">
              <label
                className="flex flex-col gap-1"
                style={{ fontSize: "0.85em" }}
              >
                <span className={theme.fieldLabel}>
                  Description (一覧表示 + スキル選択のヒント)
                </span>
                <input
                  type="text"
                  value={selected.description}
                  onChange={(e) => updateField("description", e.target.value)}
                  placeholder="このスキルを使うべき場面を 1 行で"
                  className={`rounded px-2 py-1 focus:outline-none ${theme.fieldInput}`}
                  style={{ fontSize: "1em" }}
                />
              </label>

              <label
                className="flex flex-1 flex-col gap-1"
                style={{ fontSize: "0.85em" }}
              >
                <span className={theme.fieldLabel}>
                  Body (SKILL.md 本文。モデルに与える詳細手順や制約)
                </span>
                <textarea
                  value={selected.body}
                  onChange={(e) => updateField("body", e.target.value)}
                  placeholder={
                    "例) ユーザーが俳句を求めたら、5-7-5 音節で 3 行に分けて返す。\n必ず季語を入れること。"
                  }
                  className={`min-h-[260px] flex-1 resize-y rounded px-2 py-1 font-mono focus:outline-none ${theme.fieldTextarea}`}
                  style={{ fontSize: "0.95em" }}
                />
              </label>
            </div>
          </form>
        )}

        {error && (
          <div
            className={`px-3 py-2 ${theme.errorBanner}`}
            style={{ fontSize: "0.85em" }}
          >
            {error}
          </div>
        )}
      </section>
    </div>
  );
}
