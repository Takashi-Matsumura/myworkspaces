FROM qdrant/qdrant:latest AS qdrant-bin

FROM python:3.12-slim

# Qdrant バイナリはマルチステージで持ち込む。公式 config は使わず自作を配置。
COPY --from=qdrant-bin /qdrant/qdrant /usr/local/bin/qdrant

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      supervisor \
      ca-certificates \
      curl \
      libunwind8 \
      libunwind-dev && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

COPY qdrant.yaml /etc/qdrant/config.yaml
COPY supervisord.conf /etc/supervisor/conf.d/myworkspaces-rag.conf
COPY app/ /app/

RUN mkdir -p /data/qdrant /data/snapshots /data/uploads
WORKDIR /app

EXPOSE 9090

ENTRYPOINT ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/myworkspaces-rag.conf"]
