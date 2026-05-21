FROM node:20-bookworm-slim

ARG YT_DLP_VERSION=2026.03.17

ENV NODE_ENV=production \
    PORT=8787 \
    HOST=0.0.0.0 \
    YTDLP_BIN=/usr/local/bin/yt-dlp \
    FFMPEG_PATH=/usr/bin/ffmpeg

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates ffmpeg python3 python3-pip \
  && python3 -m pip install --break-system-packages --no-cache-dir "yt-dlp[default,curl-cffi]==${YT_DLP_VERSION}" \
  && yt-dlp --version \
  && ffmpeg -version | head -n 1 \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
  && npm cache clean --force

COPY scripts/ytdlp-proxy.mjs scripts/ytdlp-proxy.mjs

EXPOSE 8787

CMD ["node", "scripts/ytdlp-proxy.mjs"]
