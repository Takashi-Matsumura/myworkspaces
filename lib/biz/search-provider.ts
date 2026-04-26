// Biz パネル DeepSearch のプロバイダ抽象化。
//
// Phase B では Tavily 単体実装。Phase C 以降で Brave / Serper / Jina Reader を
// 同じインターフェースで差し替え可能にする予定。
//
// 呼び出しは常にホスト Next.js から行う (コンテナ内 opencode tool がホストの
// /api/biz/internal/web-search を叩く)。これにより API キーをコンテナへ
// 漏らさず .env 一箇所で管理する。

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
    const resp = await fetch("https://api.tavily.com/search", {
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
    const resp = await fetch("https://api.tavily.com/extract", {
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

class NotImplementedProvider implements SearchProvider {
  constructor(public readonly name: string) {}
  search(): Promise<SearchHit[]> {
    return Promise.reject(
      new Error(
        `provider "${this.name}" is not implemented yet. Set BIZ_SEARCH_PROVIDER=tavily for Phase B.`,
      ),
    );
  }
}

// 環境変数 BIZ_SEARCH_PROVIDER (default "tavily") を見て返す。
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
    case "brave":
    case "serper":
      return new NotImplementedProvider(name);
    default:
      throw new Error(`unknown BIZ_SEARCH_PROVIDER: ${name}`);
  }
}
