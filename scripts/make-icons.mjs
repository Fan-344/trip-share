// 產生 App 圖示（地圖圖釘）。不依賴任何套件；改了顏色或形狀後重跑：node scripts/make-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { crc32, deflateSync } from 'node:zlib'

const BG = [0x17, 0x61, 0x6b]
const FG = [0xff, 0xff, 0xff]

/** 座標是 0–1。圖形留在中央 60% 以內，Android 把圖示裁成圓形時也不會被切到。 */
function inPin(x, y) {
  const cx = 0.5, cy = 0.42, r = 0.17
  const d = Math.hypot(x - cx, y - cy)
  if (d < 0.065) return false // 圖釘中間的洞
  if (d < r) return true
  // 圓的下半接到尖端的三角形
  const tipY = 0.74
  if (y > cy && y < tipY) {
    const half = r * 0.96 * (1 - (y - cy) / (tipY - cy))
    return Math.abs(x - cx) < half
  }
  return false
}

function png(size) {
  const S = 4 // 每個像素取 4×4 個點，邊緣才不會鋸齒
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let py = 0; py < size; py++) {
    const row = py * (size * 4 + 1)
    raw[row] = 0
    for (let px = 0; px < size; px++) {
      let hit = 0
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        if (inPin((px + (sx + 0.5) / S) / size, (py + (sy + 0.5) / S) / size)) hit++
      }
      const a = hit / (S * S)
      for (let c = 0; c < 3; c++) raw[row + 1 + px * 4 + c] = Math.round(BG[c] * (1 - a) + FG[c] * a)
      raw[row + 1 + px * 4 + 3] = 255
    }
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data])
    const out = Buffer.alloc(body.length + 8)
    out.writeUInt32BE(data.length, 0)
    body.copy(out, 4)
    out.writeUInt32BE(crc32(body), body.length + 4)
    return out
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr.set([8, 6, 0, 0, 0], 8) // 8 位元、RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ])
}

const dir = new URL('../public/icons/', import.meta.url)
mkdirSync(dir, { recursive: true })
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(new URL(name, dir), png(size))
  console.log(name, size)
}
