// 目的地的天氣：向 Open-Meteo（免費、不用帳號）查現在的氣溫和未來十幾天的預報。
// 送出去的只有目的地城市的經緯度，沒有任何行程內容或個人資料。
// 查到的結果在這支手機上留一小時，沒網路時顯示上次查到的。

export type WxKind = 'clear' | 'partly' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'mix' | 'storm'

export interface WxDay { date: string; kind: WxKind; hi: number; lo: number; rain: number }
export interface Weather {
  /** 什麼時候查的。 */
  at: number
  now: { temp: number; kind: WxKind }
  days: WxDay[]
}

export const WX_NAME: Record<WxKind, string> = {
  clear: '晴', partly: '多雲時晴', cloudy: '陰', fog: '霧', rain: '雨', snow: '雪', mix: '雨夾雪', storm: '雷雨',
}

/** 機場所在城市的經緯度（取到小數兩位就夠查天氣）。 */
const COORDS: Record<string, [number, number]> = {
  TPE: [25.08, 121.23], TSA: [25.07, 121.55], KHH: [22.58, 120.35], RMQ: [24.26, 120.62],
  CNX: [18.79, 98.98], BKK: [13.75, 100.5], DMK: [13.75, 100.5], HKT: [7.88, 98.39],
  NRT: [35.68, 139.76], HND: [35.68, 139.76], KIX: [34.69, 135.5], NGO: [35.18, 136.91], FUK: [33.59, 130.4],
  CTS: [43.06, 141.35], OKA: [26.21, 127.68], SHI: [24.83, 125.14], MMY: [24.8, 125.28], ISG: [24.34, 124.16],
  SDJ: [38.27, 140.87], KMJ: [32.8, 130.71], KOJ: [31.6, 130.56], TAK: [34.34, 134.05], OKJ: [34.66, 133.92],
  HIJ: [34.39, 132.46], UKB: [34.69, 135.2], KMQ: [36.56, 136.66],
  ICN: [37.57, 126.98], GMP: [37.57, 126.98], PUS: [35.18, 129.08], CJU: [33.5, 126.53],
  HKG: [22.3, 114.17], MFM: [22.2, 113.55], SIN: [1.29, 103.85], KUL: [3.14, 101.69],
  MNL: [14.6, 120.98], CEB: [10.32, 123.89], SGN: [10.78, 106.7], HAN: [21.03, 105.85], DAD: [16.05, 108.2],
  DPS: [-8.65, 115.22], PVG: [31.23, 121.47], PEK: [39.9, 116.4],
  LAX: [34.05, -118.24], SFO: [37.77, -122.42], SEA: [47.61, -122.33], JFK: [40.71, -74.01], YVR: [49.28, -123.12],
  LHR: [51.51, -0.13], CDG: [48.86, 2.35], FRA: [50.11, 8.68], SYD: [-33.87, 151.21], MEL: [-37.81, 144.96],
}

export const hasWeather = (airport: string): boolean => airport.toUpperCase() in COORDS

/** 氣象代碼（WMO）歸成七種天氣。 */
export function kindOf(code: number): WxKind {
  if (code === 0) return 'clear'
  if (code <= 2) return 'partly'
  if (code === 3) return 'cloudy'
  if (code === 45 || code === 48) return 'fog'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if (code >= 95) return 'storm'
  if (code >= 51) return 'rain'
  return 'cloudy'
}

/**
 * 一整天的天氣。服務給的「當日代碼」是那天最壞的一刻：只要有一小時飄毛毛雨，整天就算雨天；
 * 只要有一小時飄雪，整天就算雪天。所以不能直接拿來當圖示。改成：
 * - 雷雨照代碼。霧不照代碼：霧通常只有清晨幾小時，不拿來代表一整天，改看雲量。
 *   （「現在的天氣」是當下那一刻，起霧就照樣顯示霧，走 kindOf，不走這裡。）
 * - 雨還是雪：看那天實際落下來的量（fall）。雪比雨多是雪，雨比雪多是雨；
 *   兩種都有份量（各至少 0.5 毫米，少的那個不到多的三分之一就不算）是雨夾雪。
 *   沒給雨量雪量（舊的暫存）就照代碼。
 * - 算雨的那天：降雨機率四成以上，或機率兩成以上而且雨量有 1 毫米，才算雨天。機率沒給的話只看雨量。
 * - 其餘看整天的平均雲量：兩成以下是晴，七成以下是多雲時晴，再多是陰。沒給雲量就照代碼。
 */
