import { execCollect, shellQuote, writeFileInContainer } from "./workspace";

// opencode のユーザー全体スキルは `~/.config/opencode/skills/<name>/SKILL.md`
// に置かれる。shell / opencode サイドカー共通の named volume
// `myworkspaces-home-{sub}` に永続化されるので、コンテナ再作成を跨いで残る。
const SKILLS_ROOT = "/root/.config/opencode/skills";
// name は拡張子なしの識別子 (小文字英数 + ハイフン + アンダースコア) のみ許可。
// opencode 本体も similar な制約を持つのでそれに揃える。
const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,62}$/;

export class SkillError extends Error {
  constructor(
    message: string,
    public status: 400 | 404 | 500,
  ) {
    super(message);
  }
}

export type SkillSummary = {
  name: string;
  description: string;
};

export type SkillDetail = SkillSummary & {
  body: string;
};

function validateName(name: string): void {
  if (!NAME_RE.test(name)) {
    throw new SkillError(
      "skill name must match /^[a-z0-9][a-z0-9_-]{0,62}$/",
      400,
    );
  }
}

// SKILL.md は先頭 frontmatter (name, description) + 本文。
// 書き込み時は UI から受け取った description を frontmatter に、body を本文に入れる。
function buildSkillMarkdown(name: string, description: string, body: string): string {
  const safeDesc = description.replace(/\r?\n/g, " ").trim();
  const trimmedBody = body.replace(/\s+$/g, "");
  return `---\nname: ${name}\ndescription: ${safeDesc}\n---\n\n${trimmedBody}\n`;
}

// 先頭に `---\n...\n---` frontmatter があれば description を抜き出す。
// 無ければ description は空、body は全文。
function parseSkillMarkdown(text: string): { description: string; body: string } {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { description: "", body: text };
  const header = m[1];
  const rest = text.slice(m[0].length).replace(/^\n+/, "");
  const descMatch = header.match(/^description:\s*(.*)$/m);
  const description = descMatch ? descMatch[1].trim() : "";
  return { description, body: rest };
}

// 一覧: 各 <name>/SKILL.md を find して cat、frontmatter から description だけ抜く。
// フォーマットが壊れたファイルは name だけ返す (description は空)。
export async function listSkills(sub: string): Promise<SkillSummary[]> {
  const script = `
    set -e
    if [ ! -d ${shellQuote(SKILLS_ROOT)} ]; then
      exit 0
    fi
    find ${shellQuote(SKILLS_ROOT)} -mindepth 2 -maxdepth 2 -type f -name SKILL.md -printf '%p\\n' 2>/dev/null | sort
  `;
  const res = await execCollect(sub, ["/bin/bash", "-c", script]);
  if (res.exitCode !== 0) {
    throw new SkillError(
      `listSkills failed: ${res.stderr.toString("utf-8")}`,
      500,
    );
  }
  const paths = res.stdout
    .toString("utf-8")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  if (paths.length === 0) return [];
  // 各ファイルを読む。件数は多くないので逐次で十分。
  const out: SkillSummary[] = [];
  for (const p of paths) {
    const name = p
      .slice(`${SKILLS_ROOT}/`.length)
      .replace(/\/SKILL\.md$/, "");
    if (!NAME_RE.test(name)) continue;
    const r = await execCollect(sub, ["/bin/cat", p]);
    if (r.exitCode !== 0) {
      out.push({ name, description: "" });
      continue;
    }
    const { description } = parseSkillMarkdown(r.stdout.toString("utf-8"));
    out.push({ name, description });
  }
  return out;
}

export async function getSkill(
  sub: string,
  name: string,
): Promise<SkillDetail | null> {
  validateName(name);
  const path = `${SKILLS_ROOT}/${name}/SKILL.md`;
  const res = await execCollect(sub, ["/bin/cat", path]);
  if (res.exitCode !== 0) {
    // exitCode 1 は「存在しない or 読めない」のどちらか。UI 的には 404 で良い。
    return null;
  }
  const parsed = parseSkillMarkdown(res.stdout.toString("utf-8"));
  return { name, description: parsed.description, body: parsed.body };
}

// 新規/上書きの両方を兼ねる。mkdir -p 済みディレクトリに SKILL.md を putArchive。
export async function writeSkill(
  sub: string,
  name: string,
  description: string,
  body: string,
): Promise<void> {
  validateName(name);
  const dir = `${SKILLS_ROOT}/${name}`;
  const mk = await execCollect(sub, [
    "/bin/bash",
    "-c",
    `mkdir -p ${shellQuote(dir)}`,
  ]);
  if (mk.exitCode !== 0) {
    throw new SkillError(
      `mkdir failed: ${mk.stderr.toString("utf-8")}`,
      500,
    );
  }
  const md = buildSkillMarkdown(name, description, body);
  await writeFileInContainer(sub, `${dir}/SKILL.md`, Buffer.from(md, "utf-8"));
}

export async function deleteSkill(sub: string, name: string): Promise<void> {
  validateName(name);
  const dir = `${SKILLS_ROOT}/${name}`;
  // 範囲を誤って消さないため SKILLS_ROOT 直下に限定した rm -rf。
  const res = await execCollect(sub, [
    "/bin/bash",
    "-c",
    `rm -rf ${shellQuote(dir)}`,
  ]);
  if (res.exitCode !== 0) {
    throw new SkillError(
      `deleteSkill failed: ${res.stderr.toString("utf-8")}`,
      500,
    );
  }
}
