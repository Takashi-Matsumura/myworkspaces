#!/usr/bin/env bash
# myworkspaces のユーザーごとに紐づくコンテナ・volume・network をまとめて掃除する。
#
# 消すもの:
#   - myworkspaces-shell-*       (ユーザー shell コンテナ)
#   - myworkspaces-rag-*         (ユーザー RAG サイドカー)
#   - myworkspaces-egress-proxy  (隔離モード用の共有サイドカー)
#   - user-defined network       (myworkspaces-user-*, myworkspaces-isolated)
#   - named volume               (myworkspaces-home-*, myworkspaces-rag-data-*)
#
# 残すもの:
#   - myworkspaces-postgres (DB コンテナ) とその volume `myworkspaces-db`
#     ユーザーアカウント・ワークスペースメタ・ホワイトボードは保持される
#   - myworkspaces-sandbox / myworkspaces-rag イメージ
#
# 使い方:
#   事前にブラウザでログアウト → dev サーバを止めてから実行推奨 (走ったままだと
#   Next.js 側の ensureContainer が再作成しに来ることがある)。
#
#   ./scripts/reset-containers.sh          # コンフィグ通り全部消す
#   ./scripts/reset-containers.sh --keep-volumes  # volume だけ残す (/root とかは保持)

set -euo pipefail

KEEP_VOLUMES=false
for arg in "$@"; do
  case "${arg}" in
    --keep-volumes) KEEP_VOLUMES=true ;;
    *) echo "unknown arg: ${arg}" >&2; exit 1 ;;
  esac
done

say() { printf '[reset] %s\n' "$*"; }

# docker ... -q の複数行出力を xargs に食わせる。
# macOS の xargs は空入力でもコマンドを起動してしまうので、空チェックを挟む。
remove_batch() {
  local kind="$1"
  local ids="$2"
  local cmd="$3"  # "container rm -f" | "volume rm" | "network rm"
  if [[ -z "${ids}" ]]; then
    say "${kind}: nothing to remove"
    return
  fi
  local count
  count=$(printf '%s\n' "${ids}" | grep -c .)
  say "${kind}: removing ${count} entries"
  printf '%s\n' "${ids}" | while IFS= read -r it; do
    [[ -n "${it}" ]] && say "  - ${it}"
  done
  # shellcheck disable=SC2086
  printf '%s\n' "${ids}" | xargs docker ${cmd} >/dev/null
}

# --- containers ---
SHELLS=$(docker ps -aq --filter 'label=io.myworkspaces.role=session' 2>/dev/null || true)
remove_batch "shell containers" "${SHELLS}" "container rm -f"

RAGS=$(docker ps -aq --filter 'label=io.myworkspaces.role=rag' 2>/dev/null || true)
remove_batch "rag sidecars" "${RAGS}" "container rm -f"

if docker inspect myworkspaces-egress-proxy >/dev/null 2>&1; then
  say "egress proxy: removing"
  docker rm -f myworkspaces-egress-proxy >/dev/null
fi

# --- user networks ---
USER_NETS=$(docker network ls -q --filter 'label=io.myworkspaces.role=user-network' 2>/dev/null || true)
remove_batch "user networks" "${USER_NETS}" "network rm"

if docker network inspect myworkspaces-isolated >/dev/null 2>&1; then
  say "isolated network: removing"
  docker network rm myworkspaces-isolated >/dev/null
fi

# --- volumes (optional) ---
if [[ "${KEEP_VOLUMES}" == "true" ]]; then
  say "volumes: keeping (/root と Qdrant データは保持)"
else
  HOMES=$(docker volume ls -q --filter 'label=io.myworkspaces.role=home' 2>/dev/null || true)
  remove_batch "home volumes" "${HOMES}" "volume rm"

  RAG_DATA=$(docker volume ls -q --filter 'label=io.myworkspaces.role=rag-data' 2>/dev/null || true)
  remove_batch "rag data volumes" "${RAG_DATA}" "volume rm"
fi

say "done. next /api/container or login will recreate shell + rag sidecar."
