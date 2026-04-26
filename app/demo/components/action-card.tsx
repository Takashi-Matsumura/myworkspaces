"use client";

import { useState } from "react";
import {
  ChevronRight,
  FileText,
  Pencil,
  FilePlus,
  Terminal,
  Wrench,
} from "lucide-react";
import type { PartInfo } from "./use-opencode-stream";
import { CODING_THEME } from "./coding-theme";
import { CodeBlock, inferLanguageFromPath } from "./code-block";

/**
 * opencode 1.14.x の tool / step-start / step-finish part を UI カードに変換する。
 *
 * SSE 経由で届く part オブジェクトの追加フィールドは `use-opencode-stream.ts` で
 * `PartInfo.raw` に保持済み (id/messageID/sessionID/type/text 以外)。
 * スキーマが将来変わっても最悪 GenericToolCard にフォールバックするよう、
 * 型ガードは全部防御的に書く。
 *
 * 実機観察が済んでいないため、tool 名や input/output は raw の複数候補キー
 * (tool/name/toolName、input/args、output/result) を順に試す。
 */

export type ParsedTool = {
  tool: string; // "read" | "edit" | "write" | "bash" | "grep" | ... | "unknown"
  input?: Record<string, unknown>;
  output?: string;
  state?: string; // "pending" | "running" | "completed" | "error"
  error?: string;
  exitCode?: number;
  rawText?: string; // fallback 表示用
};

function firstString(...values: unknown[]): string | undefined {
  for (const v of values) {
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

function firstObject(
  ...values: unknown[]
): Record<string, unknown> | undefined {
  for (const v of values) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return v as Record<string, unknown>;
    }
  }
  return undefined;
}

export function parseToolPart(part: PartInfo): ParsedTool {
  const raw = part.raw ?? {};

  // tool 名の候補キー (opencode のバージョンやプラグインで揺れる可能性)
  const toolName =
    firstString(raw.tool, raw.name, raw.toolName)?.toLowerCase() ?? "unknown";

  // opencode 1.14.x の tool part は input/output/status をすべて state 配下に
  // 入れる。古いスキーマや別ツールでも壊れないよう、トップレベルも見る。
  const stateObj = firstObject(raw.state);
  const stateMeta = stateObj
    ? firstObject((stateObj as Record<string, unknown>).metadata)
    : undefined;
  const stateInput = stateObj
    ? firstObject((stateObj as Record<string, unknown>).input)
    : undefined;
  const stateOutput = stateObj
    ? firstString(
        (stateObj as Record<string, unknown>).output,
        stateMeta ? (stateMeta as Record<string, unknown>).output : undefined,
      )
    : undefined;
  const stateStatus = stateObj
    ? firstString((stateObj as Record<string, unknown>).status)
    : undefined;
  const stateError = stateObj
    ? firstString((stateObj as Record<string, unknown>).error)
    : undefined;
  const stateExitRaw = stateMeta
    ? (stateMeta as Record<string, unknown>).exit
    : undefined;
  const exitCode =
    typeof stateExitRaw === "number" ? stateExitRaw : undefined;

  const input =
    firstObject(raw.input, raw.args, raw.parameters) ?? stateInput;
  const output =
    firstString(raw.output, raw.result) ?? stateOutput ?? (part.text || undefined);
  const state =
    firstString(raw.status) ?? stateStatus ?? (typeof raw.state === "string" ? raw.state : undefined);

  // text が JSON 形式で完結している場合のフォールバック解析
  if (toolName === "unknown" && part.text.trim().startsWith("{")) {
    try {
      const j = JSON.parse(part.text) as Record<string, unknown>;
      const t2 = firstString(j.tool, j.name, j.toolName)?.toLowerCase();
      if (t2) {
        return {
          tool: t2,
          input: firstObject(j.input, j.args, j.parameters) ?? input,
          output: firstString(j.output, j.result) ?? output,
          state: firstString(j.state, j.status) ?? state,
          rawText: part.text,
        };
      }
    } catch {
      /* JSON として読めない → fall through */
    }
  }

  return {
    tool: toolName,
    input,
    output,
    state,
    error: stateError,
    exitCode,
    rawText: part.text,
  };
}

