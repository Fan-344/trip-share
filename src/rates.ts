// 分帳用的匯率：從公開的匯率服務抓「1 外幣等於多少結帳幣別」（結帳幣別預設台幣，可以在設定裡改）。
// 只送出幣別代碼，不帶任何行程內容。抓下來就存進行程、固定住，不會自己每天變（同一筆帳的金額才不會今天明天不一樣）。
import { HOME } from './split'

/** 幣別的國際代碼（src/money.ts 的 CURRENCIES）。 */
const CODE: Record<string, string> = {
  台幣: 'TWD', 泰銖: 'THB', 日圓: 'JPY', 韓元: 'KRW', 港幣: 'HKD', 澳門幣: 'MOP', 新加坡幣: 'SGD', 馬幣: 'MYR',
  披索: 'PHP', 越南盾: 'VND', 印尼盾: 'IDR', 人民幣: 'CNY', 美元: 'USD', 加幣: 'CAD', 歐元: 'EUR', 英鎊: 'GBP', 澳幣: 'AUD', 紐幣: 'NZD',
}

/** 匯率服務：免費、不用金鑰，一天更新一次。條款要求標示來源（畫面上有寫）。 */
export const RATE_SOURCE = 'exchangerate-api.com'

/**
 * 四捨五入到台幣小數後二位（1 日圓 ＝ 0.21、1 美元 ＝ 32.05）。
 * 不到 0.1 的（韓元、越南盾、印尼盾）取兩位小數會差太多甚至變成 0，改留兩位有效數字（0.023、0.0013）。
 */
const tidy = (n: number) => (n >= 0.1 ? Math.round(n * 100) / 100 : Number(n.toPrecision(2)))

/**
 * 從服務回的內容挑出要的幣別。服務給的是「1 台幣等於多少外幣」，這裡倒過來變成「1 外幣等於多少台幣」。
 * 沒有的、不是正數的就不回傳。
 */
export function pickRates(body: unknown, curs: string[]): Record<string, number> {
  const table = (body as { rates?: Record<string, unknown> } | null)?.rates
  const out: Record<string, number> = {}
  if (!table || typeof table !== 'object') return out
  for (const cur of curs) {
    const per = table[CODE[cur] ?? '']
    if (typeof per === 'number' && per > 0 && Number.isFinite(per)) out[cur] = tidy(1 / per)
  }
  return out
}

/** 抓這幾個幣別現在的匯率。沒網路或服務有問題就丟錯，由畫面說明。 */
export async function fetchRates(curs: string[], home = HOME): Promise<Record<string, number>> {
  const res = await fetch(`https://open.er-api.com/v6/latest/${CODE[home] ?? CODE[HOME]}`)
  if (!res.ok) throw new Error(`rates ${res.status}`)
  return pickRates(await res.json(), curs)
}
