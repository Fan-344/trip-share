import { defineConfig } from 'vitest/config'
import preact from '@preact/preset-vite'

// base 用相對路徑：GitHub Pages 的網址是 <帳號>.github.io/<repo>/，換網址時不必重新打包。
export default defineConfig({
  base: './',
  plugins: [preact()],
  test: { environment: 'node' },
})
