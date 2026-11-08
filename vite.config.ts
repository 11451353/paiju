import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig(({ mode }) => {
  // mode=offline 时打包成单个 HTML，对局引擎跑在浏览器里，无需服务端
  const offline = mode === 'offline'

  return {
    plugins: [react(), ...(offline ? [viteSingleFile()] : [])],
    server: {
      host: true,
      port: 5173,
      // 开发时把匹配接口和退出接口转发到本地游戏服务（launcher/serve.ts）
      proxy: {
        '/ws': { target: 'ws://127.0.0.1:4173', ws: true },
        '/__shutdown': { target: 'http://127.0.0.1:4173' },
      },
    },
    build: offline
      ? {
          outDir: 'dist-offline',
          assetsInlineLimit: 100_000_000,
          cssCodeSplit: false,
          rollupOptions: { output: { inlineDynamicImports: true } },
        }
      : {},
  }
})
