#!/usr/bin/env bash
# myworkspaces のローカル LLM + RAG スタックを起動するためのサンプル。
#
# ポート割り当て:
#   :8080  chat 用 llama-server (Gemma 4 E4B IT 等)
#   :8081  embedding 用 llama-server (BGE-M3 等) ← RAG サイドカーが叩く
#
# あらかじめ llama.cpp をビルドしておくこと。モデルファイルの実パスは環境依存なので
# 下記の変数をローカル環境に合わせて書き換えて使う。

set -euo pipefail

LLAMA_BIN="${LLAMA_BIN:-${HOME}/llama.cpp/build/bin/llama-server}"
CHAT_MODEL="${CHAT_MODEL:-${HOME}/models/gemma-4-e4b-it-Q4_K_M.gguf}"
EMBED_MODEL="${EMBED_MODEL:-${HOME}/models/bge-m3-Q4_K_M.gguf}"

CHAT_PORT="${CHAT_PORT:-8080}"
EMBED_PORT="${EMBED_PORT:-8081}"

if [[ ! -x "${LLAMA_BIN}" ]]; then
  echo "llama-server not found at ${LLAMA_BIN}" >&2
  echo "set LLAMA_BIN env var or rebuild llama.cpp" >&2
  exit 1
fi
if [[ ! -f "${CHAT_MODEL}" ]]; then
  echo "chat model not found: ${CHAT_MODEL}" >&2
  exit 1
fi
if [[ ! -f "${EMBED_MODEL}" ]]; then
  echo "embed model not found: ${EMBED_MODEL}" >&2
  echo "hint: huggingface.co の BAAI/bge-m3 などから GGUF 変換版を取得" >&2
  exit 1
fi

echo "[start-llama-servers] chat server: ${CHAT_MODEL} -> :${CHAT_PORT}"
"${LLAMA_BIN}" \
  -m "${CHAT_MODEL}" \
  --host 0.0.0.0 \
  --port "${CHAT_PORT}" \
  --ctx-size 8192 \
  --jinja \
  > /tmp/myworkspaces-llama-chat.log 2>&1 &
CHAT_PID=$!

echo "[start-llama-servers] embed server: ${EMBED_MODEL} -> :${EMBED_PORT}"
"${LLAMA_BIN}" \
  -m "${EMBED_MODEL}" \
  --host 0.0.0.0 \
  --port "${EMBED_PORT}" \
  --embedding \
  --pooling mean \
  > /tmp/myworkspaces-llama-embed.log 2>&1 &
EMBED_PID=$!

echo "[start-llama-servers] PIDs: chat=${CHAT_PID} embed=${EMBED_PID}"
echo "[start-llama-servers] logs:"
echo "  /tmp/myworkspaces-llama-chat.log"
echo "  /tmp/myworkspaces-llama-embed.log"

trap 'kill ${CHAT_PID} ${EMBED_PID} 2>/dev/null || true' EXIT INT TERM
wait
