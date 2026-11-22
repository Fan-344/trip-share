import { defineConfig } from 'vitest/config'
import preact from '@preact/preset-vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { ocrFiles } from './vite-ocr.ts'
import { serviceWorker } from './vite-sw.ts'

// base 用相對路徑：GitHub Pages 的網址是 <帳號>.github.io/<repo>/，換網址時不必重新打包。
export default defineConfig(({ mode }) => ({
  base: './',
  // lan 模式（npm run dev:lan）：給同一個 Wi-Fi 的手機看開發中的版本。
  // 用自簽憑證走 HTTPS，因為瀏覽器的加密功能只在 HTTPS 下能用；手機第一次開會跳憑證警告。
  plugins: [preact(), ocrFiles(), serviceWorker(), ...(mode === 'lan' ? [basicSsl()] : [])],
  define: {
    // 台灣時間的打包時刻，顯示在首頁底部。
    __BUILD__: JSON.stringify(
      new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).slice(0, 16),
    ),
  },
  test: { environment: 'node' },
}))
