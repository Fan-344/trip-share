// 登機證條碼：從圖片裡讀出條碼內容。這個檔案（連同條碼引擎）用到才載入。
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader'
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'

// 引擎預設會去 CDN 抓；改成抓我們自己網站上的那一份。
prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) } })

/** 圖片裡所有讀得到的條碼內容（紙本登機證是長條的 PDF417，手機登機證多半是 Aztec 或 QR）。 */
export async function readBarcodeTexts(image: Blob): Promise<string[]> {
  const found = await readBarcodes(image, { formats: ['PDF417', 'Aztec', 'QRCode', 'DataMatrix'], tryHarder: true, maxNumberOfSymbols: 4 })
  return found.map((r) => r.text).filter(Boolean)
}
