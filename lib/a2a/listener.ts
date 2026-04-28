// per-user A2A リスナー。opencode サイドカーの /event SSE を購読し、
// session.idle を観測したらアクティブなロープに沿って assistant 応答を相手 session に
// 転送する。
//
// アーキテクチャ:
//  - 1 ユーザー (sub) につき 1 リスナー。listeners Map で singleton 管理
//  - リスナーは ReadableStream で /event を読み続ける常駐ループ
//  - SSE が切断されたら 5s sleep → 再接続 (リトライ無限)
//  - リスナーの停止: stopA2aListener(sub) (AbortController.abort())
//  - per-recipient FIFO キュー: 受信側 session が busy のうちは積み、idle で 1 件 drain
//
// Spike Q3 で確証: opencode は両 session を同時に busy 受理するが llama-server は
// 単一プロセス推論なので、複数 inject を立て続けに投げると総時間がスループット律速になる。
// よってロープは「相手が idle のときだけ送る」キューを必ず持つ。

import { fetchOpencode } from "@/lib/opencode-client";
import { prisma } from "@/lib/prisma";
import { decode, type A2APanel } from "./prefix";
import { hashContent, isDuplicate } from "./dedup";
import { injectA2aMessage } from "./relay";

type QueueEntry = {
  ropeId: string;
  toSessionId: string;
  fromPanel: A2APanel;
  hopCount: number;
  content: string;
};

type State = {
  sub: string;
  ac: AbortController;
  // 直近の SSE で観測した session の idle/busy。
  // true = idle, false = busy。未観測の session は undefined。
  // 未観測時は「idle と仮定して即送信」を採用 (busy なら opencode 内部で順序付けされる)。
  idleBySession: Map<string, boolean>;
  // 受信側 session が busy 中に積まれた送信キュー。
  // session.idle 観測で 1 件 drain。
  sendQueue: Map<string, QueueEntry[]>;
  // 同じ session.idle イベントが session.status と session.idle で 2 回飛んでくる
  // 場合に多重処理しないためのデバウンス。
  lastIdleAt: Map<string, number>;
};

const listeners = new Map<string, State>();
const IDLE_DEBOUNCE_MS = 500;
const RECONNECT_DELAY_MS = 5000;
const DEDUP_RECENT_N = 3;

export function ensureA2aListener(sub: string): void {
  const existing = listeners.get(sub);
  if (existing && !existing.ac.signal.aborted) return;
  const state: State = {
    sub,
    ac: new AbortController(),
    idleBySession: new Map(),
    sendQueue: new Map(),
    lastIdleAt: new Map(),
  };
  listeners.set(sub, state);
  void runLoop(state);
}

export function stopA2aListener(sub: string): void {
  const s = listeners.get(sub);
  if (!s) return;
  s.ac.abort();
  listeners.delete(sub);
}

export async function prewarmA2aListeners(): Promise<void> {
  const rows = await prisma.rope.findMany({
    where: { active: true },
    distinct: ["userId"],
    select: { userId: true },
  });
  for (const { userId } of rows) ensureA2aListener(userId);
}

async function runLoop(state: State): Promise<void> {
  while (!state.ac.signal.aborted) {
    try {
      await consumeOnce(state);
    } catch (err) {
      if (state.ac.signal.aborted) break;
      console.warn(`[a2a-listener] sub=${state.sub} disconnected, retry in ${RECONNECT_DELAY_MS}ms`, err);
    }
    if (state.ac.signal.aborted) break;
    await new Promise((r) => setTimeout(r, RECONNECT_DELAY_MS));
  }
}

async function consumeOnce(state: State): Promise<void> {
  const upstream = await fetchOpencode(state.sub, "/event", {
    signal: state.ac.signal,
    headers: { accept: "text/event-stream" },
  });
  if (!upstream.ok || !upstream.body) {
    throw new Error(`event stream failed: ${upstream.status}`);
  }
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) return;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const dataLine = block.split("\n").find((l) => l.startsWith("data:"));
      if (!dataLine) continue;
      try {
        const ev = JSON.parse(dataLine.slice(5).trim()) as {
          type?: string;
          properties?: { sessionID?: string; status?: { type?: string } };
        };
        await handleEvent(state, ev);
      } catch {
        // SSE block 内に不完全 JSON が来ても無視 (heartbeat 等)
      }
    }
  }
}

async function handleEvent(
  state: State,
  ev: { type?: string; properties?: { sessionID?: string; status?: { type?: string } } },
): Promise<void> {
  if (!ev.type || !ev.properties) return;
  const sid = ev.properties.sessionID;
  if (typeof sid !== "string") return;

  if (ev.type === "session.status") {
    const t = ev.properties.status?.type;
    if (t === "idle") {
      state.idleBySession.set(sid, true);
      void onSessionIdle(state, sid);
    } else if (t === "busy") {
      state.idleBySession.set(sid, false);
    }
  } else if (ev.type === "session.idle") {
    state.idleBySession.set(sid, true);
    void onSessionIdle(state, sid);
  }
}

async function onSessionIdle(state: State, sid: string): Promise<void> {
  // session.status:idle と session.idle が同タイミングで 2 つ飛んで来るので debounce
  const now = Date.now();
  const last = state.lastIdleAt.get(sid) ?? 0;
  if (now - last < IDLE_DEBOUNCE_MS) return;
  state.lastIdleAt.set(sid, now);

  try {
    await drainQueue(state, sid);
    await tryForwardFromSource(state, sid);
  } catch (err) {
    console.warn(`[a2a-listener] sub=${state.sub} sid=${sid} idle handling failed`, err);
  }
}

