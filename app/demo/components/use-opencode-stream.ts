"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";

// opencode の /event SSE を購読しつつ、セッション / メッセージ / part を
// まとめて管理する状態ストア。
//
// opencode の event スキーマ (Phase 1 probe で確定した形):
// - message.part.updated: { part: { id, messageID, sessionID, type, text? } }
//     → parts[id] を登録。type が "text" / "reasoning" / "step-start" etc.
// - message.part.delta: { partID, messageID, sessionID, field, delta }
//     → parts[partID][field] に delta を文字連結
// - message.updated: { info: { id, role, sessionID, ... } }
//     → messages に登録 (未登録なら追加)
// - session.updated: { ... }
// - session.status: { sessionID, status: { type: "busy" | "idle" } }
// - session.idle:   { sessionID }

export type SessionInfo = {
  id: string;
  title?: string;
  directory?: string;
  projectID?: string;
  version?: string;
  time?: { created?: number; updated?: number };
};

export type MessageInfo = {
  id: string;
  role: "user" | "assistant" | string;
  sessionID: string;
  partIds: string[]; // updated で到着した順
};

export type ModelRef = {
  providerID: string;
  modelID: string;
};

// ワークスペースの opencode.json から引いたモデル表示情報。
// session の info.model は assistant 側 null / user 側 slug で当てにならないため、
// 設定ファイルから直接取るのが最も確実。
export type OpencodeConfig = {
  workspaceId: string;
  providerID: string;
  modelID: string;
  providerName: string;
  modelName: string;
};

export type PartInfo = {
  id: string;
  messageID: string;
  sessionID: string;
  type: string; // "text" | "reasoning" | "step-start" | "step-finish" | ...
  text: string; // delta で追記される
};

type State = {
  sessions: SessionInfo[];
  messagesBySession: Record<string, MessageInfo[]>;
  parts: Record<string, PartInfo>;
  busyBySession: Record<string, boolean>;
  // 現在アクティブなワークスペースの opencode.json から解決したモデル情報。
  config: OpencodeConfig | null;
  connected: boolean;
};

type Action =
  | { type: "reset" }
  | { type: "sessions/replace"; sessions: SessionInfo[] }
  | { type: "sessions/upsert"; session: SessionInfo }
  | { type: "sessions/remove"; sessionId: string }
  | {
      type: "messages/replace";
      sessionId: string;
      messages: MessageInfo[];
      parts: Record<string, PartInfo>;
    }
  | { type: "messages/upsert"; message: MessageInfo }
  | { type: "part/updated"; part: PartInfo }
  | {
      type: "part/delta";
      partID: string;
      messageID: string;
      sessionID: string;
      field: string;
      delta: string;
    }
  | { type: "session/busy"; sessionId: string; busy: boolean }
  | { type: "config/set"; config: OpencodeConfig | null }
  | { type: "connected"; value: boolean };

