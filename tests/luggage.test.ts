import { describe, expect, it } from 'vitest'
import { allowanceOf, ledger, pickLeg } from '../src/luggage'

const leg = (code: string, local: string, bags?: number, bagKg?: number) => ({ code, dep: { local, tz: 'Asia/Taipei' }, bags, bagKg })
const at = (local: string) => new Date(`${local}:00+08:00`).getTime()

describe('行李重量', () => {
  it('每個人的額度是件數乘每件公斤數；只填公斤數當成一件', () => {
    expect(allowanceOf({ bags: 2, bagKg: 23 })).toBe(46)
    expect(allowanceOf({ bagKg: 20 })).toBe(20)
    expect(allowanceOf({ bags: 2 })).toBe(0)
    expect(allowanceOf({ bags: 0, bagKg: 0 })).toBe(0)
    expect(allowanceOf({})).toBe(0)
  })

  it('看還沒起飛的最近一班；都飛完了看最後一班；沒填額度的不算', () => {
    const flights = [leg('回程', '2027-03-09T17:00', 1, 20), leg('去程', '2027-03-05T13:00', 2, 23), leg('轉機', '2027-03-06T09:00')]
    expect(pickLeg(flights, at('2027-03-01T08:00'))?.code).toBe('去程')
    expect(pickLeg(flights, at('2027-03-07T08:00'))?.code).toBe('回程')
    expect(pickLeg(flights, at('2027-03-20T08:00'))?.code).toBe('回程')
    expect(pickLeg([leg('沒填', '2027-03-05T13:00')], at('2027-03-01T08:00'))).toBeUndefined()
  })

  it('每個人還剩多少、全團還剩多少、幾個人還沒填', () => {
    const l = ledger([{ id: 'a', name: '甲', kg: 18 }, { id: 'b', name: '乙', kg: 21.5 }, { id: 'c', name: '丙', kg: 0 }], 23)
    expect(l.rows.map((r) => [r.filled, r.left])).toEqual([[true, 5], [true, 1.5], [false, 23]])
    expect(l).toMatchObject({ total: 69, used: 39.5, left: 29.5, blank: 1, moves: [] })
  })

  it('有人超過：分給已經填了、空位最多的人', () => {
    const l = ledger([
      { id: 'a', name: '甲', kg: 27 }, { id: 'b', name: '乙', kg: 20 }, { id: 'c', name: '丙', kg: 15 }, { id: 'd', name: '丁', kg: 0 },
    ], 23)
    // 甲超過 4：丙的空位最多（8），全部給丙；還沒填的丁不列入
    expect(l.moves).toEqual([{ from: 'a', to: 'c', kg: 4 }])
    expect(l.left).toBe(30)
  })

  it('一個人的空位不夠就分給好幾個人；全團都滿了就分不完', () => {
    const split = ledger([{ id: 'a', name: '甲', kg: 30 }, { id: 'b', name: '乙', kg: 19 }, { id: 'c', name: '丙', kg: 20 }], 23)
    expect(split.moves).toEqual([{ from: 'a', to: 'b', kg: 4 }, { from: 'a', to: 'c', kg: 3 }])
    const full = ledger([{ id: 'a', name: '甲', kg: 30 }, { id: 'b', name: '乙', kg: 22 }], 23)
    expect(full.moves).toEqual([{ from: 'a', to: 'b', kg: 1 }])
    expect(full.left).toBe(-6)
  })
})
