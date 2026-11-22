// 小圖示：項目類別、每日標題、各主題的代表圖案。全部畫在 32×32 的格子裡，粗線平塗。
import type { JSX } from 'preact'
import type { ItemCat } from '../model/types'

const ICONS: Record<string, JSX.Element> = {
  // ---- 介面用的符號（按鈕上的鉛筆、鎖、叉叉等；全部自己畫，不用表情符號） ----
  pencil: (
    <g>
      <path fill="var(--yellow)" d="M7 25l1.500 -6.500L20.500 6.500l5 5L13.500 23.500z" />
      <path d="M17.500 9.500l5 5" />
      <path fill="var(--ink)" stroke-width="1.5" d="M7 25l1 -4.500l3.500 3.500z" />
    </g>
  ),
  lock: (
    <g>
      <path d="M11 14v-4a5 5 0 0 1 10 0v4" />
      <rect x="7" y="14" width="18" height="13" rx="3" fill="var(--yellow)" />
      <circle cx="16" cy="20.500" r="1.800" fill="var(--ink)" />
    </g>
  ),
  unlock: (
    <g>
      <path d="M11 14v-4a5 5 0 0 1 9.600 -2" />
      <rect x="7" y="14" width="18" height="13" rx="3" fill="var(--green-l)" />
      <circle cx="16" cy="20.500" r="1.800" fill="var(--ink)" />
    </g>
  ),
  close: <path stroke-width="3" d="M9 9l14 14M23 9L9 23" />,
  chevron: <path stroke-width="3" d="M8 12l8 8l8 -8" />,
  back: <path stroke-width="3" d="M26 16H7M14 8l-8 8l8 8" />,
  plus: <path stroke-width="3" d="M16 7v18M7 16h18" />,
  minus: <path stroke-width="3" d="M7 16h18" />,
  check: <path stroke-width="3.200" d="M7 17l6 6L25 10" />,
  more: (
    <g fill="var(--ink)" stroke="none">
      <circle cx="7" cy="16" r="2.600" /><circle cx="16" cy="16" r="2.600" /><circle cx="25" cy="16" r="2.600" />
    </g>
  ),
  flower: (
    <g fill="var(--coral-l)">
      <circle cx="16" cy="9.500" r="4.200" /><circle cx="22.200" cy="14" r="4.200" /><circle cx="19.800" cy="21.200" r="4.200" />
      <circle cx="12.200" cy="21.200" r="4.200" /><circle cx="9.800" cy="14" r="4.200" />
      <circle cx="16" cy="16" r="2.400" fill="var(--yellow)" />
    </g>
  ),
  // ---- 類別 ----
  plane: (
    <g transform="translate(16 16) rotate(-20)" fill="#fff">
      <path d="M-3 -2l-5 -8h4l7 8z" /><path d="M-3 2l-5 8h4l7 -8z" /><ellipse rx="12" ry="3.2" />
    </g>
  ),
  car: (
    <g>
      <path fill="var(--coral)" d="M4 21v-6l3 -6h18l3 6v6z" />
      <path fill="#fff" d="M9.5 10.5h5.5v4.5h-7zM17 10.5h5.5l1.5 4.5h-7z" />
      <circle cx="10" cy="22" r="3" fill="#fff" /><circle cx="22" cy="22" r="3" fill="#fff" />
    </g>
  ),
  food: (
    <g>
      <path d="M19 3l-4 11M25 5l-7 9" />
      <path fill="var(--yellow)" d="M4 15h24a12 12 0 0 1 -24 0z" />
    </g>
  ),
  camera: (
    <g>
      <path fill="var(--mizu)" d="M11 10l2 -4h6l2 4" />
      <rect x="4" y="10" width="24" height="16" rx="4" fill="var(--mizu)" />
      <circle cx="16" cy="18" r="5" fill="#fff" />
    </g>
  ),
  star: <path fill="var(--yellow)" d="M16 4l3.5 7.5l8 1l-6 5.6l1.6 8L16 22l-7.1 4.1l1.6 -8l-6 -5.6l8 -1z" />,
  moon: (
    <g>
      <path fill="var(--yellow-l)" d="M21 21a10 10 0 1 1 -8 -16a8 8 0 0 0 8 16z" />
      <path d="M21 6h6l-6 6h6" />
    </g>
  ),
  bag: (
    <g>
      <path d="M11 11v-2a5 5 0 0 1 10 0v2" />
      <path fill="var(--coral-l)" d="M7 11h18l2 16H5z" />
    </g>
  ),
  house: (
    <g>
      <path fill="var(--green-l)" d="M5 15l11 -9l11 9v12H5z" />
      <rect x="13" y="19" width="6" height="8" fill="#fff" />
    </g>
  ),
  luggage: (
    <g>
      <path d="M12 10v-4h8v4" />
      <rect x="8" y="10" width="16" height="16" rx="3" fill="var(--yellow)" />
      <path d="M13 13v10M19 13v10" />
      <circle cx="11" cy="28" r="1.4" fill="#fff" /><circle cx="21" cy="28" r="1.4" fill="#fff" />
    </g>
  ),
  // ---- 主題圖案 ----
  elephant: (
    <g fill="var(--mizu)">
      <circle cx="15" cy="16" r="9" />
      <path d="M20 13q8 2 7 12q-1 4 -5 2q-1 -2 1 -3q1 -4 -5 -5z" />
      <ellipse cx="9" cy="15" rx="4.5" ry="6.5" fill="var(--coral-l)" />
      <circle cx="18" cy="13" r="1.1" fill="var(--ink)" />
    </g>
  ),
  chedi: (
    <g fill="var(--yellow)">
      <path d="M16 3v5" /><path d="M10 22q6 -19 12 0z" /><rect x="7" y="22" width="18" height="5" rx="1.5" />
    </g>
  ),
  lantern: (
    <g>
      <path fill="var(--coral)" d="M9 7h14l-2.5 16h-9z" /><path d="M13 27h6" />
    </g>
  ),
  lotus: (
    <g fill="var(--coral-l)">
      <path d="M16 25q-11 0 -12 -10q9 0 12 10z" /><path d="M16 25q11 0 12 -10q-9 0 -12 10z" />
      <path d="M16 7q6 9 0 18q-6 -9 0 -18z" />
    </g>
  ),
  sakura: (
    <g fill="var(--coral-l)">
      <circle cx="16" cy="9" r="4.6" /><circle cx="22.6" cy="13.8" r="4.6" /><circle cx="20.1" cy="21.6" r="4.6" />
      <circle cx="11.9" cy="21.6" r="4.6" /><circle cx="9.4" cy="13.8" r="4.6" />
      <circle cx="16" cy="16" r="2.6" fill="var(--yellow)" />
    </g>
  ),
  torii: (
    <g fill="var(--coral)">
      <rect x="9" y="12" width="3.5" height="16" /><rect x="19.5" y="12" width="3.5" height="16" />
      <rect x="7" y="16" width="18" height="3" /><path d="M4 8q12 -3 24 0v4.5q-12 -2.5 -24 0z" />
    </g>
  ),
  fuji: (
    <g>
      <path fill="var(--mizu)" d="M3 27L13 9q3 -2 6 0L29 27z" />
      <path fill="#fff" d="M10.5 13.5L13 9q3 -2 6 0l2.5 4.5l-2.8 -1.6l-2.7 2.4l-2.7 -2.4z" />
    </g>
  ),
  palm: (
    <g fill="var(--green)">
      <path d="M16 28q2 -9 -1 -15" fill="none" stroke-width="3" />
      <path d="M15 13q-8 -5 -12 0q7 -1 12 0z" /><path d="M15 13q8 -6 13 -1q-7 -1 -13 1z" />
      <path d="M15 13q-3 -9 -9 -9q6 2 9 9z" /><path d="M15 13q4 -9 10 -8q-6 2 -10 8z" />
    </g>
  ),
  wave: <path fill="var(--mizu)" d="M3 19q4 -8 9 -3q3 3 6 -2q5 -7 11 1v10H3z" />,
  sun: (
    <g>
      <circle cx="16" cy="16" r="6" fill="var(--yellow)" />
      <path d="M16 4v3M16 25v3M4 16h3M25 16h3M7.5 7.5l2.1 2.1M22.4 22.4l2.1 2.1M24.5 7.5l-2.1 2.1M9.6 22.4l-2.1 2.1" />
    </g>
  ),
  building: (
    <g>
      <path d="M11 9v-5" />
      <rect x="5" y="9" width="12" height="18" fill="var(--mizu)" /><rect x="17" y="15" width="10" height="12" fill="var(--yellow)" />
      <path stroke-width="1.6" d="M8.5 13h2M12.5 13h2M8.5 17h2M12.5 17h2M8.5 21h2M12.5 21h2M20 19h1.5M23 19h1.5M20 23h1.5M23 23h1.5" />
    </g>
  ),
  wheel: (
    <g>
      <path d="M16 14l-5 14M16 14l5 14" />
      <circle cx="16" cy="14" r="10" fill="#fff" />
      <path stroke-width="1.6" d="M6 14h20M16 4v20M9 7l14 14M23 7L9 21" />
      <circle cx="16" cy="14" r="2.4" fill="var(--coral)" />
    </g>
  ),
  pin: (
    <g>
      <path fill="var(--coral)" d="M16 28c-6 -8 -9 -12 -9 -16.5a9 9 0 0 1 18 0c0 4.500 -3 8.500 -9 16.500z" />
      <circle cx="16" cy="11.500" r="3" fill="#fff" />
    </g>
  ),
  compass: (
    <g>
      <circle cx="16" cy="16" r="11" fill="#fff" />
      <path fill="var(--coral)" d="M16 8l3 8l-3 8l-3 -8z" />
    </g>
  ),
}

export type IconId = keyof typeof ICONS

export function Icon({ id, size = 24, cls = '' }: { id: string; size?: number; cls?: string }) {
  const body = ICONS[id]
  if (!body) return null
  return (
    <svg class={`icon ${cls}`} viewBox="0 0 32 32" width={size} height={size} aria-hidden="true"
      fill="none" stroke="var(--ink)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">
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

export const catOf = (id: string | undefined) => CATS.find((c) => c.id === id)

/** 每日標題可以選的圖示：類別的加上所有主題圖案。 */
export const DAY_ICONS: string[] = [
  'luggage', 'plane', 'car', 'food', 'camera', 'star', 'moon', 'bag', 'house',
  'elephant', 'chedi', 'lantern', 'lotus', 'sakura', 'torii', 'fuji', 'palm', 'wave', 'sun',
  'building', 'wheel', 'pin', 'compass',
]
