"""myworkspaces RAG sidecar.

1 コンテナ内で:
  - Qdrant (127.0.0.1:6333) をベクトル DB として走らせる (supervisord で別プロセス)
  - FastAPI (0.0.0.0:9090) が以下を提供:
      POST /ingest                  ドキュメントを chunk 化して埋め込み→Qdrant に格納
      GET  /documents               登録済みドキュメント一覧 (doc_id 単位で集計)
      DELETE /documents/{doc_id}    Qdrant から doc_id 一致のポイントを一括削除
      POST /v1/chat/completions     OpenAI 互換 proxy (RAG 注入 + stream パススルー)
      POST /v1/embeddings           そのままパススルー
      GET  /healthz
"""

from __future__ import annotations

import asyncio
import json
import os
import time
import uuid
from typing import Any, Dict, List, Optional

import httpx
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse, Response, StreamingResponse
from qdrant_client import QdrantClient
from qdrant_client.http import models as qmodels
from qdrant_client.http.exceptions import UnexpectedResponse

from chunking import chunk_text, extract_text

# ─────────────────────────────────────────────
# 設定 (環境変数で上書き可)
# ─────────────────────────────────────────────

# チャット用の llama-server (Gemma 4 等)。隔離モードでも egress-proxy が
# 同 FQDN を解決するため、URL は全環境で共通。
LLAMA_CHAT_URL = os.environ.get(
    "LLAMA_CHAT_URL", "http://host.docker.internal:8080/v1"
)
# 埋め込み用の llama-server (BGE-M3 など)。別プロセスとしてホストで立てる想定。
LLAMA_EMBED_URL = os.environ.get(
    "LLAMA_EMBED_URL", "http://host.docker.internal:8081/v1"
)
# Qdrant の接続先 (同コンテナ内の別プロセス)。
QDRANT_URL = os.environ.get("QDRANT_URL", "http://127.0.0.1:6333")
COLLECTION = os.environ.get("RAG_COLLECTION", "docs")
# 取得するチャンク数。多すぎるとコンテキスト溢れ、少なすぎると根拠不足。
TOP_K = int(os.environ.get("RAG_TOP_K", "4"))
# 埋め込みの一括送信件数。llama-server の /v1/embeddings が配列対応なので batch。
EMBED_BATCH = int(os.environ.get("RAG_EMBED_BATCH", "16"))

app = FastAPI()

qdrant = QdrantClient(url=QDRANT_URL, prefer_grpc=False, timeout=30.0)
_collection_ready = False
_collection_lock = asyncio.Lock()


# ─────────────────────────────────────────────
# 埋め込み取得
# ─────────────────────────────────────────────


async def embed_texts(texts: List[str]) -> List[List[float]]:
    """llama-server の /v1/embeddings (OpenAI 互換) に問い合わせる。

    Gemma 用の llama-server とは別ポート (8081 既定) に BGE-M3 等を立てている前提。
    """
    if not texts:
        return []
    vectors: List[List[float]] = []
    async with httpx.AsyncClient(timeout=120.0) as client:
        for i in range(0, len(texts), EMBED_BATCH):
            batch = texts[i : i + EMBED_BATCH]
            resp = await client.post(
                f"{LLAMA_EMBED_URL}/embeddings",
                json={"input": batch, "model": "embed"},
            )
            resp.raise_for_status()
            payload = resp.json()
            for item in payload.get("data", []):
                vec = item.get("embedding")
                if not isinstance(vec, list):
                    raise RuntimeError("embedding response missing 'embedding' field")
                vectors.append(vec)
    return vectors


async def ensure_collection(dim: int) -> None:
    """最初の ingest で vector 次元が判ったタイミングで collection を作成する。

    BGE-M3 は 1024 / Nomic Embed v1.5 は 768 等、モデルで変わるので起動時に固定しない。
    """
    global _collection_ready
    if _collection_ready:
        return
    async with _collection_lock:
        if _collection_ready:
            return
        try:
            qdrant.get_collection(COLLECTION)
            _collection_ready = True
            return
        except (UnexpectedResponse, ValueError):
            pass
        qdrant.create_collection(
            collection_name=COLLECTION,
            vectors_config=qmodels.VectorParams(
                size=dim, distance=qmodels.Distance.COSINE
            ),
        )
        _collection_ready = True


# ─────────────────────────────────────────────
# Ingest / Documents
# ─────────────────────────────────────────────


