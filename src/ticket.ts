// 機票辨識（規格書第 9 節）：從確認信、電子機票的文字，或登機證條碼裡找出航班資料。
// 這裡只做「猜」，找到的東西一律交給使用者在表單上確認才存。
import { AIRPORTS, toInstant } from './time'

/** 從機票上讀到的一班飛機。讀不到的欄位留空字串，由使用者補。 */
export interface TicketFlight {
  code: string
  from: string
  to: string
  /** 'YYYY-MM-DD' */
  depDate: string
  /** 'HH:MM' */
  depTime: string
  arrDate: string
  arrTime: string
  cabin: string
  /** 訂位代號：只會存在這支手機上。 */
  pnr: string
}

export interface TicketHint {
  /** 行程出發日：機票上沒寫年份時，挑離這天最近的那一年。 */
  near: string
}

const blank = (): TicketFlight => ({ code: '', from: '', to: '', depDate: '', depTime: '', arrDate: '', arrTime: '', cabin: '', pnr: '' })

/** 這班還缺哪些必填欄位（給畫面提示用）。 */
export function missingFields(f: TicketFlight): string[] {
  const out: string[] = []
  if (!f.code) out.push('航班代號')
  if (!f.from || !f.to) out.push('機場')
  if (!f.depDate) out.push('日期')
  if (!f.depTime || !f.arrTime) out.push('時間')
  return out
}

// ── 文字 ──────────────────────────────────────────────

/** 常見航空公司的兩碼代號。只認這些，才不會把「NT 5000」「PM 0710」當成航班。 */
const AIRLINES = new Set((
  'JX CI BR IT AE B7 MM TR TG FD SL WE PG DD VZ TW ' +
  'JL NH GK NQ BC 7C LJ ZE KE OZ BX RS CX HX UO HB NX SQ TZ MH AK D7 OD ' +
  'PR 5J Z2 VN VJ QH GA QG ID CA MU CZ HU ZH MF 3U HO 9C FM ' +
  'UA AA DL AS AC WS HA B6 WN BA VS AF KL LH LX OS AY SK IB AZ TK EK QR EY ' +
  'QF JQ NZ VA AI 6E UL KQ ET SA LA AM CM'
).split(' '))

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
/** 三個大寫字母但不是機場的常見字。 */
const NOT_AIRPORT = new Set([
  ...MONTHS, 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN', 'TWD', 'USD', 'THB', 'JPY', 'KRW', 'HKD', 'EUR',
  'PNR', 'ETA', 'ETD', 'THE', 'AND', 'FOR', 'YOU', 'NOT', 'TAX', 'FEE', 'MRS', 'MSS', 'INF', 'CHD', 'ADT', 'PDF',
  'GMT', 'UTC', 'VIA', 'SEQ', 'BAG', 'KGS', 'PCS', 'NON', 'ALL', 'NEW', 'PAX', 'REF', 'FLT', 'DEP', 'ARR', 'STD', 'STA',
])

const CABINS: [RegExp, string][] = [
  [/豪華經濟|PREMIUM\s*ECONOMY/i, '豪華經濟艙'],
  [/商務|BUSINESS/i, '商務艙'],
  [/頭等|FIRST\s*CLASS/i, '頭等艙'],
  [/經濟|ECONOMY/i, '經濟艙'],
]

