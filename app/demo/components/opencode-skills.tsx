"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Save, Trash2, RefreshCw, X } from "lucide-react";

type SkillSummary = {
  name: string;
  description: string;
};

type SkillDetail = SkillSummary & { body: string };

async function apiList(): Promise<SkillSummary[]> {
  const res = await fetch("/api/opencode/skills", { cache: "no-store" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  const data = (await res.json()) as { skills: SkillSummary[] };
  return data.skills;
}

async function apiGet(name: string): Promise<SkillDetail> {
  const res = await fetch(`/api/opencode/skills/${encodeURIComponent(name)}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as SkillDetail;
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
}: {
  fontSize?: number;
}) {
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
      className="flex h-full w-full bg-white text-gray-900"
      style={{ fontSize: `${fontSize}px`, lineHeight: 1.4 }}
    >
      <aside
        className="flex w-56 flex-none flex-col border-r border-gray-200 bg-gray-50"
        style={{ fontSize: "0.9em" }}
      >
        <div className="flex items-center gap-1 border-b border-gray-200 px-2 py-1.5">
          <button
            type="button"
            onClick={startCreate}
            className="flex flex-1 items-center justify-center gap-1 rounded bg-emerald-600 px-2 py-1 font-medium text-white hover:bg-emerald-500"
          >
            <Plus style={{ width: "1em", height: "1em" }} />
            新規スキル
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded p-1 text-gray-500 hover:bg-gray-200"
            title="一覧を再取得"
          >
            <RefreshCw style={{ width: "1em", height: "1em" }} />
          </button>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {loading && skills.length === 0 ? (
            <li className="px-3 py-4 text-gray-400">読み込み中...</li>
          ) : skills.length === 0 ? (
            <li className="px-3 py-4 text-gray-400">
              スキルがまだありません。「新規スキル」で作成できます。
            </li>
          ) : (
            skills.map((s) => {
              const active = selected?.name === s.name && !creating;
              return (
                <li
                  key={s.name}
                  className={`group flex items-center gap-1 border-b border-gray-100 px-2 py-1.5 ${
                    active ? "bg-emerald-100" : "hover:bg-white"
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
                      className="truncate text-gray-500"
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
                      className="text-gray-400 hover:text-red-600"
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
          <div className="flex flex-1 items-center justify-center px-6 text-center text-gray-400">
            左の一覧からスキルを選ぶか「新規スキル」で作成してください。
            <br />
            ユーザー全体で使える SKILL.md は{" "}
            <code className="px-1">~/.config/opencode/skills/</code> に保存されます。
          </div>
        ) : (
          <form
            className="flex flex-1 flex-col overflow-hidden"
            onSubmit={(e) => {
              e.preventDefault();
              if (!saving && nameValid) void save();
            }}
          >
            <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2">
              <span className="text-gray-500" style={{ fontSize: "0.85em" }}>
                {creating ? "新規スキル" : "編集中:"}
              </span>
              <input
                type="text"
                value={selected.name}
                onChange={(e) => updateField("name", e.target.value)}
                placeholder="skill-name (小文字英数 + - _)"
                disabled={!creating}
                className="flex-1 rounded border border-gray-300 px-2 py-1 font-mono focus:border-emerald-500 focus:outline-none disabled:bg-gray-100 disabled:text-gray-600"
                style={{ fontSize: "0.9em" }}
              />
              <button
                type="submit"
                disabled={!dirty || saving || !nameValid}
                className="flex items-center gap-1 rounded bg-emerald-600 px-3 py-1 font-medium text-white hover:bg-emerald-500 disabled:bg-gray-300"
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
                className="rounded p-1 text-gray-500 hover:bg-gray-200"
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
                <span className="text-gray-600">
                  Description (一覧表示 + スキル選択のヒント)
                </span>
                <input
                  type="text"
                  value={selected.description}
                  onChange={(e) => updateField("description", e.target.value)}
                  placeholder="このスキルを使うべき場面を 1 行で"
                  className="rounded border border-gray-300 px-2 py-1 focus:border-emerald-500 focus:outline-none"
                  style={{ fontSize: "1em" }}
                />
              </label>

              <label
                className="flex flex-1 flex-col gap-1"
                style={{ fontSize: "0.85em" }}
              >
                <span className="text-gray-600">
                  Body (SKILL.md 本文。モデルに与える詳細手順や制約)
                </span>
                <textarea
                  value={selected.body}
                  onChange={(e) => updateField("body", e.target.value)}
                  placeholder={
                    "例) ユーザーが俳句を求めたら、5-7-5 音節で 3 行に分けて返す。\n必ず季語を入れること。"
                  }
                  className="min-h-[260px] flex-1 resize-y rounded border border-gray-300 px-2 py-1 font-mono focus:border-emerald-500 focus:outline-none"
                  style={{ fontSize: "0.95em" }}
                />
              </label>
            </div>
          </form>
        )}

        {error && (
          <div
            className="border-t border-red-200 bg-red-50 px-3 py-2 text-red-700"
            style={{ fontSize: "0.85em" }}
          >
            {error}
          </div>
        )}
      </section>
    </div>
  );
}
