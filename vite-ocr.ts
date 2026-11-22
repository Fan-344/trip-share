import { createReadStream, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin } from 'vite'

/**
 * 文字辨識（機票截圖）要用的檔案：引擎、模型。從 node_modules 搬到網站的 ocr/ 底下，
 * 檔名固定——辨識引擎是照檔名自己去抓的，而且規格書要求不從 CDN 載入。
 * 這些檔案很大（一台手機實際只會抓其中約 7 MB），按下辨識才下載，見 vite-sw.ts。
 */
const FILES: Record<string, string> = {
  'worker.min.js': 'tesseract.js/dist/worker.min.js',
  // 引擎有三種，依手機支援的指令集挑一個
  'tesseract-core-lstm.wasm.js': 'tesseract.js-core/tesseract-core-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js': 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-relaxedsimd-lstm.wasm.js': 'tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js',
  'eng.traineddata.gz': '@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz',
}

export const OCR_DIR = 'ocr'

export function ocrFiles(): Plugin {
  const source = (name: string) => join(import.meta.dirname, 'node_modules', FILES[name])
  return {
    name: 'trip-share-ocr',
    // 開發時：直接從 node_modules 送出
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = /\/ocr\/([^/?]+)/.exec(req.url ?? '')?.[1]
        if (!name || !FILES[name]) return next()
        const path = source(name)
        res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : 'application/octet-stream')
        res.setHeader('Content-Length', statSync(path).size)
        createReadStream(path).pipe(res)
      })
    },
    // 打包時：複製進 dist/ocr/
    generateBundle() {
      for (const name of Object.keys(FILES)) {
        this.emitFile({ type: 'asset', fileName: `${OCR_DIR}/${name}`, source: readFileSync(source(name)) })
      }
    },
  }
}