function initialState(): State {
  return {
    sessions: [],
    messagesBySession: {},
    parts: {},
    busyBySession: {},
    config: null,
    connected: false,
  };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "reset":
      return initialState();
    case "sessions/replace":
      return { ...state, sessions: action.sessions };
    case "sessions/upsert": {
      const idx = state.sessions.findIndex((s) => s.id === action.session.id);
      const next = [...state.sessions];
      if (idx >= 0) next[idx] = { ...next[idx], ...action.session };
      else next.unshift(action.session);
      return { ...state, sessions: next };
    }
    case "sessions/remove":
      return {
        ...state,
        sessions: state.sessions.filter((s) => s.id !== action.sessionId),
      };
    case "messages/replace":
      return {
        ...state,
        messagesBySession: {
          ...state.messagesBySession,
          [action.sessionId]: action.messages,
        },
        parts: { ...state.parts, ...action.parts },
      };
    case "messages/upsert": {
      const list = state.messagesBySession[action.message.sessionID] ?? [];
      const idx = list.findIndex((m) => m.id === action.message.id);
      const nextList = [...list];
      if (idx >= 0)
        nextList[idx] = { ...nextList[idx], ...action.message, partIds: nextList[idx].partIds };
      else nextList.push(action.message);
      return {
        ...state,
        messagesBySession: {
          ...state.messagesBySession,
          [action.message.sessionID]: nextList,
        },
      };
    }
    case "part/updated": {
      const existing = state.parts[action.part.id];
      const merged: PartInfo = {
        ...action.part,
        text: existing?.text ?? action.part.text ?? "",
      };
      const nextParts = { ...state.parts, [action.part.id]: merged };
      // message に partIds を付け加える (まだなければ)
      const list = state.messagesBySession[action.part.sessionID] ?? [];
      const msgIdx = list.findIndex((m) => m.id === action.part.messageID);
      let nextList = list;
      if (msgIdx >= 0) {
        const msg = list[msgIdx];
        if (!msg.partIds.includes(action.part.id)) {
          nextList = [...list];
          nextList[msgIdx] = { ...msg, partIds: [...msg.partIds, action.part.id] };
        }
      } else {
        // part が先に来てしまったケース: message の枠を作る (role は後で埋まる)
        nextList = [
          ...list,
          {
            id: action.part.messageID,
            role: "assistant",
            sessionID: action.part.sessionID,
            partIds: [action.part.id],
          },
        ];
      }
      return {
        ...state,
        parts: nextParts,
        messagesBySession: {
          ...state.messagesBySession,
          [action.part.sessionID]: nextList,
        },
      };
    }
    case "part/delta": {
      const existing = state.parts[action.partID];
      const base: PartInfo = existing ?? {
        id: action.partID,
        messageID: action.messageID,
        sessionID: action.sessionID,
        type: "text",
        text: "",
      };
      if (action.field !== "text") {
        // 現状 reasoning も field:"text" で届く。他の field は未対応
        return state;
      }
      const nextParts = {
        ...state.parts,
        [action.partID]: { ...base, text: (base.text ?? "") + action.delta },
      };
      return { ...state, parts: nextParts };
    }
    case "session/busy":
      return {
        ...state,
        busyBySession: {
          ...state.busyBySession,
          [action.sessionId]: action.busy,
        },
      };
    case "config/set":
      return { ...state, config: action.config };
    case "connected":
      return { ...state, connected: action.value };
    default:
      return state;
  }
}

// opencode /event の SSE data を State に反映する。
function applySseMessage(raw: string, dispatch: (a: Action) => void): void {
  let msg: { type?: string; properties?: Record<string, unknown> };
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  const p = (msg.properties ?? {}) as Record<string, unknown>;
  switch (msg.type) {
    case "server.connected":
      dispatch({ type: "connected", value: true });
      return;
    case "server.heartbeat":
      return;
    case "session.updated": {
      const s = (p.info ?? p.session) as SessionInfo | undefined;
      if (s?.id) dispatch({ type: "sessions/upsert", session: s });
      return;
    }
    case "session.deleted": {
      const sid = (p.sessionID ?? p.id) as string | undefined;
      if (sid) dispatch({ type: "sessions/remove", sessionId: sid });
      return;
    }
    case "session.status": {
      const sid = p.sessionID as string | undefined;
      const status = (p.status as { type?: string } | undefined)?.type;
      if (sid) {
        dispatch({
          type: "session/busy",
          sessionId: sid,
          busy: status === "busy",
        });
      }
      return;
    }
    case "session.idle": {
      const sid = p.sessionID as string | undefined;
      if (sid) dispatch({ type: "session/busy", sessionId: sid, busy: false });
      return;
    }
    case "message.updated": {
      // info.model は user 側に session slug、assistant 側に null が入る
      // 奇妙なスキーマなので、ここでは model 情報は扱わない。
      const info = p.info as
        | { id?: string; role?: string; sessionID?: string }
        | undefined;
      if (info?.id && info.sessionID) {
        dispatch({
          type: "messages/upsert",
          message: {
            id: info.id,
            role: info.role ?? "assistant",
            sessionID: info.sessionID,
            partIds: [],
          },
        });
      }
      return;
    }
    case "message.part.updated": {
      const part = p.part as PartInfo | undefined;
      if (part?.id && part.messageID && part.sessionID) {
        dispatch({
          type: "part/updated",
          part: {
            id: part.id,
            messageID: part.messageID,
            sessionID: part.sessionID,
            type: part.type ?? "text",
            text: part.text ?? "",
          },
        });
      }
      return;
    }
    case "message.part.delta": {
      const partID = p.partID as string | undefined;
      const messageID = p.messageID as string | undefined;
      const sessionID = p.sessionID as string | undefined;
      const field = (p.field as string | undefined) ?? "text";
      const delta = (p.delta as string | undefined) ?? "";
      if (partID && messageID && sessionID) {
        dispatch({
          type: "part/delta",
          partID,
          messageID,
          sessionID,
          field,
          delta,
        });
      }
      return;
    }
    default:
      return;
  }
}

