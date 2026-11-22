// 截圖或照片：在手機上做文字辨識（只認英文與數字）。這個檔案（連同辨識引擎）用到才載入。
// 引擎與模型放在我們自己網站的 ocr/ 底下（見 vite-ocr.ts），不從別的地方抓；圖片不會離開手機。
import { createWorker } from 'tesseract.js'

const base = new URL('ocr/', document.baseURI).href

/**
 * 辨識前先整理圖片：縮放到適合的大小、轉灰階、把對比拉開。
 * 截圖常是淺灰字或彩色底，這樣處理後英數字比較讀得出來。
 */
async function prepare(image: Blob): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(image)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const long = Math.max(img.naturalWidth, img.naturalHeight)
    const scale = long > 2400 ? 2400 / long : long < 1200 ? Math.min(2, 1200 / long) : 1
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const px = data.data
    const hist = new Uint32Array(256)
    for (let i = 0; i < px.length; i += 4) {
      const g = Math.round(px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114)
      px[i] = g
      hist[g]++
    }
    // 最暗與最亮各切掉 2%，中間拉滿
    const total = px.length / 4
    let lo = 0
    let hi = 255
    for (let n = 0; lo < 255 && (n += hist[lo]) < total * 0.02;) lo++
    for (let n = 0; hi > 0 && (n += hist[hi]) < total * 0.02;) hi--
    const span = Math.max(1, hi - lo)
    for (let i = 0; i < px.length; i += 4) {
      const v = Math.max(0, Math.min(255, Math.round(((px[i] - lo) / span) * 255)))
      px[i] = px[i + 1] = px[i + 2] = v
    }
    ctx.putImageData(data, 0, 0)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** 辨識一張圖。onProgress：0–1，第一次會包含下載引擎的時間。 */
export async function readImageText(image: Blob, onProgress: (p: number) => void = () => {}): Promise<string> {
  const canvas = await prepare(image)
  const worker = await createWorker('eng', 1, {
    workerPath: base + 'worker.min.js',
    corePath: base,
    langPath: base,
    workerBlobURL: false,
    // 檔案由 Service Worker 存著離線用，引擎不必自己再存一份
    cacheMethod: 'none',
    logger: (m) => {
      if (m.status === 'recognizing text') onProgress(0.3 + m.progress * 0.7)
      else onProgress(Math.min(0.3, 0.05 + m.progress * 0.1))
    },
  })
  try {
    const { data } = await worker.recognize(canvas)
    return data.text
  } finally {
    await worker.terminate()
  }
}
