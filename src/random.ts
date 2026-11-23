// 隨機數：給種子就會產生一串固定的亂數（同一個種子每次都一樣，方便測試），
// 不同的種子各自不同。用在進度條上的小人：走到哪、停多久，每個人、每次打開都不一樣。

/** 回傳一個函式，每呼叫一次給一個 0（含）到 1（不含）之間的數。演算法是 mulberry32。 */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** lo 到 hi 之間的一個隨機數。 */
export const between = (r: () => number, lo: number, hi: number): number => lo + r() * (hi - lo)

/** 把一段文字變成種子（同樣的文字得到同樣的種子）。 */
export function seedOf(text: string): number {
  let h = 2166136261
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return h >>> 0
}

/**
 * 小人下一步要走去哪：在 lo 到 hi 之間挑一個位置，而且離現在的位置至少 min 遠，
 * 才不會原地挪一小步就又停下來。範圍太小、挑不出夠遠的位置時，走到比較遠的那一端。
 */
export function nextSpot(r: () => number, here: number, lo: number, hi: number, min: number): number {
  for (let i = 0; i < 6; i++) {
    const to = between(r, lo, hi)
    if (Math.abs(to - here) >= min) return to
  }
  return here - lo > hi - here ? lo : hi
}
