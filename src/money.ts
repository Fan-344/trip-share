// 幣別：購物的價錢預設用目的地的貨幣。
import type { Flight } from './model/types'

/** 選單裡的幣別，常去的排前面。 */
export const CURRENCIES = [
  '台幣', '泰銖', '日圓', '韓元', '港幣', '澳門幣', '新加坡幣', '馬幣', '披索', '越南盾', '印尼盾', '人民幣',
  '美元', '加幣', '歐元', '英鎊', '澳幣', '紐幣',
]

const BY_ZONE: Record<string, string> = {
  'Asia/Taipei': '台幣', 'Asia/Bangkok': '泰銖', 'Asia/Tokyo': '日圓', 'Asia/Seoul': '韓元',
  'Asia/Hong_Kong': '港幣', 'Asia/Macau': '澳門幣', 'Asia/Singapore': '新加坡幣', 'Asia/Kuala_Lumpur': '馬幣',
  'Asia/Manila': '披索', 'Asia/Ho_Chi_Minh': '越南盾', 'Asia/Makassar': '印尼盾', 'Asia/Shanghai': '人民幣',
  'America/Los_Angeles': '美元', 'America/New_York': '美元', 'America/Vancouver': '加幣',
  'Europe/London': '英鎊', 'Europe/Paris': '歐元', 'Europe/Berlin': '歐元',
  'Australia/Sydney': '澳幣', 'Australia/Melbourne': '澳幣', 'Australia/Brisbane': '澳幣', 'Australia/Perth': '澳幣', 'Australia/Adelaide': '澳幣',
  'Pacific/Auckland': '紐幣',
}

const BY_THEME: Record<string, string> = { thai: '泰銖', japan: '日圓', korea: '韓元', hongkong: '港幣', vietnam: '越南盾', singapore: '新加坡幣', europe: '歐元', australia: '澳幣', newzealand: '紐幣' }

export interface CurrencyGuess {
  currency: string
  /** 怎麼判斷出來的（給畫面說明用）。 */
  why: 'flight' | 'items' | 'theme' | 'none'
  /** flight 時是航班代號與目的地機場，例如「JX1751 飛 CNX」。 */
  detail: string
}

/**
 * 依目的地判斷這趟行程用什麼幣別。照順序找，找到就用：
 * 1. 去程航班（最早起飛那班）的目的地。
 * 2. 行程項目最常用的當地時間（不是台灣的）。沒有填航班、但項目有設當地時間時用得上。
 * 3. 手動選的佈景主題（泰北山城 → 泰銖、日本 → 日圓）。
 * 4. 都判斷不出來：台幣。
 */
export function detectCurrency(flights: Flight[], itemZones: string[] = [], theme = ''): CurrencyGuess {
  const first = [...flights].sort((a, b) => a.dep.local.localeCompare(b.dep.local))[0]
  if (first && BY_ZONE[first.arr.tz]) {
    return { currency: BY_ZONE[first.arr.tz], why: 'flight', detail: `${first.code} 飛 ${first.to}` }
  }
  const counts = new Map<string, number>()
  for (const tz of itemZones) {
    const cur = BY_ZONE[tz]
    if (cur && cur !== '台幣') counts.set(cur, (counts.get(cur) ?? 0) + 1)
  }
  const top = [...counts].sort((a, b) => b[1] - a[1])[0]
  if (top) return { currency: top[0], why: 'items', detail: '' }
  if (BY_THEME[theme]) return { currency: BY_THEME[theme], why: 'theme', detail: '' }
  return { currency: '台幣', why: 'none', detail: '' }
}

export const defaultCurrency = (flights: Flight[]): string => detectCurrency(flights).currency

/** 價錢存成一段文字，例如「350 泰銖」。金額是空的就整個留空。 */
export function formatPrice(amount: string, currency: string): string {
  const a = amount.trim()
  return a ? `${a} ${currency}` : ''
}

/**
 * 把存著的價錢拆回金額與幣別（給編輯畫面用）。
 * 舊資料或手打的寫法拆不出幣別時，整段當成金額、幣別用 fallback。
 */
export function parsePrice(price: string | undefined, fallback: string): { amount: string; currency: string } {
  const p = (price ?? '').trim()
  const cur = CURRENCIES.find((c) => p.endsWith(c))
  if (cur) return { amount: p.slice(0, -cur.length).trim(), currency: cur }
  return { amount: p, currency: fallback }
}

/**
 * 選單裡給選的幣別：結帳用的（home，預設台幣）、當地用的（dest），加上設定裡另外加的（extra）。
 * current 是這筆資料已經存著的幣別；如果不在裡面（舊資料），也列出來，免得一打開就被換掉。
 */
export function currencyChoices(dest: string, current = '', extra: string[] = [], home = '台幣'): string[] {
  return [...new Set([home, dest, ...extra, current].filter((c) => CURRENCIES.includes(c)))]
}

/**
 * 新記一筆時預設用哪種幣別：設定裡指定的優先；沒指定就用這支手機上次在這份行程選的；再沒有就用目的地的貨幣。
 * 指定的、記住的如果已經不在選單裡，就當作沒有。
 */
export function startCurrency(choices: string[], dest: string, def: string, remembered: string | null): string {
  if (def && choices.includes(def)) return def
  if (remembered && choices.includes(remembered)) return remembered
  return dest
}