interface Found<T> { at: number; end: number; value: T }

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`
const validDay = (m: number, d: number) => m >= 1 && m <= 12 && d >= 1 && d <= 31

function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86_400_000
}

function addDays(date: string, n: number): string {
  const t = new Date((dayNumber(date) + n) * 86_400_000)
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate())
}

/** 沒寫年份的日期：前後三年裡挑離行程最近的。 */
function guessYear(m: number, d: number, near: string): number {
  const base = Number(near.slice(0, 4)) || new Date().getFullYear()
  let best = base
  for (const y of [base - 1, base, base + 1]) {
    if (Math.abs(dayNumber(ymd(y, m, d)) - dayNumber(near || ymd(base, 1, 1))) < Math.abs(dayNumber(ymd(best, m, d)) - dayNumber(near || ymd(base, 1, 1)))) best = y
  }
  return best
}

function findDates(text: string, near: string): Found<string>[] {
  const out: Found<string>[] = []
  const add = (m: RegExpExecArray, y: number | null, mo: number, d: number) => {
    if (!validDay(mo, d)) return
    const at = m.index
    const end = at + m[0].length
    if (out.some((o) => at < o.end && end > o.at)) return // 前面的規則已經認走這一段
    // 年份被擠到下一行（窄畫面折行、兩欄混在一起）：往後看到下一行結尾為止
    const next = y ?? Number(/(?<!\d)(20\d{2})(?![\d:/-])/.exec(text.slice(end).split('\n').slice(0, 2).join('\n').slice(0, 60))?.[1]) ?? 0
    out.push({ at, end, value: ymd(next || guessYear(mo, d, near), mo, d) })
  }
  const year = (s: string | undefined) => (s ? (s.length === 2 ? 2000 + Number(s) : Number(s)) : null)
  const mon = MONTHS.join('|')
  let m: RegExpExecArray | null
  // 2027-03-05、2027/3/5、2027年3月5日
  for (const re = /(20\d{2})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/g; (m = re.exec(text));) add(m, Number(m[1]), Number(m[2]), Number(m[3]))
  // 5 Mar 2027、05MAR27、05 March
  for (const re = new RegExp(`(?<!\\d)(\\d{1,2})\\s*[-/ ]?\\s*(${mon})[A-Z]*\\.?,?\\s*[-/ ]?\\s*(20\\d{2}|\\d{2})?(?![:\\d])`, 'gi'); (m = re.exec(text));) {
    add(m, year(m[3]), MONTHS.indexOf(m[2].toUpperCase()) + 1, Number(m[1]))
  }
  // Mar 5, 2027
  for (const re = new RegExp(`\\b(${mon})[A-Z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?![:\\d])(?:,?\\s*(20\\d{2}))?`, 'gi'); (m = re.exec(text));) {
    add(m, year(m[3]), MONTHS.indexOf(m[1].toUpperCase()) + 1, Number(m[2]))
  }
  // 3月5日
  for (const re = /(\d{1,2})\s*月\s*(\d{1,2})\s*日?/g; (m = re.exec(text));) add(m, null, Number(m[1]), Number(m[2]))
  // 03/05（月/日）：最不確定，放最後
  for (const re = /(?<![\d/:.])(\d{1,2})\/(\d{1,2})(?![\d/:.])/g; (m = re.exec(text));) add(m, null, Number(m[1]), Number(m[2]))
  return out.sort((a, b) => a.at - b.at)
}

function findTimes(text: string): Found<string>[] {
  const out: Found<string>[] = []
  const re = /(上午|下午|AM|PM)?\s*(?<![\d:])([01]?\d|2[0-3])\s*[:：]\s*([0-5]\d)(?![\d:])\s*(AM|PM|A\.M\.|P\.M\.)?/gi
  for (let m: RegExpExecArray | null; (m = re.exec(text));) {
    let h = Number(m[2])
    const half = (m[1] ?? m[4] ?? '').toUpperCase().replace(/\./g, '')
    if ((half === 'PM' || half === '下午') && h < 12) h += 12
    if (half === 'AM' && h === 12) h = 0
    out.push({ at: m.index, end: m.index + m[0].length, value: `${pad(h)}:${m[3]}` })
  }
  return out
}

function findAirports(text: string): Found<string>[] {
  const all: Found<string>[] = []
  const re = /(?<![A-Za-z0-9])[A-Z]{3}(?![A-Za-z0-9])/g
  for (let m: RegExpExecArray | null; (m = re.exec(text));) {
    if (!NOT_AIRPORT.has(m[0])) all.push({ at: m.index, end: m.index + 3, value: m[0] })
  }
  const known = all.filter((a) => AIRPORTS[a.value])
  if (known.length >= 2) return known
  // 表裡沒有的機場：只在長得像「AAA - BBB」或「(AAA)」時才認
  const shaped = all.filter((a) => {
    const before = text.slice(Math.max(0, a.at - 4), a.at)
    const after = text.slice(a.end, a.end + 4)
    return /[(（]\s*$/.test(before) && /^\s*[)）]/.test(after) || /^\s*(-|–|—|→|>|至|飛)/.test(after) || /(-|–|—|→|>|至|飛)\s*$/.test(before)
  })
  const picked = [...known, ...shaped.filter((s) => !known.includes(s))].sort((a, b) => a.at - b.at)
  if (new Set(picked.map((p) => p.value)).size >= 2) return picked
  // 還是湊不到兩個：單獨出現的三個大寫字母也算（小機場不在表裡，例如截圖上大大的「SHI」）
  return all
}

/** 航班號碼前面補的零拿掉：JX0309 就是 JX309。 */
const flightCode = (airline: string, number: string) => airline + number.replace(/^0+(?=\d)/, '')

function findCodes(text: string): Found<string>[] {
  const out: Found<string>[] = []
  const re = /(?<![A-Za-z0-9])([A-Z][A-Z0-9]|[0-9][A-Z])\s?-?(\d{2,4})(?![0-9A-Za-z:/.年月])/g
  for (let m: RegExpExecArray | null; (m = re.exec(text));) {
    if (AIRLINES.has(m[1])) out.push({ at: m.index, end: m.index + m[0].length, value: flightCode(m[1], m[2]) })
  }
  return out
}

/** 文字辨識常搞混的字：同一組裡的字當成同一個。 */
const LOOKALIKE = ['1IJLT|!', '0ODQ', '5S', '8B', '2Z', '6G', 'VY', 'UV']
const sameGlyph = (a: string, b: string) => a === b || LOOKALIKE.some((g) => g.includes(a) && g.includes(b))

/**
 * 找不到航班代號時再找一次，容許辨識錯字：像「1x0309」其實是「JX0309」。
 * 只在前兩個字換成相近的字之後是認得的航空公司才算；有好幾家都像就取表裡排前面的。
 */
function findLooseCodes(text: string): Found<string>[] {
  const out: Found<string>[] = []
  const re = /(?<![A-Za-z0-9])([A-Za-z0-9|!]{2})\s?-?(\d{3,4})(?![0-9A-Za-z:/.年月])/g
  for (let m: RegExpExecArray | null; (m = re.exec(text));) {
    const seen = m[1].toUpperCase()
    const airline = [...AIRLINES].find((a) => sameGlyph(a[0], seen[0]) && sameGlyph(a[1], seen[1]))
    if (airline) out.push({ at: m.index, end: m.index + m[0].length, value: flightCode(airline, m[2]) })
  }
  return out
}

function findPnr(text: string): string {
  const m = /(?:訂位代[號碼]|訂位編號|預訂代[號碼]|電腦代號|BOOKING\s*(?:REFERENCE|REF|CODE|NUMBER|NO)\.?|RESERVATION\s*(?:CODE|NUMBER|NO)\.?|CONFIRMATION\s*(?:CODE|NUMBER|NO)\.?|RECORD\s*LOCATOR|PNR)\s*(?:[（(][^）)\n]{0,20}[）)])?\s*[:：#]?\s*([A-Z0-9]{6})(?![A-Z0-9])/i.exec(text)
  // 全是數字的多半是訂單編號，不是訂位代號
  return m && /[A-Z]/i.test(m[1]) ? m[1].toUpperCase() : ''
}

const findCabin = (text: string) => CABINS.find(([re]) => re.test(text))?.[1] ?? ''

/** 把一段文字（對應一班飛機）讀成航班。before：這段之前的文字，日期寫在上面時往回找。 */
function readSegment(code: string, seg: string, before: string, near: string): TicketFlight {
  const f = blank()
  f.code = code
  const airports = findAirports(seg)
  if (airports[0]) f.from = airports[0].value
  const second = airports.find((a) => a.value !== f.from)
  if (second) f.to = second.value
  const times = findTimes(seg)
  if (times[0]) f.depTime = times[0].value
  if (times[1]) f.arrTime = times[1].value
  let dates = findDates(seg, near)
  if (dates.length === 0) dates = findDates(before, near).slice(-1)
  if (dates[0]) f.depDate = dates[0].value
  const arr = dates.find((d) => d.value !== f.depDate && d.value > f.depDate)
  f.arrDate = arr && dayNumber(arr.value) - dayNumber(f.depDate) <= 2 ? arr.value : f.depDate
  // 「+1」或算起來比起飛還早抵達：隔天到
  if (f.depDate && f.arrDate === f.depDate && f.depTime && f.arrTime) {
    const fromTz = AIRPORTS[f.from]?.tz
    const toTz = AIRPORTS[f.to]?.tz
    const early = fromTz && toTz
      ? toInstant({ local: `${f.arrDate}T${f.arrTime}`, tz: toTz }) <= toInstant({ local: `${f.depDate}T${f.depTime}`, tz: fromTz })
      : false
    if (early || /\+\s*1(?!\d)|次日|隔日/.test(seg)) f.arrDate = addDays(f.depDate, 1)
  }
  f.cabin = findCabin(seg)
  return f
}

const filled = (f: TicketFlight) => [f.from, f.to, f.depDate, f.depTime, f.arrTime].filter(Boolean).length

/**
 * 從一段文字裡找出所有航班。
 * 做法：先找航班代號，把文字依代號切段，每段各自找機場、日期、時間。
 * 有的機票把代號寫在資料前面、有的寫在後面，兩種切法都試，取讀到比較多的。
 */
export function parseTicketText(raw: string, hint: TicketHint = { near: '' }): TicketFlight[] {
  // 全形英數轉半形，OCR 常見的怪空白收成一般空白
  const text = raw.replace(/[\uFF01-\uFF5E]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[\u00A0\u3000\t]/g, ' ')
  let codes = findCodes(text)
  if (codes.length === 0) codes = findLooseCodes(text)
  if (codes.length === 0) {
    // 完全找不到代號（截圖上代號被圖示擋到之類）：機場和時間都有的話，其他欄位照樣帶出來，代號留給使用者填
    const f = readSegment('', text, '', hint.near)
    if (!f.from || !f.to || !f.depTime) return []
    return [{ ...f, pnr: findPnr(text) }]
  }
  // 猜出來的代號要有機場佐證，不然只是一串像代號的字
  if (findCodes(text).length === 0 && findAirports(text).length < 2) return []
  const after = codes.map((c, i) => readSegment(c.value, text.slice(c.end, codes[i + 1]?.at ?? text.length), text.slice(0, c.at), hint.near))
  const before = codes.map((c, i) => readSegment(c.value, text.slice(i ? codes[i - 1].end : 0, c.at), text.slice(0, i ? codes[i - 1].end : 0), hint.near))
  const score = (list: TicketFlight[]) => list.reduce((n, f) => n + filled(f), 0)
  const picked = score(before) > score(after) ? before : after

  // 同一個代號出現好幾次（摘要一次、明細一次）：併成一班，缺的欄位互補
  const merged: TicketFlight[] = []
  for (const f of picked) {
    const same = merged.find((x) => x.code === f.code && (!x.depDate || !f.depDate || x.depDate === f.depDate))
    if (!same) merged.push(f)
    else if (filled(f) > filled(same)) Object.assign(same, { ...f, cabin: f.cabin || same.cabin })
  }
  const pnr = findPnr(text)
  const cabin = findCabin(text)
  for (const f of merged) {
    f.pnr = pnr
    if (!f.cabin) f.cabin = cabin // 這段沒寫艙等就用整張票上寫的
  }
  // 只有代號、其他什麼都沒讀到的：有別班讀得到就丟掉，不然留第一個讓使用者自己補
  const useful = merged.filter((f) => filled(f) > 0)
  return useful.length ? useful : merged.slice(0, 1)
}

// ── 登機證條碼 ────────────────────────────────────────

/** 艙等代碼（訂位艙等的字母）對到一般人說的艙等。只是大略，使用者可以改。 */
function cabinOf(letter: string): string {
  if ('FAP'.includes(letter)) return '頭等艙'
  if ('JCDIZ'.includes(letter)) return '商務艙'
  if ('W'.includes(letter)) return '豪華經濟艙'
  return /[A-Z]/.test(letter) ? '經濟艙' : ''
}

/** 一年的第幾天 → 日期，挑離行程最近的那一年。 */
function fromDayOfYear(n: number, near: string): string {
  if (!(n >= 1 && n <= 366)) return ''
  const base = Number(near.slice(0, 4)) || new Date().getFullYear()
  let best = ''
  for (const y of [base - 1, base, base + 1]) {
    const d = addDays(ymd(y, 1, 1), n - 1)
    if (!best || Math.abs(dayNumber(d) - dayNumber(near || ymd(base, 7, 1))) < Math.abs(dayNumber(best) - dayNumber(near || ymd(base, 7, 1)))) best = d
  }
  return best
}

/**
 * 登機證上的條碼（國際航空運輸協會的格式，固定欄寬）。
 * 條碼裡有航班、機場、日期、艙等、訂位代號，但沒有時間——時間要使用者自己填。
 * 乘客姓名不讀、不存。
 */
export function parseBoardingPass(raw: string, hint: TicketHint = { near: '' }): TicketFlight[] {
  if (!/^M[1-4]/.test(raw) || raw.length < 58) return []
  const legs = Number(raw[1])
  const out: TicketFlight[] = []
  let at = 23 // 前面是格式代碼、航段數、姓名（20 格）、電子機票記號
  for (let i = 0; i < legs && at + 37 <= raw.length; i++) {
    const leg = raw.slice(at, at + 37)
    const from = leg.slice(7, 10)
    const to = leg.slice(10, 13)
    const airline = leg.slice(13, 16).trim()
    const number = leg.slice(16, 21).trim().replace(/^0+(?=\d)/, '')
    if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to) || !/^[A-Z0-9]{2,3}$/.test(airline) || !/^\d{1,4}[A-Z]?$/.test(number)) break
    const date = fromDayOfYear(Number(leg.slice(21, 24)), hint.near)
    const pnr = leg.slice(0, 7).trim()
    out.push({ ...blank(), code: airline + number, from, to, depDate: date, arrDate: date, cabin: cabinOf(leg[24]), pnr: /^[A-Z0-9]{5,7}$/.test(pnr) ? pnr : '' })
    // 每段後面跟著一塊長度不固定的附加資料，長度寫在最後兩格（十六進位）
    const extra = parseInt(leg.slice(35, 37), 16)
    at += 37 + (Number.isFinite(extra) ? extra : 0)
  }
  return out
}