// session の履歴 JSON から messages と parts を抽出する。
// opencode の /session/{id}/message レスポンスは
//   [ { info: {id,role,sessionID,...}, parts: [ {id,type,text,...}, ... ] }, ... ]
// の形で返ってくる。
function flattenHistory(raw: unknown): {
  messages: MessageInfo[];
  parts: Record<string, PartInfo>;
} {
  const messages: MessageInfo[] = [];
  const parts: Record<string, PartInfo> = {};
  if (!Array.isArray(raw)) return { messages, parts };
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const info = (entry as {
      info?: { id?: string; role?: string; sessionID?: string };
    }).info;
    const partsArr = (entry as { parts?: unknown[] }).parts;
    if (!info?.id || !info.sessionID) continue;
    const partIds: string[] = [];
    if (Array.isArray(partsArr)) {
      for (const p of partsArr) {
        if (!p || typeof p !== "object") continue;
        const pp = p as Partial<PartInfo>;
        if (!pp.id) continue;
        parts[pp.id] = {
          id: pp.id,
          messageID: pp.messageID ?? info.id,
          sessionID: pp.sessionID ?? info.sessionID,
          type: pp.type ?? "text",
          text: pp.text ?? "",
        };
        partIds.push(pp.id);
      }
    }
    messages.push({
      id: info.id,
      role: info.role ?? "assistant",
      sessionID: info.sessionID,
      partIds,
    });
  }
  return { messages, parts };
}

export function useOpencodeStream() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const esRef = useRef<EventSource | null>(null);

  // SSE 接続のライフサイクル。アンマウントで close。
  useEffect(() => {
    let es: EventSource | null = null;
    const open = () => {
      es = new EventSource("/api/opencode/events");
      esRef.current = es;
      es.onopen = () => dispatch({ type: "connected", value: true });
      es.onmessage = (ev) => applySseMessage(ev.data, dispatch);
      es.onerror = () => {
        // ブラウザの EventSource は自動再接続する (SSE default)。
        // connected フラグだけ下ろしておく。
        dispatch({ type: "connected", value: false });
      };
    };
    open();
    return () => {
      es?.close();
      esRef.current = null;
    };
  }, []);

  const refreshSessions = useCallback(async () => {
    const resp = await fetch("/api/opencode/sessions");
    if (!resp.ok) return;
    const json = (await resp.json()) as SessionInfo[];
    dispatch({ type: "sessions/replace", sessions: json });
  }, []);

  const loadMessages = useCallback(async (sessionId: string) => {
    const resp = await fetch(
      `/api/opencode/sessions/${encodeURIComponent(sessionId)}/messages`,
    );
    if (!resp.ok) return;
    const json = await resp.json();
    const { messages, parts } = flattenHistory(json);
    dispatch({ type: "messages/replace", sessionId, messages, parts });
  }, []);

  // opencode.json から解決したモデル情報を取得する。
  // ワークスペース切替後や初期化直後に呼ぶと config が更新される。
  const loadConfig = useCallback(async (): Promise<void> => {
    try {
      const resp = await fetch("/api/opencode/config");
      if (!resp.ok) {
        dispatch({ type: "config/set", config: null });
        return;
      }
      const json = (await resp.json()) as OpencodeConfig;
      dispatch({ type: "config/set", config: json });
    } catch {
      dispatch({ type: "config/set", config: null });
    }
  }, []);

  const createSession = useCallback(async (): Promise<SessionInfo | null> => {
    const resp = await fetch("/api/opencode/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    if (!resp.ok) return null;
    const session = (await resp.json()) as SessionInfo;
    dispatch({ type: "sessions/upsert", session });
    return session;
  }, []);

  const deleteSession = useCallback(async (sessionId: string) => {
    const resp = await fetch(
      `/api/opencode/sessions/${encodeURIComponent(sessionId)}`,
      { method: "DELETE" },
    );
    if (resp.ok) dispatch({ type: "sessions/remove", sessionId });
  }, []);

  const sendPrompt = useCallback(
    async (sessionId: string, text: string): Promise<boolean> => {
      const resp = await fetch(
        `/api/opencode/sessions/${encodeURIComponent(sessionId)}/prompt`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ parts: [{ type: "text", text }] }),
        },
      );
      return resp.ok;
    },
    [],
  );

  const abortSession = useCallback(async (sessionId: string): Promise<boolean> => {
    const resp = await fetch(
      `/api/opencode/sessions/${encodeURIComponent(sessionId)}/abort`,
      { method: "POST" },
    );
    return resp.ok;
  }, []);

  return {
    state,
    refreshSessions,
    loadMessages,
    loadConfig,
    createSession,
    deleteSession,
    sendPrompt,
    abortSession,
  };
}
