// 時間與時區（規格書第 5 節）：時間一律存「當地時間＋時區」，顯示時標示是哪裡的時間。
import type { Flight, LocalTime } from './model/types'

interface Airport {
  /** 機場顯示名稱。 */
  name: string
  /** 「（清邁當地時間）」裡用的地名。 */
  place: string
  tz: string
}

const a = (name: string, tz: string, place = name): Airport => ({ name, place, tz })

/** 常用機場。輸入代碼就能帶出時區；不在表裡的機場可以自己選時區。 */
export const AIRPORTS: Record<string, Airport> = {
  TPE: a('桃園', 'Asia/Taipei', '台灣'), TSA: a('松山', 'Asia/Taipei', '台灣'),
  KHH: a('高雄', 'Asia/Taipei', '台灣'), RMQ: a('台中', 'Asia/Taipei', '台灣'),
  CNX: a('清邁', 'Asia/Bangkok'), BKK: a('曼谷', 'Asia/Bangkok'), DMK: a('曼谷廊曼', 'Asia/Bangkok', '曼谷'),
  HKT: a('普吉', 'Asia/Bangkok'), NRT: a('東京成田', 'Asia/Tokyo', '東京'), HND: a('東京羽田', 'Asia/Tokyo', '東京'),
  KIX: a('大阪', 'Asia/Tokyo'), NGO: a('名古屋', 'Asia/Tokyo'), FUK: a('福岡', 'Asia/Tokyo'),
  CTS: a('札幌', 'Asia/Tokyo'), OKA: a('沖繩', 'Asia/Tokyo'), SHI: a('下地島', 'Asia/Tokyo'),
  MMY: a('宮古島', 'Asia/Tokyo'), ISG: a('石垣島', 'Asia/Tokyo'), SDJ: a('仙台', 'Asia/Tokyo'),
  KMJ: a('熊本', 'Asia/Tokyo'), KOJ: a('鹿兒島', 'Asia/Tokyo'), TAK: a('高松', 'Asia/Tokyo'),
  OKJ: a('岡山', 'Asia/Tokyo'), HIJ: a('廣島', 'Asia/Tokyo'), UKB: a('神戶', 'Asia/Tokyo'),
  KMQ: a('小松', 'Asia/Tokyo'), ICN: a('首爾仁川', 'Asia/Seoul', '首爾'),
  GMP: a('首爾金浦', 'Asia/Seoul', '首爾'), PUS: a('釜山', 'Asia/Seoul'), CJU: a('濟州', 'Asia/Seoul'),
  HKG: a('香港', 'Asia/Hong_Kong'), MFM: a('澳門', 'Asia/Macau'), SIN: a('新加坡', 'Asia/Singapore'),
  KUL: a('吉隆坡', 'Asia/Kuala_Lumpur'), MNL: a('馬尼拉', 'Asia/Manila'), CEB: a('宿霧', 'Asia/Manila'),
  SGN: a('胡志明市', 'Asia/Ho_Chi_Minh'), HAN: a('河內', 'Asia/Ho_Chi_Minh'), DAD: a('峴港', 'Asia/Ho_Chi_Minh'),
  DPS: a('峇里島', 'Asia/Makassar'), PVG: a('上海', 'Asia/Shanghai'), PEK: a('北京', 'Asia/Shanghai'),
  LAX: a('洛杉磯', 'America/Los_Angeles'), SFO: a('舊金山', 'America/Los_Angeles'),
  SEA: a('西雅圖', 'America/Los_Angeles'), JFK: a('紐約', 'America/New_York'),
  YVR: a('溫哥華', 'America/Vancouver'), LHR: a('倫敦', 'Europe/London'), CDG: a('巴黎', 'Europe/Paris'),
  FRA: a('法蘭克福', 'Europe/Berlin'), SYD: a('雪梨', 'Australia/Sydney'), MEL: a('墨爾本', 'Australia/Melbourne'),
}

const ZONES: Record<string, string> = {
  'Asia/Taipei': '台灣', 'Asia/Bangkok': '泰國', 'Asia/Tokyo': '日本', 'Asia/Seoul': '韓國',
  'Asia/Hong_Kong': '香港', 'Asia/Macau': '澳門', 'Asia/Singapore': '新加坡', 'Asia/Kuala_Lumpur': '馬來西亞',
  'Asia/Manila': '菲律賓', 'Asia/Ho_Chi_Minh': '越南', 'Asia/Makassar': '峇里島', 'Asia/Shanghai': '中國',
  'America/Los_Angeles': '美西', 'America/New_York': '美東', 'America/Vancouver': '溫哥華',
  'Europe/London': '英國', 'Europe/Paris': '法國', 'Europe/Berlin': '德國',
  'Australia/Sydney': '雪梨', 'Australia/Melbourne': '墨爾本',
}

/** 時區選單的選項：行程用到的排前面，再接內建的常用時區。 */
export function zoneOptions(flights: Flight[], current = ''): string[] {
  return [...new Set([...tripZones(flights, current ? [current] : []), ...Object.keys(ZONES)])]
}

export const deviceTz =(): string => Intl.DateTimeFormat().resolvedOptions().timeZone

export const airportName = (code: string): string => AIRPORTS[code.toUpperCase()]?.name ?? ''

/**
 * 這個時區在這趟行程裡該叫什麼。優先用航班的機場（飛清邁就叫「清邁」而不是「泰國」），
 * 再來是內建的地區名，最後才用時區代碼的最後一段。
 */
