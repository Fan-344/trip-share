// 匯入機票：把貼上的文字、PDF、圖片變成航班（規格書第 9 節）。全部在手機上處理。
import { parseBoardingPass, parseTicketText, type TicketFlight, type TicketHint } from '../ticket'

export interface ImportResult {
  flights: TicketFlight[]
  /** 是怎麼讀到的，畫面上會說明。 */
  via: 'text' | 'pdf' | 'barcode' | 'ocr'
}

export type Stage = '讀取 PDF…' | '找條碼…' | '辨識文字…'

const fromBarcodes = (texts: string[], hint: TicketHint) => texts.flatMap((t) => parseBoardingPass(t, hint))

/** 圖片：先找登機證條碼（最準），沒有再做文字辨識。 */
async function fromImage(image: Blob, hint: TicketHint, onStage: (s: Stage, progress?: number) => void): Promise<ImportResult> {
  onStage('找條碼…')
  try {
    const { readBarcodeTexts } = await import('./barcode')
    const flights = fromBarcodes(await readBarcodeTexts(image), hint)
    if (flights.length) return { flights, via: 'barcode' }
  } catch (e) {
    console.warn('條碼讀取失敗，改用文字辨識', e)
  }
  onStage('辨識文字…', 0)
  const { readImageText } = await import('./ocr')
  const text = await readImageText(image, (p) => onStage('辨識文字…', p))
  return { flights: parseTicketText(text, hint), via: 'ocr' }
}

export async function importFile(file: File, hint: TicketHint, onStage: (s: Stage, progress?: number) => void): Promise<ImportResult> {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
  if (!isPdf) return fromImage(file, hint, onStage)
  onStage('讀取 PDF…')
  const { readPdf } = await import('./pdf')
  const pdf = await readPdf(file)
  const flights = parseTicketText(pdf.text, hint)
  if (flights.length) return { flights, via: 'pdf' }
  // 掃描成圖片的 PDF：把第一頁當圖片處理
  return fromImage(await pdf.firstPage(), hint, onStage)
}

export const importText = (text: string, hint: TicketHint): ImportResult => ({ flights: parseTicketText(text, hint), via: 'text' })