export function dayKind(code: number, prob: number | null, mm: number | null, cloud: number | null, fall: Fall | null = null): WxKind {
  const base = kindOf(code)
  if (base === 'storm') return base
  // 這一天當成雨還是雪（或兩種都有）
  let wet: 'rain' | 'snow' | 'mix' | null = base === 'rain' || base === 'snow' ? base : null
  if (fall && (fall.rain > 0 || fall.snow > 0)) {
    const [less, more] = fall.rain < fall.snow ? [fall.rain, fall.snow] : [fall.snow, fall.rain]
    wet = less >= MIX_MIN && less >= more * MIX_RATIO ? 'mix' : fall.snow > fall.rain ? 'snow' : 'rain'
  }
  if (wet === 'snow' || wet === 'mix') return wet
  if (wet === 'rain') {
    const enough = prob === null ? (mm ?? 1) >= 1 : prob >= 40 || (prob >= 20 && (mm ?? 0) >= 1)
    if (enough) return 'rain'
  }
  if (cloud === null) return base === 'rain' || base === 'snow' ? 'partly' : base === 'fog' ? 'cloudy' : base
  return cloud < 20 ? 'clear' : cloud <= 70 ? 'partly' : 'cloudy'
}

/** 一天落下來的量，都換成毫米的水：雨（含陣雨），和雪（融成水）。 */
export interface Fall { rain: number; snow: number }

/** 雨夾雪的門檻：雨和雪各至少這麼多毫米，而且少的那個至少是多的這個比例。 */
const MIX_MIN = 0.5
const MIX_RATIO = 1 / 3

/** 服務給的降雪量是公分厚的雪；換成融成水的毫米數（0.7 公分的雪約等於 1 毫米的水）。 */
export const snowWater = (cm: number): number => cm / 0.7

/** 從一天的總降水量（毫米）和降雪量（公分）算出雨和雪各多少毫米的水。 */
export function fallOf(precipMm: number, snowCm: number): Fall {
  const snow = snowWater(snowCm)
  return { rain: Math.max(0, Math.round((precipMm - snow) * 10) / 10), snow: Math.round(snow * 10) / 10 }
}

const HOUR = 3_600_000
// 判斷天氣的方式改過，換一個名字，舊的暫存就不會再被拿來用
const keyOf = (airport: string) => `wx5:${airport.toUpperCase()}`

/** 上次查到的結果；沒查過、或資料壞了就是 null。 */
export function cachedWeather(airport: string): Weather | null {
  try {
    const w = JSON.parse(localStorage.getItem(keyOf(airport)) ?? 'null') as Weather | null
    return w && typeof w.at === 'number' && Array.isArray(w.days) ? w : null
  } catch {
    return null
  }
}

