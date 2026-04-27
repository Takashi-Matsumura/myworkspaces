// Biz パネル DeepSearch のプロバイダ抽象化。
//
// Phase B で Tavily 単体実装。Phase C で Brave / Serper / JinaReader を追加。
// Phase D-B で 501/502 の自動リトライ (1 回のみ) を全プロバイダに追加。
// プロバイダは BIZ_SEARCH_PROVIDER env で切り替えられるが、search() / read() の
// シグネチャは統一されているので opencode tool 側はプロバイダを意識しない。
//
// 呼び出しは常にホスト Next.js から行う (コンテナ内 opencode tool がホストの
// /api/biz/internal/web-search を叩く)。これにより API キーをコンテナへ
// 漏らさず .env 一箇所で管理する。
//
// プロバイダの read 戦略:
// - Tavily: 専用 extract API を持つ (search と同じ API キーで OK)
// - Brave / Serper: 検索のみ。本文取得は JinaReader にフォールバックする
//   (BIZ_READER_PROVIDER=jina + JINA_API_KEY が必要、未設定なら read 不可)

// 501/502 を 1 度だけリトライする fetch ラッパ。403/4xx は即時失敗 (権限/クエリ問題)。
// 503 もインフラの一時障害として再試行対象に含める (Tavily で観測あり)。
const RETRY_STATUSES = new Set([501, 502, 503]);
const RETRY_BACKOFF_MS = 600;

async function fetchWithRetry(
  input: string | URL,
  init?: RequestInit,
): Promise<Response> {
  const resp = await fetch(input, init);
  if (resp.ok || !RETRY_STATUSES.has(resp.status)) return resp;
  // 一度だけリトライ。レスポンス body を読まずに捨てて再投入。
  await resp.body?.cancel().catch(() => {});
  await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
  return fetch(input, init);
}

export type SearchHit = {
  title: string;
  url: string;
  snippet: string;
  published?: string; // ISO 文字列。プロバイダが返さなければ undefined
};

export type ReadResult = {
  title: string;
  url: string;
  content: string; // Markdown / プレーンテキスト
};

export interface SearchProvider {
  readonly name: string;
  search(query: string, maxResults?: number): Promise<SearchHit[]>;
  // 一部プロバイダ (Tavily extract, Jina Reader) は URL 本文取得を持つ。
  // 持たないプロバイダは undefined。
  read?(url: string): Promise<ReadResult>;
}

class TavilyProvider implements SearchProvider {
  readonly name = "tavily";
  constructor(private readonly apiKey: string) {}

  async search(query: string, maxResults = 5): Promise<SearchHit[]> {
    const resp = await fetchWithRetry("https://api.tavily.com/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: this.apiKey,
        query,
        max_results: Math.max(1, Math.min(20, maxResults)),
        search_depth: "basic",
        include_answer: false,
      }),
    });
    if (!resp.ok) {
      throw new Error(`tavily search failed: ${resp.status} ${await resp.text().catch(() => "")}`);
    }
    const json = (await resp.json()) as {
      results?: Array<{
        title?: string;
        url?: string;
        content?: string;
        published_date?: string;
      }>;
    };
    return (json.results ?? []).map((r) => ({
      title: r.title ?? r.url ?? "(untitled)",
      url: r.url ?? "",
      snippet: r.content ?? "",
      published: r.published_date,
    }));
  }

  async read(url: string): Promise<ReadResult> {
    // Tavily extract API。深い本文取得が必要な時用。
    const resp = await fetchWithRetry("https://api.tavily.com/extract", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: this.apiKey,
        urls: [url],
      }),
    });
    if (!resp.ok) {
      throw new Error(`tavily extract failed: ${resp.status}`);
    }
    const json = (await resp.json()) as {
      results?: Array<{ url?: string; raw_content?: string }>;
    };
    const first = json.results?.[0];
    return {
      title: url,
      url,
      content: first?.raw_content ?? "",
    };
  }
}

// Brave Search API 経由の検索。Brave 自身は本文取得 API を持たないので
// read() は持たず、必要なら getReader() (JinaReader) にフォールバックさせる。
class BraveProvider implements SearchProvider {
  readonly name = "brave";
  constructor(private readonly apiKey: string) {}

  async search(query: string, maxResults = 5): Promise<SearchHit[]> {
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(Math.max(1, Math.min(20, maxResults))));
    const resp = await fetchWithRetry(url, {
      headers: {
        accept: "application/json",
        "X-Subscription-Token": this.apiKey,
      },
    });
    if (!resp.ok) {
      throw new Error(`brave search failed: ${resp.status} ${await resp.text().catch(() => "")}`);
    }
    const json = (await resp.json()) as {
      web?: {
        results?: Array<{
          title?: string;
          url?: string;
          description?: string;
          age?: string;
        }>;
      };
    };
    return (json.web?.results ?? []).map((r) => ({
      title: r.title ?? r.url ?? "(untitled)",
      url: r.url ?? "",
      snippet: stripTags(r.description ?? ""),
      published: r.age,
    }));
  }
}

