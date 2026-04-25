"use client";

import type { CursorStyle, SettingsShape } from "./use-settings-loader";

type Props = {
  settings: SettingsShape;
  updateAppearance: <K extends keyof SettingsShape["appearance"]>(
    key: K,
    value: SettingsShape["appearance"][K],
  ) => void;
};

export function AppearanceTab({ settings, updateAppearance }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[10px] leading-relaxed text-slate-500">
        下記はすべて新規に開くターミナル (Code / Biz / Shell) に適用される
        デフォルト値です。既に開いているパネルには影響しません。
      </p>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">
          ターミナルのデフォルトフォントサイズ
        </label>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={10}
            max={28}
            value={settings.appearance.defaultFontSize}
            onChange={(e) => updateAppearance("defaultFontSize", Number(e.target.value))}
            className="flex-1"
          />
          <span className="w-10 text-right font-mono text-xs text-slate-700">
            {settings.appearance.defaultFontSize}px
          </span>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">
          ターミナルのデフォルトウィンドウサイズ
        </label>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="w-10 text-right font-mono text-[10px] text-slate-500">幅</span>
            <input
              type="range"
              min={360}
              max={1600}
              step={20}
              value={settings.appearance.defaultPanelWidth}
              onChange={(e) => updateAppearance("defaultPanelWidth", Number(e.target.value))}
              className="flex-1"
            />
            <span className="w-14 text-right font-mono text-xs text-slate-700">
              {settings.appearance.defaultPanelWidth}px
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-10 text-right font-mono text-[10px] text-slate-500">高さ</span>
            <input
              type="range"
              min={220}
              max={1200}
              step={20}
              value={settings.appearance.defaultPanelHeight}
              onChange={(e) => updateAppearance("defaultPanelHeight", Number(e.target.value))}
              className="flex-1"
            />
            <span className="w-14 text-right font-mono text-xs text-slate-700">
              {settings.appearance.defaultPanelHeight}px
            </span>
          </div>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">
          カーソル形状
        </label>
        <select
          value={settings.appearance.cursorStyle}
          onChange={(e) => updateAppearance("cursorStyle", e.target.value as CursorStyle)}
          className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 focus:border-sky-400 focus:outline-none"
        >
          <option value="bar">bar (縦線、デフォルト)</option>
          <option value="block">block (塗りつぶし)</option>
          <option value="underline">underline (下線)</option>
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">
          スクロールバック行数
        </label>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={500}
            max={50000}
            step={500}
            value={settings.appearance.scrollback}
            onChange={(e) => updateAppearance("scrollback", Number(e.target.value))}
            className="flex-1"
          />
          <span className="w-16 text-right font-mono text-xs text-slate-700">
            {settings.appearance.scrollback.toLocaleString()}行
          </span>
        </div>
        <p className="mt-1 text-[10px] text-slate-400">
          ターミナルが保持する過去出力の行数。多いほどメモリを使うので
          通常は 10,000 行前後で十分。
        </p>
      </div>
    </div>
  );
}
