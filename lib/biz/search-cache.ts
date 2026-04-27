// Phase D-B: web_search 結果の in-process キャッシュ + 利用回数カウンタ。
//
// - キャッシュは TTL 5 分。同一クエリ / 同一 URL の本文取得を抑制し、
//   Tavily 等の従量課金 API への呼び出しを減らす目的。
// - LLM がループに陥って同じ検索を繰り返した時の保険にもなる。
// - プロセス再起動でクリアされる前提 (永続化しない)。
// - 認証ごとに分けない: 検索結果はユーザに依存しないため共有して問題ない。
//
// カウンタは「プロセス起動以降の発火回数」と「直近 30 日のローリング集計」を
// 区別したいが、実装簡素化のため month bucket だけ持つ。
// 設定画面の「Tavily 残使用量バッジ」(自前トラッカ) で参照する。

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;

type CacheEntry = {
  expiresAt: number;
  payload: unknown;
};

const searchCache = new Map<string, CacheEntry>();

function makeKey(provider: string, kind: "search" | "read", body: Record<string, unknown>): string {
  if (kind === "read") {
    return `${provider}:read:${String(body.read_url ?? "")}`;
  }
  const max = typeof body.max_results === "number" ? body.max_results : "default";
  return `${provider}:search:${max}:${String(body.query ?? "").trim().toLowerCase()}`;
}

export function cacheGet(
  provider: string,
  kind: "search" | "read",
  body: Record<string, unknown>,
): unknown | null {
  const key = makeKey(provider, kind, body);
  const entry = searchCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    searchCache.delete(key);
    return null;
  }
  return entry.payload;
}

export function cacheSet(
  provider: string,
  kind: "search" | "read",
  body: Record<string, unknown>,
  payload: unknown,
): void {
  // 簡易な LRU 風: サイズ超過時に古いエントリを 1 件削除
  if (searchCache.size >= CACHE_MAX_ENTRIES) {
    const oldestKey = searchCache.keys().next().value;
    if (oldestKey !== undefined) searchCache.delete(oldestKey);
  }
  searchCache.set(makeKey(provider, kind, body), {
    expiresAt: Date.now() + CACHE_TTL_MS,
    payload,
  });
}

// ---- 利用回数カウンタ ----
//
// Tavily の API 自体は残量取得エンドポイントを公開していないため、自前で発火
// 回数を数えて UI に出すしかない。ここでは「今月の合計回数」と「セッション
// (=プロセス) 内の合計回数」を保持する。

type UsageStats = {
  monthKey: string; // "2026-04" 形式
  monthCount: number;
  sessionCount: number; // プロセス起動以降
  cacheHitCount: number; // キャッシュヒットで API を呼ばずに済んだ回数
  lastErrorAt: number | null;
  lastError: string | null;
};

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const usage: UsageStats = {
  monthKey: currentMonthKey(),
  monthCount: 0,
  sessionCount: 0,
  cacheHitCount: 0,
  lastErrorAt: null,
  lastError: null,
};

function rolloverMonthIfNeeded() {
  const now = currentMonthKey();
  if (usage.monthKey !== now) {
    usage.monthKey = now;
    usage.monthCount = 0;
  }
}

export function recordApiCall(): void {
  rolloverMonthIfNeeded();
  usage.monthCount += 1;
  usage.sessionCount += 1;
}

export function recordCacheHit(): void {
  rolloverMonthIfNeeded();
  usage.cacheHitCount += 1;
}

export function recordError(message: string): void {
  usage.lastErrorAt = Date.now();
  usage.lastError = message.slice(0, 200);
}

export function getUsageSnapshot(): UsageStats & { cacheSize: number } {
  rolloverMonthIfNeeded();
  return { ...usage, cacheSize: searchCache.size };
}
