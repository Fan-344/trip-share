// 小圖示：項目類別、每日標題、各主題的代表圖案。全部畫在 32×32 的格子裡。
// 畫法：沒有框線的色塊。每個圖示一個主色的大輪廓，加最多兩個別的顏色點出重點，
// 縮到很小也看得出是什麼；只有介面符號（叉叉、箭頭、加減、勾）是線條。
import type { JSX } from 'preact'
import type { ItemCat } from '../model/types'
import { C, Kangaroo } from './Art'

/** 介面符號用的線條。 */
const LINE = { fill: 'none', stroke: 'var(--ink)', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } as const
/** 圖案裡的線（提把、筷子、圖案上的留白線）。 */
const line = (stroke: string, width = 2.6) => ({ fill: 'none', stroke, 'stroke-width': width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }) as const

const SEA = '#6fa9bf'
const AQUA = '#6cc3bb'
const VIOLET = '#a892bd'
const BROWN = '#c48a66'
/** 圖案上的留白（窗、鏡頭、文字線）。 */
const PAPER = '#fff8ee'

const ICONS: Record<string, JSX.Element> = {
  // ---- 介面用的符號（按鈕上的鉛筆、鎖、叉叉等；全部自己畫，不用表情符號） ----
  pencil: (
    <g>
      <path fill={C.gold} d="M8 19L20.5 6.5l5 5L13 24z" />
      <path fill={C.trunk} d="M8 19l5 5l-7 2z" />
    </g>
  ),
  lock: (
    <g>
      <path {...line(C.goldD, 3.2)} d="M11 14v-4a5 5 0 0 1 10 0v4" />
      <rect x="6" y="13" width="20" height="15" rx="4" fill={C.gold} />
      <circle cx="16" cy="20.500" r="2.600" fill={C.trunk} />
    </g>
  ),
  unlock: (
    <g>
      <path {...line(C.leaf, 3.2)} d="M11 14v-4a5 5 0 0 1 9.600 -2" />
      <rect x="6" y="13" width="20" height="15" rx="4" fill={C.leafL} />
      <circle cx="16" cy="20.500" r="2.600" fill={PAPER} />
    </g>
  ),
  close: <path {...LINE} stroke-width="3" d="M9 9l14 14M23 9L9 23" />,
  chevron: <path {...LINE} stroke-width="3" d="M8 12l8 8l8 -8" />,
  back: <path {...LINE} stroke-width="3" d="M26 16H7M14 8l-8 8l8 8" />,
  plus: <path {...LINE} stroke-width="3" d="M16 7v18M7 16h18" />,
  minus: <path {...LINE} stroke-width="3" d="M7 16h18" />,
  check: <path {...LINE} stroke-width="3.200" d="M7 17l6 6L25 10" />,
  more: (
    <g fill="var(--ink)">
      <circle cx="7" cy="16" r="2.600" /><circle cx="16" cy="16" r="2.600" /><circle cx="25" cy="16" r="2.600" />
    </g>
  ),
  flower: (
    <g>
      <g fill={C.pink}>
        <circle cx="16" cy="9" r="5" /><circle cx="22.600" cy="13.800" r="5" /><circle cx="20.100" cy="21.600" r="5" />
        <circle cx="11.900" cy="21.600" r="5" /><circle cx="9.400" cy="13.800" r="5" />
      </g>
      <circle cx="16" cy="16" r="3.400" fill={C.gold} />
    </g>
  ),
  // ---- 分頁、標題、清單欄位用的小圖 ----
  calendar: (
    <g>
      <rect x="4" y="6" width="24" height="22" rx="4" fill={C.peach} />
      <path fill={C.coral} d="M4 13v-3a4 4 0 0 1 4 -4h16a4 4 0 0 1 4 4v3z" />
      <g fill={PAPER}><rect x="9" y="17" width="4" height="4" rx="1" /><rect x="19" y="17" width="4" height="4" rx="1" /><rect x="14" y="22" width="4" height="4" rx="1" /></g>
    </g>
  ),
  checklist: (
    <g>
      <rect x="5" y="5" width="22" height="23" rx="4" fill={SEA} />
      <rect x="11" y="2.500" width="10" height="6" rx="2.500" fill={C.gold} />
      <path {...line(PAPER)} d="M10 15.500l2.500 2.500l4 -5M10 23h12" />
    </g>
  ),
  passport: (
    <g>
      <rect x="7" y="3" width="18" height="26" rx="4" fill={VIOLET} />
      <circle cx="16" cy="13" r="5" fill={PAPER} />
      <path {...line(PAPER)} d="M12 23h8" />
    </g>
  ),
  ticket: (
    <g>
      <path fill={C.gold} d="M3 9h26v4.500a2.500 2.500 0 0 0 0 5V23H3v-4.500a2.500 2.500 0 0 0 0 -5z" />
      <path {...line(PAPER, 2.200)} stroke-dasharray="0.100 4" d="M20.500 11v10" />
      <path {...line(PAPER)} d="M8 13.500h7M8 18.500h4" />
    </g>
  ),
  coin: (
    <g>
      <circle cx="16" cy="16" r="12" fill={C.gold} />
      <path {...line(PAPER)} d="M16 9v14M19.500 12.500h-5a2 2 0 0 0 0 4h3a2 2 0 0 1 0 4h-5" />
    </g>
  ),
  shirt: <path fill={C.pink} d="M11 4l-8 6l3.500 5.500l3.500 -2.500v15h12V13l3.500 2.500L29 10l-8 -6q-5 4.500 -10 0z" />,
  pill: (
    <g transform="rotate(-40 16 16)">
      <rect x="3" y="10" width="26" height="12" rx="6" fill={C.peach} />
      <path fill={C.coral} d="M16 10h7a6 6 0 0 1 0 12h-7z" />
    </g>
  ),
  bear: (
    <g>
      <g fill={BROWN}><circle cx="8.500" cy="8.500" r="5" /><circle cx="23.500" cy="8.500" r="5" /><circle cx="16" cy="17" r="11" /></g>
      <ellipse cx="16" cy="21" rx="5" ry="4" fill={PAPER} />
      <g fill={C.trunk}><circle cx="11.500" cy="15" r="1.600" /><circle cx="20.500" cy="15" r="1.600" /><ellipse cx="16" cy="19.800" rx="1.800" ry="1.300" /></g>
    </g>
  ),
  bed: (
    <g>
      <path fill={C.trunk} d="M2.500 8h4v10h23v9h-4v-4h-19v4h-4z" />
      <rect x="8" y="12" width="9" height="6" rx="3" fill={C.peach} />
      <path fill={SEA} d="M18.500 13h7a4 4 0 0 1 4 4v1h-11z" />
    </g>
  ),
  heart: <path fill={C.coral} d="M16 28C5 20.500 3 15 3 11.500a6.500 6.500 0 0 1 13 -2a6.500 6.500 0 0 1 13 2c0 3.500 -2 9 -13 16.500z" />,
  people: (
    <g>
      <g fill={C.leaf}><circle cx="22.500" cy="11.500" r="4.200" /><path d="M15 27a7.500 7.500 0 0 1 15 0z" /></g>
      <g fill={C.gold}><circle cx="11" cy="10.500" r="5" /><path d="M2 27a9 9 0 0 1 18 0z" /></g>
    </g>
  ),
  note: (
    <g>
      <path fill={C.gold} d="M6 3h20v17l-8 9H6z" />
      <path fill={C.goldD} d="M18 29v-9h8z" />
      <path {...line(PAPER)} d="M11 10h10M11 15.500h10" />
    </g>
  ),
  // 留言：對話框，裡面三個點
  chat: (
    <g>
      <path fill={AQUA} d="M7 5h18a4 4 0 0 1 4 4v10a4 4 0 0 1 -4 4H15l-6.500 5v-5H7a4 4 0 0 1 -4 -4V9a4 4 0 0 1 4 -4z" />
      <circle cx="10.500" cy="14" r="1.800" fill={PAPER} /><circle cx="16" cy="14" r="1.800" fill={PAPER} /><circle cx="21.500" cy="14" r="1.800" fill={PAPER} />
    </g>
  ),
  bell: (
    <g>
      <path fill={C.gold} d="M14 5.500a2 2 0 0 1 4 0a8.500 8.500 0 0 1 6.500 8.500v7l2.500 4H5l2.500 -4v-7a8.500 8.500 0 0 1 6.500 -8.500z" />
      <path fill={C.trunk} d="M12.500 26.500h7a3.500 3.500 0 0 1 -7 0z" />
    </g>
  ),
  globe: (
    <g>
      <circle cx="16" cy="16" r="12" fill={AQUA} />
      <path fill={C.leaf} d="M8 8.500q4.500 -3.500 8 -1q1 3.500 -2.500 4.500q-1 3.500 -4.500 2q-3 -2.500 -1 -5.500zM18 15q4.500 -2 8 1q0 6 -4.500 8q-3.500 -1 -2.500 -4.500q-2 -2.500 -1 -4.500z" />
    </g>
  ),
  gift: (
    <g>
      <rect x="5" y="13" width="22" height="15" rx="3" fill={C.pink} />
      <rect x="3" y="9" width="26" height="6" rx="2" fill={C.coral} />
      <path fill={C.gold} d="M14 9h4v19h-4zM16 9q-7 -8 -9 -3.500q-1 3.500 9 3.500zM16 9q7 -8 9 -3.500q1 3.500 -9 3.500z" />
    </g>
  ),
  trash: (
    <g>
      <path fill={C.coral} d="M12 3.500h8v3.500h8v4H4V7h8zM7 12.500h18l-1.500 16h-15z" />
      <path {...line(PAPER, 2.200)} d="M13 16.500v7.500M19 16.500v7.500" />
    </g>
  ),
  // ---- 類別 ----
  plane: (
    <g transform="translate(16 16) rotate(-25)" fill={C.coral}>
      <path d="M-2 -2l-6 -10h4.500l8 10zM-2 2l-6 10h4.500l8 -10zM-12 -1.500l-3 -5h3l3.500 5z" />
      <ellipse rx="14" ry="3.800" />
    </g>
  ),
  car: (
    <g>
      <path fill={C.coral} d="M3 22v-7l3.500 -7h19L29 15v7z" />
      <path fill={PAPER} d="M9 10.500h5.500V15h-7.500zM17 10.500h5.500l2 4.500H17z" />
      <g fill={C.trunk}><circle cx="9.500" cy="23" r="3.600" /><circle cx="22.500" cy="23" r="3.600" /></g>
    </g>
  ),
  food: (
    <g>
      <path {...line(C.trunk)} d="M19.500 2.500l-4 11M26 4.500l-7.500 9" />
      <path fill={C.gold} d="M3 14h26a13 13 0 0 1 -26 0z" />
    </g>
  ),
  camera: (
    <g>
      <path fill={SEA} d="M10.500 9l2.500 -4.500h6l2.500 4.500H25a4 4 0 0 1 4 4v10a4 4 0 0 1 -4 4H7a4 4 0 0 1 -4 -4V13a4 4 0 0 1 4 -4z" />
      <circle cx="16" cy="18" r="6" fill={PAPER} /><circle cx="16" cy="18" r="3" fill={C.trunk} />
    </g>
  ),
  star: <path fill={C.gold} d="M16 3l3.800 8.200l8.700 1.100l-6.500 6.100l1.700 8.700L16 22.800l-7.700 4.300l1.700 -8.700l-6.500 -6.100l8.700 -1.100z" />,
  moon: (
    <g>
      <path fill={C.gold} d="M22 22a11 11 0 1 1 -9 -18a9 9 0 0 0 9 18z" />
      <path fill={VIOLET} d="M24 5l1.200 3l3 1.200l-3 1.200L24 13.400l-1.200 -3l-3 -1.200l3 -1.200z" />
    </g>
  ),
  bag: (
    <g>
      <path {...line(C.trunk, 3)} d="M10.500 12V9.500a5.500 5.500 0 0 1 11 0V12" />
      <path fill={C.pink} d="M6 11h20l2.500 17h-25z" />
    </g>
  ),
  house: (
    <g>
      <path fill={C.peach} d="M6 15h20v13H6z" />
      <path fill={C.coral} d="M2 17L16 4l14 13z" />
      <rect x="13" y="19.500" width="6" height="8.500" fill={C.coralD} />
    </g>
  ),
  luggage: (
    <g>
      <path {...line(C.trunk, 3)} d="M12 9.500V5h8v4.500" />
      <rect x="6.500" y="9" width="19" height="18" rx="4" fill={C.gold} />
      <path {...line(PAPER)} d="M12.500 13.500v9M19.500 13.500v9" />
      <g fill={C.trunk}><circle cx="11" cy="28.500" r="1.800" /><circle cx="21" cy="28.500" r="1.800" /></g>
    </g>
  ),
  // ---- 主題圖案 ----
  elephant: (
    <g>
      <g fill={VIOLET}><circle cx="15" cy="15.500" r="10" /><path d="M20 12q9 2 8 13q-1 4.500 -5.500 2.500q-1.500 -2.500 1 -3.500q1 -4.500 -5.500 -5.500z" /></g>
      <ellipse cx="8.500" cy="15" rx="5" ry="7" fill={C.pink} />
      <circle cx="18.500" cy="12.500" r="1.500" fill={C.trunk} />
    </g>
  ),
  chedi: (
    <g>
      <path fill={C.gold} d="M14.500 9.500L16 2l1.500 7.500q6.500 3.500 6.500 12.500H8q0 -9 6.500 -12.500z" />
      <rect x="5" y="22" width="22" height="6" rx="2" fill={C.goldD} />
    </g>
  ),
  lantern: (
    <g>
      <path fill={C.gold} d="M7 23Q3 6 16 3q13 3 9 20z" />
      <path fill={C.coral} d="M8 22.500h16l-2 5.500H10z" />
    </g>
  ),
  lotus: (
    <g>
      <path fill={C.pink} d="M16 27Q4 27 3 15q10 0 13 12zM16 27q12 0 13 -12q-10 0 -13 12z" />
      <path fill="#ee8fa3" d="M16 5q7 11 0 22q-7 -11 0 -22z" />
    </g>
  ),
  sakura: (
    <g>
      <g fill={C.pinkL}>
        <circle cx="16" cy="9" r="5" /><circle cx="22.600" cy="13.800" r="5" /><circle cx="20.100" cy="21.600" r="5" />
        <circle cx="11.900" cy="21.600" r="5" /><circle cx="9.400" cy="13.800" r="5" />
      </g>
      <circle cx="16" cy="16" r="3.400" fill={C.coral} />
    </g>
  ),
  torii: <path fill={C.coral} d="M3 6q13 -3.500 26 0v5q-13 -3 -26 0zM8 11h4v5h8v-5h4v18h-4V19.500h-8V29H8z" />,
  fuji: (
    <g>
      <path fill={VIOLET} d="M1 28L12.500 8q3.500 -2.500 7 0L31 28z" />
      <path fill={PAPER} d="M9.500 13.500l3 -5.500q3.500 -2.500 7 0l3 5.500l-3.300 -2l-3.200 3l-3.200 -3z" />
    </g>
  ),
  // 跟總覽主圖同一隻袋鼠，縮進格子裡
  kangaroo: <g transform="translate(19.500 31.500) scale(0.570)"><Kangaroo /></g>,
  sheep: (
    <g>
      <g fill="#6b5048"><rect x="10" y="22" width="2.400" height="6" rx="1" /><rect x="19" y="22" width="2.400" height="6" rx="1" /></g>
      <g fill="#e8ddd2"><circle cx="11" cy="16" r="6" /><circle cx="17" cy="13.500" r="7" /><circle cx="22" cy="17" r="5.500" /><circle cx="16" cy="19.500" r="5.500" /></g>
      <ellipse cx="26" cy="13.500" rx="3.500" ry="4.500" fill="#6b5048" />
    </g>
  ),
  palm: (
    <g>
      <path {...line(C.trunk, 3.400)} d="M16.500 29q2 -9 -1 -16" />
      <path fill={C.leaf} d="M15 13Q6 7 1 13q8 -1 14 0zM15 13q9 -7 15 -1q-8 -1 -15 1zM15 13Q11.500 3 5 3q6.500 2.500 10 10zM15 13q4.500 -10 11.500 -9q-7 2 -11.500 9z" />
    </g>
  ),
  wave: (
    <g>
      <path fill={AQUA} d="M2 18q4.500 -9 10 -3.500q3 3 6 -2q5.500 -8 12 1V29H2z" />
      <path {...line(PAPER)} d="M6 23q3.500 -3 7 0t7 0t6 0" />
    </g>
  ),
  // ---- 天氣 ----
  cloud: <path fill="#b9c6d2" d="M9 25a6.500 6.500 0 0 1 0.500 -13a8.500 8.500 0 0 1 16 2a5.500 5.500 0 0 1 -1 11z" />,
  partly: (
    <g>
      <circle cx="11" cy="11" r="6.500" fill={C.gold} />
      <path fill="#c9d4de" d="M11 27a5.500 5.500 0 0 1 0.500 -11a7.500 7.500 0 0 1 14 2a4.500 4.500 0 0 1 -1 9z" />
    </g>
  ),
  rain: (
    <g>
      <path fill="#b9c6d2" d="M9 20a6 6 0 0 1 0.500 -12a8 8 0 0 1 15 2a5 5 0 0 1 -1 10z" />
      <path {...line(SEA, 2.600)} d="M11 24l-1.500 4M17 24l-1.500 4M23 24l-1.500 4" />
    </g>
  ),
  storm: (
    <g>
      <path fill="#a9b6c6" d="M9 20a6 6 0 0 1 0.500 -12a8 8 0 0 1 15 2a5 5 0 0 1 -1 10z" />
      <path fill={C.gold} d="M17 17l-6 8h4l-2 6l7 -9h-4l2 -5z" />
    </g>
  ),
  snow: (
    <g>
      <path fill="#b9c6d2" d="M9 20a6 6 0 0 1 0.500 -12a8 8 0 0 1 15 2a5 5 0 0 1 -1 10z" />
      <g fill={SEA}><circle cx="10.500" cy="26" r="1.800" /><circle cx="16.500" cy="28" r="1.800" /><circle cx="22.500" cy="26" r="1.800" /></g>
    </g>
  ),
  // 雨夾雪：雲下面雨滴和雪粒交錯
  sleet: (
    <g>
      <path fill="#b9c6d2" d="M9 20a6 6 0 0 1 0.500 -12a8 8 0 0 1 15 2a5 5 0 0 1 -1 10z" />
      <path {...line(SEA, 2.600)} d="M11 24l-1.500 4M23 24l-1.500 4" />
      <circle cx="16.500" cy="27" r="1.800" fill={SEA} />
    </g>
  ),
  fog: <path {...line('#b9c6d2', 3.400)} d="M5 11h22M8 17h19M5 23h17" />,
  sun: (
    <g>
      <path {...line(C.gold, 3)} d="M16 2.500v3M16 26.500v3M2.500 16h3M26.500 16h3M6.500 6.500l2.100 2.100M23.400 23.400l2.100 2.100M25.500 6.500l-2.100 2.100M8.600 23.400l-2.100 2.100" />
      <circle cx="16" cy="16" r="7.500" fill={C.gold} />
    </g>
  ),
  building: (
    <g>
      <rect x="4" y="5" width="14" height="23" rx="2" fill={VIOLET} />
      <rect x="18" y="13" width="10" height="15" rx="2" fill={C.pink} />
      <g fill={PAPER}><rect x="7.500" y="9" width="3" height="4" /><rect x="12" y="9" width="3" height="4" /><rect x="7.500" y="16" width="3" height="4" /><rect x="12" y="16" width="3" height="4" /><rect x="21.500" y="17" width="3" height="4" /></g>
    </g>
  ),
  wheel: (
    <g>
      <path {...line(VIOLET, 2.800)} d="M16 14l-5.500 15M16 14l5.500 15" />
      <circle cx="16" cy="14" r="10" fill="none" stroke={VIOLET} stroke-width="2.800" />
      <g fill={C.coral}><circle cx="16" cy="4" r="3" /><circle cx="26" cy="14" r="3" /><circle cx="16" cy="24" r="3" /><circle cx="6" cy="14" r="3" /><circle cx="16" cy="14" r="3" /></g>
    </g>
  ),
  pin: (
    <g>
      <path fill={C.coral} d="M16 29.500c-7 -9 -10 -13 -10 -17.500a10 10 0 0 1 20 0c0 4.500 -3 8.500 -10 17.500z" />
      <circle cx="16" cy="12" r="3.800" fill={PAPER} />
    </g>
  ),
  compass: (
    <g>
      <circle cx="16" cy="16" r="12.500" fill={C.gold} /><circle cx="16" cy="16" r="9" fill={PAPER} />
      <path fill={C.coral} d="M16 8l3.500 8l-3.500 8l-3.500 -8z" />
    </g>
  ),
}

