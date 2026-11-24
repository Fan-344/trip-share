import { describe, expect, it } from 'vitest'
import { amount, bagText } from '../src/baggage'

describe('託運行李', () => {
  it('輸入的字變成數字', () => {
    expect(amount('2')).toBe(2)
    expect(amount(' 23 ')).toBe(23)
    expect(amount('23.5')).toBe(23.5)
    expect(amount('23公斤')).toBe(23)
    expect(amount('23.456')).toBe(23.5)
  })

  it('空白、亂打、負數都當成沒填', () => {
    expect(amount('')).toBe(0)
    expect(amount('abc')).toBe(0)
    expect(amount('0')).toBe(0)
    expect(amount('1.2.3')).toBe(0)
    expect(amount('99999')).toBe(999)
  })

  it('卡片上的文字：有什麼寫什麼', () => {
    expect(bagText({ bags: 2, bagKg: 23 })).toBe('行李 2 件・每件 23 公斤')
    expect(bagText({ bags: 1 })).toBe('行李 1 件')
    expect(bagText({ bagKg: 20 })).toBe('行李 20 公斤')
    expect(bagText({ bags: 0, bagKg: 0 })).toBe('')
    // 舊資料沒有這兩個欄位
    expect(bagText({})).toBe('')
  })
})
