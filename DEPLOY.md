# 把牌局部署到公网（之后只用手机也能联机）

当前项目是「客户端 + Bun WebSocket 服务器」。离线单文件没有服务器，所以不能匹配。
把服务器部署到免费云平台后，你和同学只需要手机浏览器打开同一个网址即可匹配，不再依赖你的电脑。

## 方案一：Render（免费，最简单）

1. 把整个 `sgs-lite` 项目上传到一个 GitHub 仓库。
   - GitHub 网页端可以直接拖拽上传文件；仓库设为 Public 或 Private 均可。
2. 打开 <https://render.com>，注册并登录。
3. 点 **New → Blueprint**，连接刚才的 GitHub 仓库。
   - 仓库里的 `render.yaml` 会被自动识别。
   - 如果没有识别，改用 **New → Web Service**，运行时选 **Docker**，套餐选 **Free**。
4. 等待构建完成，Render 会给出一个地址，例如：
   `https://paiju-xxxx.onrender.com`
5. 你和同学都用手机浏览器打开这个地址，点「匹配游戏」即可。

注意事项：
- 免费实例约 15 分钟无访问会休眠，下一次打开需要等 30–60 秒唤醒。
- 对局房间保存在内存中；服务重启或休眠后，进行中的对局会丢失。
- WebSocket 在 Render 免费 Web Service 上可用，不需要额外配置。
- 首次构建会执行 `bun install` 和 `vite build`，通常 2–5 分钟。

## 方案二：Railway / Fly.io

项目根目录已经提供 `Dockerfile`，任何支持 Docker 的平台都可以直接部署：

- Railway：New Project → Deploy from GitHub → 选择仓库，自动使用 Dockerfile。
- Fly.io：安装 flyctl 后，在项目目录执行 `fly launch`，选择 Docker 部署。
- 其他 VPS：安装 Docker 后执行：
  ```bash
  docker build -t paiju .
  docker run -d --name paiju -p 80:4173 paiju
  ```
  然后访问 `http://服务器IP/`。

## 方案三：一台安卓手机当服务器（不推荐）

如果两台手机必须完全离线、不依赖任何云服务，可以让一台安卓手机用 Termux 安装 Bun，
在本机运行 `launcher/serve.ts`，另一台手机连同一个热点访问 `http://热点网关IP:4173/`。
缺点：需要 Termux、耗电、iPhone 无法作为主机、热点下 IP 可能变化。稳定性不如云平台。

## 本地/局域网

电脑运行时，同一 Wi-Fi 下访问 `http://电脑局域网IP:4173/` 即可匹配；这只适合在同一网络内。