/** 把服務回傳的內容整理成我們要的樣子；格式不對就丟出錯誤。 */
export function parseWeather(json: unknown, at: number): Weather {
  const j = json as {
    current: { temperature_2m: number; weather_code: number }
    daily: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max?: (number | null)[]; precipitation_sum?: (number | null)[]; cloud_cover_mean?: (number | null)[]; snowfall_sum?: (number | null)[] }
  }
  if (typeof j?.current?.temperature_2m !== 'number' || !Array.isArray(j?.daily?.time)) throw new Error('天氣資料格式不對')
  return {
    at,
    now: { temp: Math.round(j.current.temperature_2m), kind: kindOf(j.current.weather_code) },
    days: j.daily.time.map((date, i) => ({
      date,
      kind: dayKind(
        j.daily.weather_code[i], j.daily.precipitation_probability_max?.[i] ?? null, j.daily.precipitation_sum?.[i] ?? null, j.daily.cloud_cover_mean?.[i] ?? null,
        // 有給降雪量才照量判斷雨雪；沒給就照代碼。
        // 雨量用「總降水量減掉雪」來算，不用服務另外給的雨量、陣性降水量：實際查到冷天的陣性降水就是雪，
        // 跟降雪量是同一批東西，加起來會重複算，整天零下也會變成「雨夾雪」。
        j.daily.snowfall_sum ? fallOf(j.daily.precipitation_sum?.[i] ?? 0, j.daily.snowfall_sum[i] ?? 0) : null,
      ),
      hi: Math.round(j.daily.temperature_2m_max[i]),
      lo: Math.round(j.daily.temperature_2m_min[i]),
      rain: Math.round(j.daily.precipitation_probability_max?.[i] ?? 0),
    })),
  }
}

/**
 * 查目的地的天氣。一小時內查過就直接用上次的；查不到（沒網路、服務掛了）回傳上次的，連上次的都沒有就是 null。
 */
export async function loadWeather(airport: string, now = Date.now()): Promise<Weather | null> {
  const at = COORDS[airport.toUpperCase()]
  if (!at) return null
  const old = cachedWeather(airport)
  if (old && now - old.at < HOUR) return old
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${at[0]}&longitude=${at[1]}`
      + '&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,cloud_cover_mean,snowfall_sum'
      + '&timezone=auto&forecast_days=16'
    const res = await fetch(url)
    if (!res.ok) throw new Error(`天氣服務回應 ${res.status}`)
    const w = parseWeather(await res.json(), now)
    try { localStorage.setItem(keyOf(airport), JSON.stringify(w)) } catch { /* 存不下就算了，下次再查 */ }
    return w
  } catch {
    return old
  }
}

/** 卡片上的一格：有預報的一天，或還沒有預報的一天（只有日期）。 */
export type WxSlot = (WxDay & { none?: false }) | { date: string; none: true }

const DAY_MS = 86_400_000
const dayMs = (date: string) => Date.parse(`${date}T00:00:00Z`)
const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/**
 * 卡片上要列哪幾天。
 * - 行程還沒開始、也還太早（整趟都在預報範圍之後）：回傳空的，畫面改顯示「幾月幾號起會有預報」。
 * - 行程跟預報範圍有重疊：從今天（或行程第一天）列到行程最後一天，一天一格；
 *   預報還沒到的那幾天是佔位的格子（none）。天數多就左右滑。
 * - 行程已經結束：列接下來五天。
 */
export function pickDays(w: Weather, start: string, end: string): WxSlot[] {
  const first = w.days[0]?.date
  const last = w.days[w.days.length - 1]?.date
  if (!first || !last || !start || !end || end < first) return w.days.slice(0, 5)
  if (start > last) return []
  const byDate = new Map(w.days.map((d) => [d.date, d]))
  const out: WxSlot[] = []
  for (let ms = dayMs(start > first ? start : first); ms <= dayMs(end); ms += DAY_MS) {
    const date = dayOf(ms)
    out.push(byDate.get(date) ?? { date, none: true })
  }
  return out
}

/** 行程第一天的預報哪一天會出現（預報只給得到今天起的十幾天）。 */
export function forecastOpens(w: Weather, start: string): string {
  return dayOf(dayMs(start) - Math.max(0, w.days.length - 1) * DAY_MS)
}

/** 這種天氣是不是降水（雨、雪、雨夾雪、雷雨）：是才在卡片上顯示降水機率。 */
export const isWet = (kind: WxKind): boolean => kind === 'rain' || kind === 'snow' || kind === 'mix' || kind === 'storm'

/** 降水機率取到 5%（61 → 60、88 → 90）：預報沒有準到個位數，顯示原始數字反而像很精確。 */
export const roundChance = (pct: number): number => Math.round(pct / 5) * 5