function Card({
  icon,
  accent,
  summary,
  children,
}: {
  icon: React.ReactNode;
  accent: string;
  summary: React.ReactNode;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const hasBody = Boolean(children);
  return (
    <div
      className={`mb-2 overflow-hidden rounded-md border ${CODING_THEME.cardBorder} ${CODING_THEME.cardBg}`}
    >
      <button
        type="button"
        onClick={() => hasBody && setOpen((v) => !v)}
        disabled={!hasBody}
        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left ${CODING_THEME.cardSummaryBg} ${hasBody ? CODING_THEME.cardSummaryHover : ""}`}
      >
        <span className={`flex items-center ${accent}`}>{icon}</span>
        <span className="min-w-0 flex-1 truncate">{summary}</span>
        {hasBody && (
          <ChevronRight
            className={`h-3.5 w-3.5 opacity-60 transition-transform ${open ? "rotate-90" : ""}`}
          />
        )}
      </button>
      {open && hasBody && (
        <div
          className={`border-t ${CODING_THEME.cardBorder} ${CODING_THEME.codeBlockBg}`}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function pathOf(input?: Record<string, unknown>): string | undefined {
  return firstString(
    input?.path,
    input?.filePath,
    input?.file_path,
    input?.file,
  );
}

function cmdOf(input?: Record<string, unknown>): string | undefined {
  return firstString(input?.command, input?.cmd, input?.script);
}

function countDiff(output?: string): { add: number; del: number } {
  if (!output) return { add: 0, del: 0 };
  let add = 0;
  let del = 0;
  for (const line of output.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) add++;
    else if (line.startsWith("-") && !line.startsWith("---")) del++;
  }
  return { add, del };
}

function lineCount(s?: string): number {
  if (!s) return 0;
  return s.split("\n").filter((l) => l.length > 0).length;
}

function ReadFileCard({ parsed }: { parsed: ParsedTool }) {
  const path = pathOf(parsed.input);
  const lang = path ? inferLanguageFromPath(path) : "text";
  const lines = lineCount(parsed.output);
  const isError = parsed.state === "error";
  return (
    <Card
      icon={<FileText className="h-3.5 w-3.5" />}
      accent={CODING_THEME.cardAccentRead}
      summary={
        <span className="flex items-center gap-2">
          <span className="font-mono text-[0.9em]">Read</span>
          <span className="truncate font-mono opacity-80">{path ?? "(path 不明)"}</span>
          {isError ? (
            <span className="text-red-400">× {parsed.state}</span>
          ) : (
            lines > 0 && <span className="opacity-60">· {lines} 行</span>
          )}
        </span>
      }
    >
      {parsed.error && (
        <pre className="overflow-x-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-[0.85em] leading-relaxed text-red-300">
          {parsed.error}
        </pre>
      )}
      {!isError && parsed.output ? (
        <CodeBlock language={lang} code={parsed.output} />
      ) : null}
    </Card>
  );
}

function EditFileCard({ parsed }: { parsed: ParsedTool }) {
  const path = pathOf(parsed.input);
  const { add, del } = countDiff(parsed.output);
  return (
    <Card
      icon={<Pencil className="h-3.5 w-3.5" />}
      accent={CODING_THEME.cardAccentEdit}
      summary={
        <span className="flex items-center gap-2">
          <span className="font-mono text-[0.9em]">Edit</span>
          <span className="truncate font-mono opacity-80">{path ?? "(path 不明)"}</span>
          {(add > 0 || del > 0) && (
            <span className="opacity-70">
              <span className="text-emerald-400">+{add}</span>{" "}
              <span className="text-red-400">-{del}</span>
            </span>
          )}
        </span>
      }
    >
      {parsed.output ? <CodeBlock language="diff" code={parsed.output} /> : null}
    </Card>
  );
}

function WriteFileCard({ parsed }: { parsed: ParsedTool }) {
  const path = pathOf(parsed.input);
  const lang = path ? inferLanguageFromPath(path) : "text";
  const content = firstString(parsed.input?.content, parsed.input?.text);
  const lines = lineCount(content);
  return (
    <Card
      icon={<FilePlus className="h-3.5 w-3.5" />}
      accent={CODING_THEME.cardAccentWrite}
      summary={
        <span className="flex items-center gap-2">
          <span className="font-mono text-[0.9em]">Write</span>
          <span className="truncate font-mono opacity-80">{path ?? "(path 不明)"}</span>
          {lines > 0 && <span className="opacity-60">· {lines} 行新規</span>}
        </span>
      }
    >
      {content ? <CodeBlock language={lang} code={content} /> : null}
    </Card>
  );
}

function BashCard({ parsed }: { parsed: ParsedTool }) {
  const cmd = cmdOf(parsed.input) ?? "";
  const ok =
    parsed.state === "completed" &&
    (parsed.exitCode === undefined || parsed.exitCode === 0);
  return (
    <Card
      icon={<Terminal className="h-3.5 w-3.5" />}
      accent={CODING_THEME.cardAccentRun}
      summary={
        <span className="flex items-center gap-2">
          <span className="font-mono text-[0.9em]">Bash</span>
          <span className="truncate font-mono opacity-80">
            {cmd.length > 60 ? cmd.slice(0, 60) + "…" : cmd}
          </span>
          {parsed.state && (
            <span className={ok ? "text-emerald-400" : "text-red-400"}>
              {ok ? "✓" : "×"} {parsed.state}
              {parsed.exitCode !== undefined && parsed.exitCode !== 0 && (
                <> · exit {parsed.exitCode}</>
              )}
            </span>
          )}
        </span>
      }
    >
      {cmd && <CodeBlock language="bash" code={cmd} />}
      {parsed.output && (
        <pre className="overflow-x-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-[0.85em] leading-relaxed text-white/70">
          {parsed.output}
        </pre>
      )}
      {parsed.error && (
        <pre className="overflow-x-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-[0.85em] leading-relaxed text-red-300">
          {parsed.error}
        </pre>
      )}
    </Card>
  );
}

function GenericToolCard({ parsed }: { parsed: ParsedTool }) {
  const body = (() => {
    if (parsed.rawText) {
      try {
        const j = JSON.parse(parsed.rawText);
        return JSON.stringify(j, null, 2);
      } catch {
        return parsed.rawText;
      }
    }
    return "";
  })();
  return (
    <Card
      icon={<Wrench className="h-3.5 w-3.5" />}
      accent={CODING_THEME.cardAccentMisc}
      summary={
        <span className="flex items-center gap-2">
          <span className="font-mono text-[0.9em]">{parsed.tool}</span>
          {parsed.state && <span className="opacity-60">· {parsed.state}</span>}
        </span>
      }
    >
      {body && (
        <pre className="overflow-x-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-[0.85em] leading-relaxed text-white/70">
          {body}
        </pre>
      )}
    </Card>
  );
}

function StepBadge({ kind }: { kind: "start" | "finish" }) {
  return (
    <div
      className={`my-1 flex items-center gap-2 ${CODING_THEME.stepSeparator}`}
    >
      <span className="h-px flex-1 bg-current opacity-20" />
      <span
        className="uppercase tracking-wider opacity-60"
        style={{ fontSize: "0.7em" }}
      >
        {kind === "start" ? "step start" : "step finish"}
      </span>
      <span className="h-px flex-1 bg-current opacity-20" />
    </div>
  );
}

// tool / step 系の part を受けて適切なカード / バッジを返すディスパッチャ。
// reasoning / text 以外の part type がここに来る想定。
export function PartAsCard({ part }: { part: PartInfo }) {
  if (part.type === "step-start") return <StepBadge kind="start" />;
  if (part.type === "step-finish") return <StepBadge kind="finish" />;

  if (part.type === "tool") {
    const parsed = parseToolPart(part);
    switch (parsed.tool) {
      case "read":
      case "readfile":
      case "read_file":
        return <ReadFileCard parsed={parsed} />;
      case "edit":
      case "editfile":
      case "edit_file":
        return <EditFileCard parsed={parsed} />;
      case "write":
      case "writefile":
      case "write_file":
        return <WriteFileCard parsed={parsed} />;
      case "bash":
      case "shell":
      case "run":
        return <BashCard parsed={parsed} />;
      default:
        return <GenericToolCard parsed={parsed} />;
    }
  }

  // 未知 type は非表示 (message.part で reasoning/text と重複しないよう上位で弾く想定)
  return null;
}