// Serper (Google 検索の薄いラッパ) 経由の検索。Brave と同様に本文取得 API は無い。
class SerperProvider implements SearchProvider {
  readonly name = "serper";
  constructor(private readonly apiKey: string) {}

  async search(query: string, maxResults = 5): Promise<SearchHit[]> {
    const resp = await fetchWithRetry("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-API-KEY": this.apiKey,
      },
      body: JSON.stringify({
        q: query,
        num: Math.max(1, Math.min(20, maxResults)),
      }),
    });
    if (!resp.ok) {
      throw new Error(`serper search failed: ${resp.status} ${await resp.text().catch(() => "")}`);
    }
    const json = (await resp.json()) as {
      organic?: Array<{
        title?: string;
        link?: string;
        snippet?: string;
        date?: string;
      }>;
    };
    return (json.organic ?? []).map((r) => ({
      title: r.title ?? r.link ?? "(untitled)",
      url: r.link ?? "",
      snippet: r.snippet ?? "",
      published: r.date,
    }));
  }
}

// JinaReader (https://r.jina.ai/<URL>) を読み専用プロバイダとして使う。
// Brave / Serper の read() フォールバック先。API キーは無くても叩けるが、
// 設定されていれば認証付きでレートリミットが緩くなる。
//
// 単体で SearchProvider として使う想定はない (search は no-op スタブで
// fall through し、内部 route が 501 を返す)。
class JinaReaderProvider implements SearchProvider {
  readonly name = "jina-reader";
  constructor(private readonly apiKey?: string) {}

  search(): Promise<SearchHit[]> {
    return Promise.reject(
      new Error("jina-reader provider does not support search; use it via read() only"),
    );
  }

  async read(url: string): Promise<ReadResult> {
    const target = `https://r.jina.ai/${url}`;
    const resp = await fetchWithRetry(target, {
      headers: {
        accept: "text/plain",
        ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
      },
    });
    if (!resp.ok) {
      throw new Error(`jina-reader failed: ${resp.status}`);
    }
    const content = await resp.text();
    // 先頭が "Title: ..." で始まることが多いのでタイトルだけ抜く
    const titleMatch = content.match(/^Title:\s*(.+)$/m);
    return {
      title: titleMatch ? titleMatch[1].trim() : url,
      url,
      content,
    };
  }
}

// 簡易な HTML タグ除去 (Brave の description は <strong> 等を含むため)
function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

// 環境変数 BIZ_SEARCH_PROVIDER (default "tavily") を見て検索プロバイダを返す。
// API キーが未設定ならエラーを投げる (内部 route がそれを 503 で返す)。
export function getSearchProvider(): SearchProvider {
  const name = (process.env.BIZ_SEARCH_PROVIDER ?? "tavily").toLowerCase();
  switch (name) {
    case "tavily": {
      const key = process.env.TAVILY_API_KEY;
      if (!key) {
        throw new Error(
          "TAVILY_API_KEY is not set. Add it to .env or set BIZ_SEARCH_PROVIDER to a configured provider.",
        );
      }
      return new TavilyProvider(key);
    }
    case "brave": {
      const key = process.env.BRAVE_API_KEY;
      if (!key) {
        throw new Error("BRAVE_API_KEY is not set. Add it to .env.");
      }
      return new BraveProvider(key);
    }
    case "serper": {
      const key = process.env.SERPER_API_KEY;
      if (!key) {
        throw new Error("SERPER_API_KEY is not set. Add it to .env.");
      }
      return new SerperProvider(key);
    }
    default:
      throw new Error(`unknown BIZ_SEARCH_PROVIDER: ${name}`);
  }
}

// 検索プロバイダが read() を持たない場合の fallback reader を返す。
// 現状は JinaReader 一択。BIZ_READER_PROVIDER=none で明示的に無効化可能。
// search プロバイダ自身が read() を持っていればそちらが優先されるので、この
// 関数は内部 route 側で「read 引数が来たが provider.read が undefined」の時にだけ呼ばれる。
export function getFallbackReader(): SearchProvider | null {
  const name = (process.env.BIZ_READER_PROVIDER ?? "jina").toLowerCase();
  switch (name) {
    case "none":
    case "":
      return null;
    case "jina":
      return new JinaReaderProvider(process.env.JINA_API_KEY);
    default:
      return null;
  }
}
