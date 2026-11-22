// 佈景主題：每份行程一個，跟著行程同步，全家人看到同一個樣子。
// 沒有手動選的時候，依去程航班的目的地自動決定。
import type { Flight } from './model/types'

export type ThemeId = 'general' | 'thai' | 'japan' | 'island' | 'city'

export interface Theme {
  id: ThemeId
  name: string
  hint: string
  /** 選單上色點用的重點色；整套配色定義在 src/ui/styles.css 的 [data-theme]，兩邊要一致。 */
  accent: string
  /** 這個主題的代表圖案（src/ui/Icons.tsx 的代號）：每日標題的預設圖示、空白畫面、頁尾都從這裡拿。 */
  motifs: string[]
  /** 頁尾的一句話。 */
  farewell: string
}

export const THEMES: Theme[] = [
  { id: 'general', name: '出發', hint: '飛機與山丘', accent: '#b9daa5', motifs: ['compass', 'pin', 'sun', 'camera'], farewell: '一路順風' },
  { id: 'thai', name: '泰北山城', hint: '佛塔與大象', accent: '#f6d27a', motifs: ['elephant', 'chedi', 'lantern', 'lotus'], farewell: '一路順風，薩瓦迪卡' },
  { id: 'japan', name: '日本', hint: '富士山與鳥居', accent: '#f2a497', motifs: ['sakura', 'torii', 'fuji', 'lantern'], farewell: '一路順風，いってらっしゃい' },
  { id: 'island', name: '海島', hint: '椰子樹與帆船', accent: '#a8d3e6', motifs: ['palm', 'wave', 'sun', 'star'], farewell: '一路順風，記得擦防曬' },
  { id: 'city', name: '城市', hint: '高樓與摩天輪', accent: '#c9c3e6', motifs: ['building', 'wheel', 'camera', 'bag'], farewell: '一路順風，玩得開心' },
]

export const themeOf = (id: ThemeId): Theme => THEMES.find((t) => t.id === id)!

/**
 * 某一天沒有自己選圖示時用哪個：第一天是行李、最後一天是飛機，中間幾天輪流用主題圖案。
 * index 是這天在行程裡的第幾天（從 0 算），不在行程範圍內是 -1。
 */
export function defaultDayIcon(theme: ThemeId, index: number, total: number): string {
  if (index === 0) return 'luggage'
  if (index === total - 1 && total > 1) return 'plane'
  const motifs = themeOf(theme).motifs
  return motifs[(Math.max(index, 1) - 1) % motifs.length]
}

const BY_AIRPORT: Record<string, ThemeId> = {
  CNX: 'thai', BKK: 'thai', DMK: 'thai',
  NRT: 'japan', HND: 'japan', KIX: 'japan', NGO: 'japan', FUK: 'japan', CTS: 'japan',
  HKT: 'island', OKA: 'island', CEB: 'island', DPS: 'island', CJU: 'island', DAD: 'island',
  HKG: 'city', MFM: 'city', SIN: 'city', KUL: 'city', ICN: 'city', GMP: 'city', PUS: 'city',
  PVG: 'city', PEK: 'city', LAX: 'city', SFO: 'city', SEA: 'city', JFK: 'city', YVR: 'city',
  LHR: 'city', CDG: 'city', FRA: 'city', SYD: 'city', MEL: 'city', MNL: 'city', SGN: 'city', HAN: 'city',
}

const isTheme = (v: unknown): v is ThemeId => THEMES.some((t) => t.id === v)

/** 依去程（最早起飛的那班）的目的地猜主題；沒有航班或不認得的機場就用通用的。 */
export function autoTheme(flights: Flight[]): ThemeId {
  const first = [...flights].sort((a, b) => a.dep.local.localeCompare(b.dep.local))[0]
  return (first && BY_AIRPORT[first.to.toUpperCase()]) || 'general'
}

/** 這份行程現在該用哪個主題。chosen 是行程裡存的值；空的或不認得（例如新版才有的主題）就自動決定。 */
export function resolveTheme(chosen: unknown, flights: Flight[]): ThemeId {
  return isTheme(chosen) ? chosen : autoTheme(flights)
}

export const themeName = (id: unknown): string => THEMES.find((t) => t.id === id)?.name ?? '自動'