@app.post("/ingest")
async def ingest(
    doc_id: str = Form(...),
    filename: str = Form(...),
    file: UploadFile = File(...),
) -> Dict[str, Any]:
    data = await file.read()
    text = extract_text(filename, data)
    chunks = chunk_text(text)
    if not chunks:
        return {"doc_id": doc_id, "chunk_count": 0, "bytes": len(data)}

    vectors = await embed_texts(chunks)
    if not vectors:
        raise HTTPException(status_code=500, detail="embedding failed")
    await ensure_collection(len(vectors[0]))

    points: List[qmodels.PointStruct] = []
    for idx, (chunk, vec) in enumerate(zip(chunks, vectors)):
        points.append(
            qmodels.PointStruct(
                id=str(uuid.uuid4()),
                vector=vec,
                payload={
                    "doc_id": doc_id,
                    "filename": filename,
                    "chunk_index": idx,
                    "text": chunk,
                },
            )
        )
    qdrant.upsert(collection_name=COLLECTION, points=points)
    return {"doc_id": doc_id, "chunk_count": len(points), "bytes": len(data)}


@app.get("/documents")
async def list_documents() -> Dict[str, Any]:
    try:
        qdrant.get_collection(COLLECTION)
    except (UnexpectedResponse, ValueError):
        return {"documents": []}

    seen: Dict[str, Dict[str, Any]] = {}
    next_page = None
    while True:
        records, next_page = qdrant.scroll(
            collection_name=COLLECTION,
            limit=256,
            with_payload=True,
            with_vectors=False,
            offset=next_page,
        )
        for rec in records:
            payload = rec.payload or {}
            doc_id = payload.get("doc_id")
            if not doc_id:
                continue
            if doc_id not in seen:
                seen[doc_id] = {
                    "doc_id": doc_id,
                    "filename": payload.get("filename"),
                    "chunk_count": 0,
                }
            seen[doc_id]["chunk_count"] += 1
        if next_page is None:
            break
    return {"documents": list(seen.values())}


@app.delete("/documents/{doc_id}")
async def delete_document(doc_id: str) -> Dict[str, Any]:
    try:
        qdrant.delete(
            collection_name=COLLECTION,
            points_selector=qmodels.FilterSelector(
                filter=qmodels.Filter(
                    must=[
                        qmodels.FieldCondition(
                            key="doc_id",
                            match=qmodels.MatchValue(value=doc_id),
                        )
                    ]
                )
            ),
        )
    except (UnexpectedResponse, ValueError):
        pass
    return {"doc_id": doc_id, "deleted": True}


# ─────────────────────────────────────────────
# Search (Phase E-B-1: opencode tool 用の明示検索)
# ─────────────────────────────────────────────
#
# /v1/chat/completions は LLM 呼び出しに付随して暗黙的に top-K を system に注入する形
# だが、それとは別に「LLM が自分で検索結果を取りに行く」ための tool 用エンドポイント。
# Biz パネルの recall_research tool から /api/biz/internal/recall 経由で叩かれる。
#
# 引数:
#   { "query": "...", "top_k"?: int (default RAG_TOP_K, max 16) }
# 返り値:
#   { "hits": [ {doc_id, filename, chunk_index, text, score}, ... ] }


@app.post("/search")
async def search_endpoint(request: Request) -> JSONResponse:
    try:
        body = await request.json()
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="invalid json")

    query = body.get("query")
    if not isinstance(query, str) or not query.strip():
        raise HTTPException(status_code=400, detail="query (string) is required")

    requested_k = body.get("top_k")
    if isinstance(requested_k, int) and requested_k > 0:
        top_k = min(requested_k, 16)
    else:
        top_k = TOP_K

    try:
        qdrant.get_collection(COLLECTION)
    except (UnexpectedResponse, ValueError):
        return JSONResponse({"hits": []})

    try:
        vectors = await embed_texts([query])
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"embedding failed: {e}")
    if not vectors:
        return JSONResponse({"hits": []})

    try:
        hits = qdrant.search(
            collection_name=COLLECTION,
            query_vector=vectors[0],
            limit=top_k,
            with_payload=True,
        )
    except (UnexpectedResponse, ValueError) as e:
        raise HTTPException(status_code=502, detail=f"qdrant search failed: {e}")

    return JSONResponse(
        {
            "hits": [
                {
                    "doc_id": (h.payload or {}).get("doc_id"),
                    "filename": (h.payload or {}).get("filename"),
                    "chunk_index": (h.payload or {}).get("chunk_index"),
                    "text": (h.payload or {}).get("text", ""),
                    "score": h.score,
                }
                for h in hits
            ]
        }
    )


# ─────────────────────────────────────────────
# Chat completions (RAG 注入 + stream パススルー)
# ─────────────────────────────────────────────


def _extract_last_user_text(messages: List[Dict[str, Any]]) -> str:
    for msg in reversed(messages):
        if msg.get("role") != "user":
            continue
        content = msg.get("content")
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            texts: List[str] = []
            for part in content:
                if isinstance(part, dict) and isinstance(part.get("text"), str):
                    texts.append(part["text"])
            return "\n".join(texts)
    return ""