export type IconId = keyof typeof ICONS

export function Icon({ id, size = 24, cls = '' }: { id: string; size?: number; cls?: string }) {
  const body = ICONS[id]
  if (!body) return null
  return (
    <svg class={`icon ${cls}`} viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" fill="none" stroke-width="2.4">
      {body}
    </svg>
  )
}

/** 項目類別：名稱、圖示、底色。 */
export const CATS: { id: Exclude<ItemCat, ''>; name: string; icon: string; color: string }[] = [
  { id: 'flight', name: '飛機', icon: 'plane', color: 'var(--mizu-l)' },
  { id: 'transport', name: '交通', icon: 'car', color: 'var(--mizu-l)' },
  { id: 'food', name: '用餐', icon: 'food', color: 'var(--yellow-l)' },
  { id: 'sight', name: '景點', icon: 'camera', color: 'var(--green-l)' },
  { id: 'activity', name: '體驗', icon: 'star', color: 'var(--coral-l)' },
  { id: 'rest', name: '休息', icon: 'moon', color: 'var(--mizu-l)' },
  { id: 'shop', name: '購物', icon: 'bag', color: 'var(--coral-l)' },
  { id: 'stay', name: '住宿', icon: 'house', color: 'var(--green-l)' },
]

/** 清單或欄位叫這個名字時配什麼小圖（看關鍵字猜）；猜不到回傳空字串。 */
const NAME_ICONS: [RegExp, string][] = [
  [/護照|證件|簽證/, 'passport'], [/機票|航班|登機/, 'ticket'], [/錢|換匯|現金|卡|費/, 'coin'],
  [/衣|穿|鞋/, 'shirt'], [/藥|醫|急救/, 'pill'], [/小朋友|兒童|孩|寶寶|玩具/, 'bear'],
  [/飯店|住宿|旅館|民宿/, 'bed'], [/線上|申報|網路|上網/, 'globe'], [/行李|隨身|打包/, 'luggage'],
  [/買|購|伴手禮/, 'bag'], [/禮物/, 'gift'], [/吃|食|餐|零食/, 'food'], [/拍|相機|照/, 'camera'],
  [/出發|待辦|確認|準備/, 'checklist'], [/其他|雜/, 'star'],
]
export const iconForName = (name: string): string => NAME_ICONS.find(([re]) => re.test(name))?.[1] ?? ''

/** 清單可以選的圖示。 */
export const LIST_ICONS: string[] = [
  'checklist', 'luggage', 'passport', 'ticket', 'coin', 'shirt', 'pill', 'bear', 'bed', 'globe', 'bag', 'gift',
  'food', 'camera', 'heart', 'star', 'people', 'note', 'bell', 'calendar', 'house', 'plane', 'car', 'sun', 'flower',
]

export const catOf = (id: string | undefined) => CATS.find((c) => c.id === id)

/** 每日標題可以選的圖示：類別的加上所有主題圖案。 */
export const DAY_ICONS: string[] = [
  'luggage', 'plane', 'car', 'food', 'camera', 'star', 'moon', 'bag', 'house',
  'elephant', 'chedi', 'lantern', 'lotus', 'sakura', 'torii', 'fuji', 'kangaroo', 'sheep', 'palm', 'wave', 'sun',
  'building', 'wheel', 'pin', 'compass', 'heart', 'bear', 'bed', 'ticket', 'gift', 'calendar',
]
