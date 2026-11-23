import { describe, expect, it } from 'vitest'
import { between, nextSpot, rng, seedOf } from '../src/random'

describe('隨機數', () => {
  it('同一個種子產生同一串，不同種子不同', () => {
    const a = rng(42)
    const b = rng(42)
    const c = rng(43)
    const xs = [a(), a(), a()]
    expect([b(), b(), b()]).toEqual(xs)
    expect([c(), c(), c()]).not.toEqual(xs)
  })

  it('每個數都在 0 到 1 之間，而且分布得開', () => {
    const r = rng(7)
    const xs = Array.from({ length: 2000 }, () => r())
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true)
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length
    expect(mean).toBeGreaterThan(0.45)
    expect(mean).toBeLessThan(0.55)
    // 十等分，每一格都有數字落進去
    expect(new Set(xs.map((x) => Math.floor(x * 10))).size).toBe(10)
  })

  it('between 落在指定範圍內', () => {
    const r = rng(1)
    for (let i = 0; i < 200; i++) {
      const x = between(r, 1.5, 4)
      expect(x).toBeGreaterThanOrEqual(1.5)
      expect(x).toBeLessThan(4)
    }
  })

  it('同樣的文字得到同樣的種子', () => {
    expect(seedOf('abc')).toBe(seedOf('abc'))
    expect(seedOf('abc')).not.toBe(seedOf('abd'))
  })

  it('下一個位置在範圍內，而且離現在夠遠', () => {
    const r = rng(99)
    let here = 50
    for (let i = 0; i < 200; i++) {
      const to = nextSpot(r, here, 4, 95, 8)
      expect(to).toBeGreaterThanOrEqual(4)
      expect(to).toBeLessThanOrEqual(95)
      expect(Math.abs(to - here)).toBeGreaterThanOrEqual(8)
      here = to
    }
  })

  it('範圍太小時走到比較遠的那一端', () => {
    const r = rng(5)
    expect(nextSpot(r, 5, 4, 9, 8)).toBe(9)
    expect(nextSpot(r, 8, 4, 9, 8)).toBe(4)
  })
})
