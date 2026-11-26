import { describe, expect, it } from 'vitest'
import { balances, convert, leftOf, parseAmount, portions, settle, tallies, tallyIn, transfers, type Bill } from '../src/split'

const bill = (payer: string, amount: number, sharers: string[], extra: Partial<Bill> = {}): Bill => ({ payer, amount, sharers, cur: '台幣', ...extra })

describe('分帳', () => {
  it('分擔者平分；除不盡的零頭補給前面的人，加起來等於總額', () => {
    expect(portions(bill('a', 900, ['a', 'b', 'c']))).toEqual({ a: 300, b: 300, c: 300 })
    const odd = portions(bill('a', 100, ['a', 'b', 'c']))
    expect(odd).toEqual({ a: 33.34, b: 33.33, c: 33.33 })
    expect(Math.round(Object.values(odd).reduce((s, n) => s + n, 0) * 100)).toBe(10000)
    expect(portions(bill('a', 100, []))).toEqual({})
  })

  it('有填份數就照份數分（合菜照人頭）；份數是 0 的人不用出', () => {
    expect(portions(bill('a', 5000, ['a', 'b'], { shares: { a: 3, b: 2 } }))).toEqual({ a: 3000, b: 2000 })
    expect(portions(bill('a', 600, ['a', 'b', 'c'], { shares: { a: 1, b: 2, c: 0 } }))).toEqual({ a: 200, b: 400, c: 0 })
    expect(portions(bill('a', 600, ['a', 'b'], { shares: { a: 0, b: 0 } }))).toEqual({})
  })

  it('淨額：付錢的人加上總額，分擔者各扣自己那份；幫別人墊的自己不扣', () => {
    expect(balances([bill('a', 900, ['a', 'b', 'c'])])).toEqual({ 台幣: { a: 600, b: -300, c: -300 } })
    expect(balances([bill('a', 400, ['b'])])).toEqual({ 台幣: { a: 400, b: -400 } })
    // 沒有分擔者的不算
    expect(balances([bill('a', 400, [])])).toEqual({})
  })

  it('轉帳建議：欠最多的先給該收最多的，次數盡量少', () => {
    expect(transfers({ a: 600, b: -300, c: -300 }, '台幣')).toEqual([
      { from: 'b', to: 'a', amount: 300, cur: '台幣' }, { from: 'c', to: 'a', amount: 300, cur: '台幣' },
    ])
    expect(transfers({ a: 500, b: 100, c: -600 }, '台幣')).toEqual([
      { from: 'c', to: 'a', amount: 500, cur: '台幣' }, { from: 'c', to: 'b', amount: 100, cur: '台幣' },
    ])
    // 互相墊來墊去，最後只剩一筆
    const net = balances([bill('a', 1000, ['a', 'b']), bill('b', 600, ['a', 'b'])]).台幣
    expect(transfers(net, '台幣')).toEqual([{ from: 'b', to: 'a', amount: 200, cur: '台幣' }])
    // 不到 1 元的零頭不列
    expect(transfers({ a: 0.34, b: -0.34 }, '台幣')).toEqual([])
    expect(transfers({ a: 0.34, b: -0.34 }, '美元')).toEqual([{ from: 'b', to: 'a', amount: 0.34, cur: '美元' }])
  })

  it('還款也是一筆：付的人給了收的人，欠的就抵掉', () => {
    const bills = [bill('a', 900, ['a', 'b', 'c']), bill('b', 300, ['a'])]
    expect(settle(bills, {}).transfers).toEqual([{ from: 'c', to: 'a', amount: 300, cur: '台幣' }])
    expect(settle([...bills, bill('c', 300, ['a'])], {}).transfers).toEqual([])
  })

  it('外幣沒填匯率就各幣別分開結；都填了才換成台幣合在一起', () => {
    const bills = [bill('a', 1000, ['a', 'b'], { cur: '泰銖' }), bill('b', 300, ['a', 'b'])]
    const apart = settle(bills, {})
    expect(apart).toMatchObject({ merged: false, foreign: ['泰銖'] })
    expect(apart.transfers).toEqual([
      { from: 'a', to: 'b', amount: 150, cur: '台幣' }, { from: 'b', to: 'a', amount: 500, cur: '泰銖' },
    ])
    // 1 泰銖 = 0.9 台幣：b 欠 a 450，a 欠 b 150，合起來 b 給 a 300
    const one = settle(bills, { 泰銖: 0.9 })
    expect(one.merged).toBe(true)
    expect(one.transfers).toEqual([{ from: 'b', to: 'a', amount: 300, cur: '台幣' }])
    // 只有台幣時不算合併
    expect(settle([bill('a', 100, ['b'])], {}).merged).toBe(false)
  })

  it('明細：每個人先付多少、該出多少、還了多少、收了多少；還差的跟淨額一樣', () => {
    const bills = [bill('a', 900, ['a', 'b', 'c']), { ...bill('b', 300, ['a']), settle: true }]
    const t = tallies(bills).台幣
    expect(t).toEqual({
      a: { paid: 900, owed: 300, sent: 0, got: 300 },
      b: { paid: 0, owed: 300, sent: 300, got: 0 },
      c: { paid: 0, owed: 300, sent: 0, got: 0 },
    })
    expect(Object.fromEntries(Object.entries(t).map(([id, row]) => [id, leftOf(row)]))).toEqual(balances(bills).台幣)
  })

  it('明細換成同一種幣別：各幣別照匯率換過去再加起來；缺匯率就換不了', () => {
    const detail = tallies([bill('a', 1000, ['a', 'b']), bill('b', 2000, ['a', 'b'], { cur: '日圓' })])
    // 1 日圓 = 0.2 台幣：a 先付 1000、該出 500 + 1000×0.2；b 先付 2000×0.2、該出 500 + 200
    expect(tallyIn(detail, { 日圓: 0.2 }, '台幣')).toEqual({
      a: { paid: 1000, owed: 700, sent: 0, got: 0 }, b: { paid: 400, owed: 700, sent: 0, got: 0 },
    })
    // 換成日圓看：台幣的除以 0.2
    expect(tallyIn(detail, { 日圓: 0.2 }, '日圓')).toEqual({
      a: { paid: 5000, owed: 3500, sent: 0, got: 0 }, b: { paid: 2000, owed: 3500, sent: 0, got: 0 },
    })
    expect(tallyIn(detail, {}, '台幣')).toBeNull()
    expect(convert(300, '台幣', '日圓', { 日圓: 0.2 })).toBe(1500)
    expect(convert(300, '日圓', '台幣', {})).toBeNull()
  })

  it('輸入的金額：逗號與空白不算，不是正的數字就是 0', () => {
    expect(parseAmount('1,200')).toBe(1200)
    expect(parseAmount(' 350.5 ')).toBe(350.5)
    expect(parseAmount('abc')).toBe(0)
    expect(parseAmount('-5')).toBe(0)
    expect(parseAmount('')).toBe(0)
  })

  it('結帳幣別可以指定：匯率是 1 外幣等於多少結帳幣別，台幣這時也算外幣', () => {
    const bills = [bill('a', 1000, ['a', 'b'], { cur: '美元' }), bill('b', 3200, ['a', 'b'])]
    // 結帳用美元、1 台幣 = 0.03125 美元：b 欠 a 500 美元，a 欠 b 1600 台幣 = 50 美元，合起來 b 給 a 450 美元
    const s = settle(bills, { 台幣: 0.03125 }, '美元')
    expect(s).toMatchObject({ merged: true, foreign: ['台幣'] })
    expect(s.transfers).toEqual([{ from: 'b', to: 'a', amount: 450, cur: '美元' }])
    expect(convert(3200, '台幣', '美元', { 台幣: 0.03125 }, '美元')).toBe(100)
    expect(tallyIn(tallies(bills), { 台幣: 0.03125 }, '美元', '美元')).toMatchObject({ a: { paid: 1000, owed: 550 }, b: { paid: 100, owed: 550 } })
    // 沒有台幣的匯率就合不起來，各幣別分開結
    expect(settle(bills, {}, '美元').merged).toBe(false)
  })
})
