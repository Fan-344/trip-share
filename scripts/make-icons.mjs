// 產生 App 圖示。圖畫在 scripts/icon.svg（氣氛擔當、丸子頭）；改了之後重跑：node scripts/make-icons.mjs
// 轉成 PNG 用 macOS 內建的 sips，不依賴任何套件（所以只能在 Mac 上跑；產生的 PNG 會進版本庫，部署時不用再跑）。
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const src = fileURLToPath(new URL('./icon.svg', import.meta.url))
const dir = new URL('../public/icons/', import.meta.url)
mkdirSync(dir, { recursive: true })
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  execFileSync('sips', ['-s', 'format', 'png', '-z', String(size), String(size), src, '--out', fileURLToPath(new URL(name, dir))], { stdio: 'ignore' })
  console.log(name, size)
}
