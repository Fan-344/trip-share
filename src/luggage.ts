// 行李重量帳本：每個人填自己現在的行李幾公斤，對照航班的託運額度，
// 算出每個人還剩多少、全團合起來還剩多少，以及超重的人可以把多少分給誰。
// 只管託運行李；額度是航班上填的「幾件 × 每件幾公斤」，每個人都一樣。
import type { Flight } from './model/types'
import { toInstant } from './time'

/** 這班飛機每個人可以託運幾公斤；沒填額度是 0。只填了公斤數就當成一件。 */
export function allowanceOf(f: Pick<Flight, 'bags' | 'bagKg'>): number {
  const kg = f.bagKg && f.bagKg > 0 ? f.bagKg : 0
  const bags = f.bags && f.bags > 0 ? f.bags : 1
  return Math.round(kg * bags * 10) / 10
}

/**
 * 現在該看哪一班的額度：還沒起飛、有填額度的最近一班（出發前是去程，玩到一半就是回程）；
 * 都飛完了就看最後一班。沒有任何一班填額度是 undefined。
 */
export function pickLeg<F extends Pick<Flight, 'dep' | 'bags' | 'bagKg'>>(flights: F[], now: number): F | undefined {
  const legs = flights.filter((f) => allowanceOf(f) > 0).sort((a, b) => toInstant(a.dep) - toInstant(b.dep))
  return legs.find((f) => toInstant(f.dep) >= now) ?? legs[legs.length - 1]
}

/** 自己按的行李狀態，只是貼在那一列上的標籤，不影響任何計算：full 是「我的行李滿了」，help 是「救救我」。 */
export type LuggageState = '' | 'full' | 'help'
export interface Person { id: string; name: string; /** 現在的行李幾公斤；還沒填是 0。 */ kg: number }
export interface Row extends Person {
  filled: boolean
  /** 離自己的額度還差多少；負的是超過。還沒填的話是整個額度。 */
  left: number
}
export interface Move { from: string; to: string; kg: number }
export interface Ledger {
  each: number
  rows: Row[]
  /** 全團的額度、已經用掉的、還剩的（負的是全團合起來也超重）。 */
  total: number
  used: number
  left: number
  /** 還沒填的人數。 */
  blank: number
  /** 超過自己額度的人，可以把多少公斤分給誰（只分給已經填了、還有空位的人）。 */
  moves: Move[]
}

const round1 = (n: number) => Math.round(n * 10) / 10

export function ledger(people: Person[], each: number): Ledger {
  const rows: Row[] = people.map((p) => ({ ...p, filled: p.kg > 0, left: round1(each - p.kg) }))
  const used = round1(rows.reduce((s, r) => s + r.kg, 0))
  const total = round1(each * rows.length)

  // 從超過最多的人開始，把多出來的分給空位最多的人
  const room = rows.filter((r) => r.filled && r.left > 0).map((r) => ({ id: r.id, left: r.left }))
  const moves: Move[] = []
  for (const over of rows.filter((r) => r.left < 0).sort((a, b) => a.left - b.left)) {
    let need = -over.left
    for (const to of room.sort((a, b) => b.left - a.left)) {
      if (need <= 0) break
      const kg = round1(Math.min(need, to.left))
      if (kg <= 0) continue
      moves.push({ from: over.id, to: to.id, kg })
      to.left = round1(to.left - kg)
      need = round1(need - kg)
    }
  }
  return { each, rows, total, used, left: round1(total - used), blank: rows.filter((r) => !r.filled).length, moves }
}

/** 進度條在額度後面預留多少長度給「超過的部分」（額度的幾成）。 */
const RESERVE = 0.25

/**
 * 進度條怎麼畫（都是佔整列寬度的百分比）。代表額度的軌道比整列短，長度是 limit，右邊留一截空白；
 * 沒超過時 limit 是固定的，用掉多少就在軌道裡填多少。
 * ok 是沒超過的那一段；over 是超過額度的那一段，接在 limit 後面，突破軌道伸進預留的空白（畫成紅色）。
 * 超過得比預留的還多時，軌道縮短到剛好讓超出的那段裝得下。
 */
export function barParts(kg: number, each: number): { ok: number; over: number; limit: number } {
  if (each <= 0) return { ok: 0, over: 0, limit: 100 }
  const max = Math.max(each * (1 + RESERVE), kg)
  const pct = (n: number) => Math.round((n / max) * 1000) / 10
  return { ok: pct(Math.min(Math.max(kg, 0), each)), over: pct(Math.max(kg - each, 0)), limit: pct(each) }
}