export function placeName(tz: string, flights: Flight[] = []): string {
  for (const f of flights) {
    for (const [code, t] of [[f.to, f.arr], [f.from, f.dep]] as const) {
      const ap = AIRPORTS[code.toUpperCase()]
      if (ap && t.tz === tz && ap.tz === tz) return ap.place
    }
  }
  return ZONES[tz] ?? tz.split('/').pop()!.replace(/_/g, ' ')
}

/** 這趟行程會用到的時區（給表單的選單）。 */
export function tripZones(flights: Flight[], extra: string[] = []): string[] {
  return [...new Set([...flights.flatMap((f) => [f.dep.tz, f.arr.tz]), ...extra, deviceTz()].filter(Boolean))]
}

/** 新增項目時的預設時區：那天人在哪裡。看航班——最後一班已抵達的航班的目的地；還沒出發就是出發地。 */
export function defaultTz(date: string, flights: Flight[]): string {
  const sorted = [...flights].sort((x, y) => x.dep.local.localeCompare(y.dep.local))
  if (sorted.length === 0) return deviceTz()
  let tz = sorted[0].dep.tz
  for (const f of sorted) if (f.arr.local.slice(0, 10) <= date) tz = f.arr.tz
  return tz
}

/** 某個時區在某一刻比 UTC 快幾毫秒。 */
function offsetAt(utc: number, tz: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    }).formatToParts(utc).map((x) => [x.type, Number(x.value)]),
  )
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(utc / 1000) * 1000
}

/** 「當地時間＋時區」換成絕對時間（毫秒）。時區無效時當成 UTC。 */
export function toInstant(t: LocalTime): number {
  const [d, hm = '00:00'] = t.local.split('T')
  const [y, mo, da] = d.split('-').map(Number)
  const [h, mi] = hm.split(':').map(Number)
  const wall = Date.UTC(y, mo - 1, da, h, mi)
  try {
    const first = wall - offsetAt(wall, t.tz)
    return wall - offsetAt(first, t.tz) // 再算一次，處理剛好跨日光節約時間的情況
  } catch {
    return wall
  }
}

const WEEKDAYS = '日一二三四五六'

/** '2027-03-05' → { md: '3/5', wd: '五' }。只看日期本身，不受手機時區影響。 */
export function dayLabel(date: string): { md: string; wd: string } {
  const [y, m, d] = date.split('-').map(Number)
  return { md: `${m}/${d}`, wd: WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] }
}

export const fullDay = (date: string): string => {
  const { md, wd } = dayLabel(date)
  return `${md}（${wd}）`
}

const dayNumber = (date: string): number => {
  const [y, m, d] = date.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000)
}

export const nightsBetween = (from: string, to: string): number => dayNumber(to) - dayNumber(from)

/** 起訖日之間的每一天；日期不完整或顛倒時回傳空陣列。最多列 60 天。 */
export function daysBetween(start: string, end: string): string[] {
  if (!/^\d{4}-\d\d-\d\d$/.test(start) || !/^\d{4}-\d\d-\d\d$/.test(end)) return []
  const out: string[] = []
  for (let n = dayNumber(start); n <= dayNumber(end) && out.length < 60; n++) {
    out.push(new Date(n * 86_400_000).toISOString().slice(0, 10))
  }
  return out
}

/** 手機所在地的今天。 */
export function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function countdown(ms: number): { d: number; h: number; m: number; s: number } {
  const s = Math.max(0, Math.floor(ms / 1000))
  return { d: Math.floor(s / 86400), h: Math.floor(s / 3600) % 24, m: Math.floor(s / 60) % 60, s: s % 60 }
}

/** 「10 分鐘前」這類寫法。 */
export function ago(at: number, now = Date.now()): string {
  const min = Math.floor((now - at) / 60_000)
  if (min < 1) return '剛剛'
  if (min < 60) return `${min} 分鐘前`
  if (min < 60 * 24) return `${Math.floor(min / 60)} 小時前`
  if (min < 60 * 24 * 7) return `${Math.floor(min / 1440)} 天前`
  const d = new Date(at)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

/** 這些類別的地點通常是找得到的店家或景點，預設用地點名稱找地圖；交通、休息之類的預設不要。 */
const SEARCH_BY_DEFAULT = ['food', 'sight', 'activity', 'shop']

/** 沒貼連結時要不要用地點名稱找地圖：有明確勾選就照勾選，沒有就看類別。 */
export function mapSearchOn(item: { mapSearch?: boolean; cat?: string }): boolean {
  return item.mapSearch ?? SEARCH_BY_DEFAULT.includes(item.cat ?? '')
}

/**
 * 行程項目的地圖連結。
 * - 有貼地圖連結（而且是 http／https）：直接開那個地點（exact）。
 * - 沒貼、有填地點、而且這個項目要用地點找地圖：到 Google 地圖搜尋；
 *   near 是所在地（例如「清邁」），加進去比較不會搜到別的城市。
 * - 其他情況：沒有連結。
 */
export function mapLink(
  item: { mapUrl?: string; place: string; mapSearch?: boolean; cat?: string }, near = '',
): { url: string; exact: boolean } | null {
  const pasted = item.mapUrl ? safeUrl(item.mapUrl) : null
  if (pasted) return { url: pasted, exact: true }
  const place = item.place.trim()
  if (!place || !mapSearchOn(item)) return null
  const query = near && !place.includes(near) ? `${place} ${near}` : place
  return { url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`, exact: false }
}

/** 別人填的連結只接受 http／https，其他一律不給點（避免 javascript: 之類的網址）。 */
export function safeUrl(u: string): string | null {
  try {
    const url = new URL(u.trim())
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch {
    return null
  }
}