async def _retrieve_context(query: str) -> List[Dict[str, Any]]:
    if not query.strip():
        return []
    try:
        qdrant.get_collection(COLLECTION)
    except (UnexpectedResponse, ValueError):
        return []
    try:
        vectors = await embed_texts([query])
    except Exception:
        return []
    if not vectors:
        return []
    hits = qdrant.search(
        collection_name=COLLECTION,
        query_vector=vectors[0],
        limit=TOP_K,
        with_payload=True,
    )
    return [
        {
            "doc_id": (h.payload or {}).get("doc_id"),
            "filename": (h.payload or {}).get("filename"),
            "chunk_index": (h.payload or {}).get("chunk_index"),
            "text": (h.payload or {}).get("text", ""),
            "score": h.score,
        }
        for h in hits
    ]


def _build_context_message(hits: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not hits:
        return None
    blocks = []
    for i, h in enumerate(hits, start=1):
        fname = h.get("filename") or "(unknown)"
        blocks.append(f"[資料 {i}: {fname}]\n{h.get('text', '')}")
    body = "\n\n---\n\n".join(blocks)
    return {
        "role": "system",
        "content": (
            "以下の資料を優先的に参照して回答してください。"
            "資料に書かれていない内容は推測せず、その旨を明示してください。\n\n"
            f"{body}"
        ),
    }


@app.post("/v1/chat/completions")
async def chat_completions(request: Request) -> Response:
    try:
        body = await request.json()
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="invalid json")

    messages = body.get("messages")
    if not isinstance(messages, list):
        raise HTTPException(status_code=400, detail="messages required")

    last_user_text = _extract_last_user_text(messages)
    hits = await _retrieve_context(last_user_text)
    ctx_msg = _build_context_message(hits)
    if ctx_msg is not None:
        # 既存の system メッセージ群を先頭に維持しつつ、RAG コンテキストはその直後に挿入。
        new_messages: List[Dict[str, Any]] = []
        inserted = False
        for m in messages:
            new_messages.append(m)
            if not inserted and m.get("role") == "system":
                new_messages.append(ctx_msg)
                inserted = True
        if not inserted:
            new_messages = [ctx_msg, *messages]
        body["messages"] = new_messages

    stream = bool(body.get("stream"))
    upstream_url = f"{LLAMA_CHAT_URL}/chat/completions"

    if not stream:
        async with httpx.AsyncClient(timeout=None) as client:
            resp = await client.post(upstream_url, json=body)
        return Response(
            content=resp.content,
            status_code=resp.status_code,
            media_type=resp.headers.get("content-type", "application/json"),
        )

    async def event_stream():
        # httpx はデフォルトで Accept-Encoding: gzip, deflate, br, zstd を送る。
        # llama-server が SSE を圧縮で返すと aiter_raw() は未展開バイトを下流に
        # 流してしまい、opencode の SSE parser が壊れて reasoning_content delta が
        # 欠落する (Thinking が表示されない症状)。圧縮を明示的に抑止し、保険として
        # 受信側も decode 済みの aiter_bytes() を使う。
        req_headers = {
            "accept-encoding": "identity",
            "accept": "text/event-stream",
        }
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "POST", upstream_url, json=body, headers=req_headers,
            ) as resp:
                async for chunk in resp.aiter_bytes():
                    if chunk:
                        yield chunk

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ─────────────────────────────────────────────
# Embeddings passthrough (opencode が埋め込みを要求する場合のフォールバック)
# ─────────────────────────────────────────────


@app.post("/v1/embeddings")
async def embeddings_passthrough(request: Request) -> Response:
    body = await request.body()
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            f"{LLAMA_EMBED_URL}/embeddings",
            content=body,
            headers={"content-type": "application/json"},
        )
    return Response(
        content=resp.content,
        status_code=resp.status_code,
        media_type=resp.headers.get("content-type", "application/json"),
    )


# ─────────────────────────────────────────────
# Models passthrough (opencode が最初に叩く)
# ─────────────────────────────────────────────


@app.get("/v1/models")
async def models_passthrough() -> Response:
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(f"{LLAMA_CHAT_URL}/models")
    return Response(
        content=resp.content,
        status_code=resp.status_code,
        media_type=resp.headers.get("content-type", "application/json"),
    )


# ─────────────────────────────────────────────
# Health
# ─────────────────────────────────────────────


@app.get("/healthz")
async def healthz() -> JSONResponse:
    checks = {"qdrant": False, "llama_chat": False, "llama_embed": False}
    try:
        qdrant.get_collections()
        checks["qdrant"] = True
    except Exception:
        pass
    async with httpx.AsyncClient(timeout=3.0) as client:
        try:
            r = await client.get(f"{LLAMA_CHAT_URL}/models")
            checks["llama_chat"] = r.status_code < 500
        except Exception:
            pass
        try:
            r = await client.post(
                f"{LLAMA_EMBED_URL}/embeddings",
                json={"input": ["probe"], "model": "embed"},
            )
            checks["llama_embed"] = r.status_code < 500
        except Exception:
            pass
    ok = all(checks.values())
    return JSONResponse(
        {"ok": ok, "checks": checks, "ts": time.time()},
        status_code=200 if ok else 503,
    )
