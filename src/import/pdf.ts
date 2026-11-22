// PDF 電子機票：抽出文字。這個檔案（連同 pdf.js）用到才載入。
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export interface PdfContent {
  /** 所有頁的文字。掃描成圖片的 PDF 會是空的。 */
  text: string
  /** 第一頁畫成的圖，給條碼與文字辨識用（PDF 裡沒有文字時）。 */
  firstPage: () => Promise<Blob>
}

export async function readPdf(file: Blob): Promise<PdfContent> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const lines: string[] = []
  for (let n = 1; n <= Math.min(doc.numPages, 8); n++) {
    const page = await doc.getPage(n)
    const content = await page.getTextContent()
    let line = ''
    for (const item of content.items) {
      if (!('str' in item)) continue
      line += item.str + (item.hasEOL ? '\n' : ' ')
    }
    lines.push(line)
  }
  return {
    text: lines.join('\n').trim(),
    firstPage: async () => {
      const page = await doc.getPage(1)
      const viewport = page.getViewport({ scale: 2 })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      await page.render({ canvas, viewport }).promise
      return new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('畫不出來'))), 'image/png'))
    },
  }
}
