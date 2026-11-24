import { describe, expect, it } from 'vitest'
import { byDayOrder } from '../src/order'

const it_ = (title: string, time: string, kind = 'normal', pin?: string, createdAt = 0) => ({ title, time, kind, pin, createdAt })
const order = (list: ReturnType<typeof it_>[]) => [...list].sort(byDayOrder).map((i) => i.title)

describe('一天裡的項目順序', () => {
  it('照時間排，沒填時間的在最前面，時間一樣照建立先後', () => {
    expect(order([it_('晚餐', '18:00'), it_('整天', ''), it_('早餐', '08:00'), it_('也是早餐', '08:00', 'normal', undefined, 5)]))
      .toEqual(['整天', '早餐', '也是早餐', '晚餐'])
  })

  it('置頂的提醒排最前、置底的排最後，沒設的提醒照時間', () => {
    const list = [
      it_('早餐', '08:00'), it_('帶護照', '12:00', 'reminder', 'top'), it_('整天', ''),
      it_('明天早起', '09:00', 'reminder', 'bottom'), it_('晚餐', '18:00'), it_('記得防曬', '10:00', 'reminder'),
    ]
    expect(order(list)).toEqual(['帶護照', '整天', '早餐', '記得防曬', '晚餐', '明天早起'])
  })

  it('同樣置頂的幾則提醒之間照時間', () => {
    expect(order([it_('乙', '10:00', 'reminder', 'top'), it_('甲', '', 'reminder', 'top'), it_('早餐', '08:00')]))
      .toEqual(['甲', '乙', '早餐'])
  })

  it('不是提醒的項目不看置頂／置底', () => {
    expect(order([it_('晚餐', '18:00', 'normal', 'top'), it_('早餐', '08:00', 'must', 'bottom')])).toEqual(['早餐', '晚餐'])
  })
})
