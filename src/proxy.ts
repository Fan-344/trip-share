// 代買轉分帳：購物清單裡「買到了、而且有幫別人買」的東西，整理成等著登錄的分帳草稿。
// 不會自己記進去——現場的價錢常跟事先填的不一樣，所以列出來讓買的人逐筆看過、改好再登錄。
import { parsePrice } from './money'
import { parseAmount } from './split'

/** 購物項目裡算代買需要的欄位（ShopItemView 的一部分）。 */
export interface BoughtItem {
  id: string
  name: string
  /** 單價，隨手寫的文字，例如「350 泰銖」。 */
  price?: string
  date: string
  /** 負責去買的人；沒指定就是開這一項的人。 */
  owner: string
  createdBy: string
  /** 買的人自己要幾個。 */
  qty: number
  /** 其他人各要幾個。 */
  wants: Record<string, number>
  bought: boolean
  /** 已經決定這項不用分帳。 */
  noSplit?: boolean
}

/** 一筆等著登錄的草稿，欄位跟分帳的一筆相同，多了它是從哪個購物項目來的。 */
export interface ProxyDraft {
  shopId: string
  title: string
  /** 單價乘總數；沒填價錢或看不懂就是 0，登錄時自己填。 */
  amount: number
  cur: string
  date: string
  payer: string
  sharers: string[]
  /** 每個人要幾個；大家都一樣多就是 null（平分）。 */
  shares: Record<string, number> | null
  /** 已經說這項不用分：還是列著（可能按錯、可能想改），只是不算待登錄。 */
  skipped: boolean
  /** 總共幾個、單價多少（給畫面說明用；單價看不懂是 0）。 */
  count: number
  unit: number
}

export const buyerOf = (i: BoughtItem): string => i.owner || i.createdBy

/** 這一項是不是代買：買到了、有買的人以外的人要。（說了「不用分」的也算，只是不計入待登錄。） */
export function isProxy(i: BoughtItem): boolean {
  const buyer = buyerOf(i)
  return i.bought && Object.entries(i.wants).some(([who, n]) => who !== buyer && n > 0)
}

/** 把一項代買變成分帳草稿。fallbackCur 是價錢沒寫幣別時用的，today 是購物沒排日期時用的。 */
export function draftOf(i: BoughtItem, fallbackCur: string, today: string): ProxyDraft {
  const buyer = buyerOf(i)
  const each: Record<string, number> = {}
  if (i.qty > 0) each[buyer] = i.qty
  for (const [who, n] of Object.entries(i.wants)) if (n > 0) each[who] = (each[who] ?? 0) + n
  const sharers = Object.keys(each)
  const count = sharers.reduce((s, who) => s + each[who], 0)
  const price = parsePrice(i.price, fallbackCur)
  const unit = parseAmount(price.amount)
  const same = sharers.every((who) => each[who] === each[sharers[0]])
  return {
    shopId: i.id, title: i.name, amount: Math.round(unit * count * 100) / 100, cur: price.currency,
    date: i.date || today, payer: buyer, sharers, shares: same ? null : each, skipped: !!i.noSplit, count, unit,
  }
}

/** 還沒登錄的代買：是代買、而且還沒有哪一筆分帳是從它來的。說了不用分的也在裡面，位置不動（按了不會跳走）。 */
export function pendingProxy<T extends BoughtItem>(items: T[], logged: { shopId?: string }[]): T[] {
  const done = new Set(logged.map((e) => e.shopId).filter(Boolean))
  return items.filter((i) => isProxy(i) && !done.has(i.id))
}
