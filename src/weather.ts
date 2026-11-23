// 目的地的天氣：向 Open-Meteo（免費、不用帳號）查現在的氣溫和未來十幾天的預報。
// 送出去的只有目的地城市的經緯度，沒有任何行程內容或個人資料。
// 查到的結果在這支手機上留一小時，沒網路時顯示上次查到的。

export type WxKind = 'clear' | 'partly' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm'

export interface WxDay { date: string; kind: WxKind; hi: number; lo: number; rain: number }
export interface Weather {
  /** 什麼時候查的。 */
  at: number
  now: { temp: number; kind: WxKind }
  days: WxDay[]
}

export const WX_NAME: Record<WxKind, string> = {
  clear: '晴', partly: '多雲時晴', cloudy: '陰', fog: '霧', rain: '雨', snow: '雪', storm: '雷雨',
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

const HOUR = 3_600_000
const keyOf = (airport: string) => `wx:${airport.toUpperCase()}`

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
    daily: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max?: (number | null)[] }
  }
  if (typeof j?.current?.temperature_2m !== 'number' || !Array.isArray(j?.daily?.time)) throw new Error('天氣資料格式不對')
  return {
    at,
    now: { temp: Math.round(j.current.temperature_2m), kind: kindOf(j.current.weather_code) },
    days: j.daily.time.map((date, i) => ({
      date,
      kind: kindOf(j.daily.weather_code[i]),
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
      + '&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max'
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

/**
 * 卡片上要列哪幾天：行程的日期落在預報範圍內就列行程那幾天（最多六天），否則列接下來五天。
 */
export function pickDays(w: Weather, start: string, end: string): WxDay[] {
  const trip = w.days.filter((d) => d.date >= start && d.date <= end)
  return trip.length > 0 ? trip.slice(0, 6) : w.days.slice(0, 5)
}
