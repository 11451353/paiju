FROM oven/bun:1

WORKDIR /app

# 部署时不需要 Playwright 浏览器，避免构建镜像时下载几百 MB
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# 先装依赖，利用 Docker 层缓存
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile || bun install

COPY . .
RUN bun x vite build

WORKDIR /app/launcher
ENV PORT=4173
EXPOSE 4173

CMD ["bun", "serve.ts"]
