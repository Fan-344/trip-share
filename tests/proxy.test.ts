import { describe, expect, it } from 'vitest'
import { draftOf, isProxy, pendingProxy, type BoughtItem } from '../src/proxy'

const item = (extra: Partial<BoughtItem> = {}): BoughtItem => ({
  id: 's1', name: '手工皂', price: '350 泰銖', date: '2027-03-06', owner: 'a', createdBy: 'a', qty: 1, wants: { b: 2 }, bought: true, ...extra,
})

describe('代買轉分帳', () => {
  it('買到了、而且有別人要，才算代買', () => {
    expect(isProxy(item())).toBe(true)
    expect(isProxy(item({ bought: false }))).toBe(false)
    expect(isProxy(item({ wants: {} }))).toBe(false)
    // 只有買的人自己在「要的數量」裡，不算幫別人買
    expect(isProxy(item({ wants: { a: 1 } }))).toBe(false)
    // 說了不用分的還是代買，只是標成略過
    expect(isProxy(item({ noSplit: true }))).toBe(true)
    expect(draftOf(item({ noSplit: true }), '台幣', '2027-03-09').skipped).toBe(true)
  })

  it('草稿：金額是單價乘總數，付錢的是負責買的人，各人照要的數量分', () => {
    expect(draftOf(item(), '台幣', '2027-03-09')).toEqual({
      shopId: 's1', title: '手工皂', amount: 1050, cur: '泰銖', date: '2027-03-06',
      payer: 'a', sharers: ['a', 'b'], shares: { a: 1, b: 2 }, skipped: false, count: 3, unit: 350,
    })
  })

  it('大家要的一樣多就是平分；買的人自己不要就不用出', () => {
    expect(draftOf(item({ wants: { b: 1 } }), '台幣', '2027-03-09')).toMatchObject({ sharers: ['a', 'b'], shares: null, amount: 700 })
    expect(draftOf(item({ qty: 0 }), '台幣', '2027-03-09')).toMatchObject({ sharers: ['b'], shares: null, amount: 700, count: 2 })
  })

  it('沒指定誰買就是開這一項的人；沒填價錢金額是 0；沒寫幣別、沒排日期用給的', () => {
    const d = draftOf(item({ owner: '', createdBy: 'c', price: '', date: '' }), '日圓', '2027-03-09')
    expect(d).toMatchObject({ payer: 'c', amount: 0, unit: 0, cur: '日圓', date: '2027-03-09' })
    expect(draftOf(item({ price: '120' }), '日圓', '2027-03-09')).toMatchObject({ amount: 360, cur: '日圓' })
    expect(draftOf(item({ price: '大概三百' }), '日圓', '2027-03-09')).toMatchObject({ amount: 0 })
  })

  it('登錄過的不再列出來；說了不用分的還在，位置不動', () => {
    const items = [item(), item({ id: 's2' }), item({ id: 's3', wants: {} })]
    expect(pendingProxy(items, []).map((i) => i.id)).toEqual(['s1', 's2'])
    expect(pendingProxy(items, [{ shopId: 's1' }, {}]).map((i) => i.id)).toEqual(['s2'])
    expect(pendingProxy([item({ noSplit: true }), item({ id: 's2' })], []).map((i) => i.id)).toEqual(['s1', 's2'])
  })
})
