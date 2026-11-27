// 分帳：一筆花費怎麼分、每個人淨額多少、誰該給誰多少。只有計算，不碰畫面與資料表。
//
// 規則：
// - 一筆花費由付錢的人先付，分擔者平分；有填份數的照份數分（合菜這種照人頭的）。
// - 還款也是一筆紀錄（settle）：付錢的人把錢給了分擔者，用來把欠的抵掉。
// - 各幣別分開算；外幣都填了匯率，才換成本國幣合在一起結。

/** 算帳需要的欄位（資料表裡的 Expense 多了品項、日期）。 */
export interface Bill {
  amount: number
  cur: string
  /** 先付錢的人。 */
  payer: string
  /** 分擔的人。 */
  sharers: string[]
  /** 不平分時每個人幾份；沒有這個欄位就是平分。 */
  shares?: Record<string, number> | null
}

export interface Transfer { from: string; to: string; amount: number; cur: string }

/** 結帳的幣別沒指定時用這個。外幣的匯率是「1 單位外幣等於多少結帳幣別」。下面的函式都可以另外指定結帳幣別（home）。 */
export const HOME = '台幣'

/** 會用到小數的幣別；其他的結算到整數。 */
const CENTS = new Set(['美元', '加幣', '歐元', '英鎊', '澳幣', '紐幣', '新加坡幣', '馬幣'])
export const digitsOf = (cur: string): number => (CENTS.has(cur) ? 2 : 0)

const round = (n: number, digits: number) => {
  const k = 10 ** digits
  return Math.round(n * k) / k
}

/** 金額顯示：千分位，小數最多兩位、尾巴的 0 不顯示。 */
export const money = (n: number): string => n.toLocaleString('en-US', { maximumFractionDigits: 2 })

/** 輸入框裡的字變成金額；不是正的數字就是 0。 */
export function parseAmount(text: string): number {
  const n = Number(text.replace(/[,\s，]/g, ''))
  return Number.isFinite(n) && n > 0 ? round(n, 2) : 0
}

/**
 * 這筆每個分擔者各出多少。算到分（小數兩位），除不盡的零頭一分一分補給前面的人，加起來一定等於總額。
 * 沒有分擔者，或份數全是 0，回傳空的。
 */
export function portions(b: Bill): Record<string, number> {
  const ids = [...new Set(b.sharers)]
  const weight = (id: string) => (b.shares ? Math.max(0, b.shares[id] ?? 0) : 1)
  const total = ids.reduce((s, id) => s + weight(id), 0)
  if (total <= 0) return {}
  const cents = Math.round(b.amount * 100)
  const out: Record<string, number> = {}
  let used = 0
  for (const id of ids) {
    out[id] = Math.floor((cents * weight(id)) / total)
    used += out[id]
  }
  for (const id of ids) {
    if (used >= cents) break
    if (weight(id) <= 0) continue
    out[id] += 1
    used += 1
  }
  for (const id of ids) out[id] /= 100
  return out
}

/** 每個人在每個幣別的淨額：正的是別人該給他，負的是他該給別人。 */
export function balances(bills: Bill[]): Record<string, Record<string, number>> {
  const net: Record<string, Record<string, number>> = {}
  const add = (cur: string, id: string, n: number) => {
    const row = (net[cur] ??= {})
    row[id] = round((row[id] ?? 0) + n, 2)
  }
  for (const b of bills) {
    const parts = portions(b)
    // 分不出去的（沒有分擔者）不算，免得憑空多出一筆別人欠的錢
    if (Object.keys(parts).length === 0) continue
    add(b.cur, b.payer, b.amount)
    for (const [id, n] of Object.entries(parts)) add(b.cur, id, -n)
  }
  return net
}

/** 外幣是不是都填了匯率（可以合成本國幣一起結）。 */
export function canMerge(curs: string[], rates: Record<string, number>, home = HOME): boolean {
  return curs.every((c) => c === home || rates[c] > 0)
}

/** 把各幣別的淨額換成本國幣合在一起。 */
export function merge(net: Record<string, Record<string, number>>, rates: Record<string, number>, home = HOME): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [cur, row] of Object.entries(net)) {
    const rate = cur === home ? 1 : rates[cur] ?? 0
    for (const [id, n] of Object.entries(row)) out[id] = (out[id] ?? 0) + n * rate
  }
  return out
}

/**
 * 誰給誰多少，次數盡量少：每次讓欠最多的人付給該收最多的人。
 * 金額照幣別取整數（或到分）；取整數後不到 1 單位的零頭不列。
 */
