import { defineConfig } from 'vitest/config'
import preact from '@preact/preset-vite'
import { serviceWorker } from './vite-sw'

// base 用相對路徑：GitHub Pages 的網址是 <帳號>.github.io/<repo>/，換網址時不必重新打包。
export default defineConfig({
  base: './',
  plugins: [preact(), serviceWorker()],
  define: {
    // 台灣時間的打包時刻，顯示在首頁底部。
    __BUILD__: JSON.stringify(
      new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).slice(0, 16),
    ),
  },
  test: { environment: 'node' },
})
