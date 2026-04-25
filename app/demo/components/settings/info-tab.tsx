"use client";

export function InfoTab() {
  return (
    <div className="flex flex-col gap-2 font-mono text-[11px] text-slate-600">
      <div className="flex gap-2">
        <span className="w-24 text-slate-400">sub</span>
        <span>demo</span>
      </div>
      <div className="flex gap-2">
        <span className="w-24 text-slate-400">image</span>
        <span>myworkspaces-sandbox:latest</span>
      </div>
      <div className="flex gap-2">
        <span className="w-24 text-slate-400">container</span>
        <span>myworkspaces-shell-demo</span>
      </div>
      <div className="flex gap-2">
        <span className="w-24 text-slate-400">volume</span>
        <span>myworkspaces-home-demo</span>
      </div>
      <div className="mt-3 flex flex-col gap-1">
        <a
          href="https://github.com/Takashi-Matsumura/myworkspaces"
          target="_blank"
          rel="noreferrer"
          className="text-sky-700 hover:underline"
        >
          GitHub: Takashi-Matsumura/myworkspaces
        </a>
        <a
          href="https://opencode.ai/"
          target="_blank"
          rel="noreferrer"
          className="text-sky-700 hover:underline"
        >
          OpenCode
        </a>
      </div>
    </div>
  );
}