export function transfers(net: Record<string, number>, cur: string): Transfer[] {
  const digits = digitsOf(cur)
  const owe = Object.entries(net).filter(([, n]) => n < 0).map(([id, n]) => ({ id, left: -n }))
  const get = Object.entries(net).filter(([, n]) => n > 0).map(([id, n]) => ({ id, left: n }))
  const out: Transfer[] = []
  const tiny = 0.5 / 10 ** digits
  for (;;) {
    owe.sort((a, b) => b.left - a.left || a.id.localeCompare(b.id))
    get.sort((a, b) => b.left - a.left || a.id.localeCompare(b.id))
    const from = owe[0]
    const to = get[0]
    if (!from || !to || from.left < tiny || to.left < tiny) break
    const amount = round(Math.min(from.left, to.left), digits)
    if (amount <= 0) break
    out.push({ from: from.id, to: to.id, amount, cur })
    from.left -= amount
    to.left -= amount
  }
  return out
}

export interface Settlement {
  /** 是不是合成本國幣結的。 */
  merged: boolean
  /** 用到的外幣（要填匯率的那些）。 */
  foreign: string[]
  transfers: Transfer[]
  /** 每個人的淨額；合併時只有本國幣一個幣別。 */
  net: Record<string, Record<string, number>>
}

/** 整份結算：外幣都有匯率就合成本國幣，否則各幣別分開結。 */
export function settle(bills: Bill[], rates: Record<string, number>, home = HOME): Settlement {
  const raw = balances(bills)
  const curs = Object.keys(raw)
  const foreign = curs.filter((c) => c !== home)
  const merged = foreign.length > 0 && canMerge(curs, rates, home)
  const net = merged ? { [home]: merge(raw, rates, home) } : raw
  const order = Object.keys(net).sort((a, b) => (a === home ? -1 : b === home ? 1 : a.localeCompare(b)))
  return { merged, foreign, net, transfers: order.flatMap((cur) => transfers(net[cur], cur)) }
}

/** 一個人在一個幣別的帳：先付了多少、該出多少、已經還給別人多少、已經收到別人還多少。 */
export interface Tally { paid: number; owed: number; sent: number; got: number }

/** 還差多少：正的是別人還該給他，負的是他還該給別人。 */
export const leftOf = (t: Tally): number => round(t.paid - t.owed + t.sent - t.got, 2)

/** 每個人在每個幣別的明細（給「全部明細」看）。還款另外算，不混進先付與該出。 */
export function tallies(bills: (Bill & { settle?: boolean })[]): Record<string, Record<string, Tally>> {
  const out: Record<string, Record<string, Tally>> = {}
  const add = (cur: string, id: string, key: keyof Tally, n: number) => {
    const row = ((out[cur] ??= {})[id] ??= { paid: 0, owed: 0, sent: 0, got: 0 })
    row[key] = round(row[key] + n, 2)
  }
  for (const b of bills) {
    const parts = portions(b)
    if (Object.keys(parts).length === 0) continue
    add(b.cur, b.payer, b.settle ? 'sent' : 'paid', b.amount)
    for (const [id, n] of Object.entries(parts)) add(b.cur, id, b.settle ? 'got' : 'owed', n)
  }
  return out
}

/**
 * 把各幣別的明細換成同一種幣別加在一起（「全部明細」一次只看一種幣別）。
 * 匯率是「1 外幣等於多少本國幣」；有幣別缺匯率就換不了，回傳 null。
 */
export function tallyIn(detail: Record<string, Record<string, Tally>>, rates: Record<string, number>, to: string, home = HOME): Record<string, Tally> | null {
  const rateOf = (cur: string) => (cur === home ? 1 : rates[cur] ?? 0)
  if (!(rateOf(to) > 0) || Object.keys(detail).some((cur) => !(rateOf(cur) > 0))) return null
  const out: Record<string, Tally> = {}
  for (const [cur, rows] of Object.entries(detail)) {
    const k = rateOf(cur) / rateOf(to)
    for (const [id, row] of Object.entries(rows)) {
      const sum = (out[id] ??= { paid: 0, owed: 0, sent: 0, got: 0 })
      for (const key of ['paid', 'owed', 'sent', 'got'] as const) sum[key] += row[key] * k
    }
  }
  const digits = digitsOf(to)
  for (const row of Object.values(out)) for (const key of ['paid', 'owed', 'sent', 'got'] as const) row[key] = round(row[key], digits)
  return out
}

/** 一個金額從一種幣別換成另一種；缺匯率回傳 null。 */
export function convert(amount: number, from: string, to: string, rates: Record<string, number>, home = HOME): number | null {
  const rateOf = (cur: string) => (cur === home ? 1 : rates[cur] ?? 0)
  if (!(rateOf(from) > 0) || !(rateOf(to) > 0)) return null
  return round((amount * rateOf(from)) / rateOf(to), digitsOf(to))
}
