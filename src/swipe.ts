// 左右滑切換分頁：判斷一次觸控算不算「橫向一滑」，以及滑了之後該去哪個分頁。

/** 至少要滑多遠（像素）、最慢多久滑完（毫秒）、橫向要比縱向大幾倍，才算橫向一滑。 */
const MIN_X = 70
const MAX_MS = 600
const RATIO = 2.2

/**
 * 這次觸控是往哪邊滑：-1 是手指往左（看下一頁）、1 是往右（看上一頁）、0 是不算
 * （滑得太短、太慢，或其實是在上下捲）。
 */
export function swipeDir(dx: number, dy: number, ms: number): -1 | 0 | 1 {
  if (ms > MAX_MS || Math.abs(dx) < MIN_X || Math.abs(dx) < Math.abs(dy) * RATIO) return 0
  return dx < 0 ? -1 : 1
}

/** 從目前的分頁往那邊滑會到哪個分頁；已經在頭或尾就是 null（不繞回去）。 */
export function swipeTarget(tabs: readonly string[], current: string, dir: -1 | 0 | 1): string | null {
  const i = tabs.indexOf(current)
  if (dir === 0 || i < 0) return null
  return tabs[i - dir] ?? null
}

/** 手指動了多少才決定這次是左右滑還是上下捲（像素）。 */
const DECIDE = 12

/**
 * 手指剛開始動的時候判斷意圖：'x' 是左右滑（整頁跟著手指走），'y' 是上下捲（這一次不再管），
 * 空字串是還動得不夠多，再等等。
 */
export function dragIntent(dx: number, dy: number): 'x' | 'y' | '' {
  if (Math.abs(dx) < DECIDE && Math.abs(dy) < DECIDE) return ''
  return Math.abs(dx) > Math.abs(dy) * 1.5 ? 'x' : 'y'
}

/**
 * 放開手指時算不算換頁：快速一滑算（同 swipeDir），或是慢慢拖但已經拖過畫面寬度的三分之一也算。
 */
export function swipeDone(dx: number, dy: number, ms: number, width: number): -1 | 0 | 1 {
  const quick = swipeDir(dx, dy, ms)
  if (quick) return quick
  if (width > 0 && Math.abs(dx) >= width / 3 && Math.abs(dx) >= Math.abs(dy) * RATIO) return dx < 0 ? -1 : 1
  return 0
}