async function drainQueue(state: State, sid: string): Promise<void> {
  const queue = state.sendQueue.get(sid);
  if (!queue || queue.length === 0) return;
  if (state.idleBySession.get(sid) !== true) return;
  const entry = queue.shift();
  if (!entry) return;
  if (queue.length === 0) state.sendQueue.delete(sid);
  await sendNow(state, entry);
}

async function sendNow(state: State, entry: QueueEntry): Promise<void> {
  await injectA2aMessage(
    state.sub,
    entry.toSessionId,
    entry.ropeId,
    entry.fromPanel,
    entry.hopCount,
    entry.content,
  );
  // POST が opencode に届くと session は busy になる。SSE で session.status:busy を
  // 受け取るまでの間に重複 drain させないため、ここで先回りして false を入れる。
  state.idleBySession.set(entry.toSessionId, false);
}

async function tryForwardFromSource(state: State, sourceSid: string): Promise<void> {
  const ropes = await prisma.rope.findMany({
    where: {
      userId: state.sub,
      active: true,
      OR: [{ fromSessionId: sourceSid }, { toSessionId: sourceSid }],
    },
  });
  for (const rope of ropes) {
    const recipient = rope.fromSessionId === sourceSid ? rope.toSessionId : rope.fromSessionId;
    const recipientPanel = (rope.fromSessionId === sourceSid ? rope.toPanel : rope.fromPanel) as A2APanel;
    const sourcePanel = (rope.fromSessionId === sourceSid ? rope.fromPanel : rope.toPanel) as A2APanel;
    await forwardOneRope(state, rope.id, sourceSid, sourcePanel, recipient, recipientPanel, rope.hopLimit);
  }
}

async function forwardOneRope(
  state: State,
  ropeId: string,
  sourceSid: string,
  sourcePanel: A2APanel,
  recipientSid: string,
  recipientPanel: A2APanel,
  hopLimit: number,
): Promise<void> {
  // session の最新メッセージ列を取得 (assistant + その直前の user)
  const resp = await fetchOpencode(state.sub, `/session/${encodeURIComponent(sourceSid)}/message`);
  if (!resp.ok) return;
  const list = (await resp.json()) as Array<{
    info?: { role?: string };
    parts?: Array<{ type?: string; text?: string }>;
  }>;
  if (!Array.isArray(list) || list.length === 0) return;

  let assistant: (typeof list)[number] | null = null;
  let userBefore: (typeof list)[number] | null = null;
  for (let i = list.length - 1; i >= 0; i--) {
    const role = list[i].info?.role;
    if (assistant === null && role === "assistant") {
      assistant = list[i];
    } else if (assistant !== null && role === "user") {
      userBefore = list[i];
      break;
    }
  }
  if (!assistant) return;

  const assistantText = (assistant.parts ?? [])
    .filter((p) => p.type === "text")
    .map((p) => p.text ?? "")
    .join("\n")
    .trim();
  if (!assistantText) return;

  // 直前 user メッセージを decode して hop を算出
  let prevHop = 0;
  if (userBefore) {
    const userText = userBefore.parts?.find((p) => p.type === "text")?.text ?? "";
    const decoded = decode(userText);
    if (decoded.meta) prevHop = decoded.meta.hop;
  }
  const newHop = prevHop + 1;
  const hash = hashContent(assistantText);
  const preview = assistantText.slice(0, 200);

  if (newHop > hopLimit) {
    await prisma.a2AMessage.create({
      data: {
        ropeId,
        fromPanel: sourcePanel,
        hopCount: newHop,
        contentHash: hash,
        contentPreview: preview,
        delivered: false,
        skipReason: "hopLimit",
      },
    });
    return;
  }
  if (await isDuplicate(ropeId, hash, DEDUP_RECENT_N)) {
    await prisma.a2AMessage.create({
      data: {
        ropeId,
        fromPanel: sourcePanel,
        hopCount: newHop,
        contentHash: hash,
        contentPreview: preview,
        delivered: false,
        skipReason: "dedup",
      },
    });
    return;
  }

  await prisma.a2AMessage.create({
    data: {
      ropeId,
      fromPanel: sourcePanel,
      hopCount: newHop,
      contentHash: hash,
      contentPreview: preview,
      delivered: true,
    },
  });

  const entry: QueueEntry = {
    ropeId,
    toSessionId: recipientSid,
    fromPanel: sourcePanel,
    hopCount: newHop,
    content: assistantText,
  };
  // 受信側が idle ならそのまま送信、busy ならキューに積む。
  // 未観測 (undefined) の場合は "とりあえず送る" を選択する (opencode に到達後に
  // busy/idle 状態が SSE で確定する)。
  if (state.idleBySession.get(recipientSid) === false) {
    let q = state.sendQueue.get(recipientSid);
    if (!q) {
      q = [];
      state.sendQueue.set(recipientSid, q);
    }
    q.push(entry);
    return;
  }
  await sendNow(state, entry);
  // recipientPanel は現状 use していないが、将来パケットアニメーション側で使う想定。
  void recipientPanel;
}
