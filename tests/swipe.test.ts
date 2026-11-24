import { describe, expect, it } from 'vitest'
import { dragIntent, swipeDir, swipeDone, swipeTarget } from '../src/swipe'

const TABS = ['home', 'plan', 'lists', 'shop', 'more']

describe('左右滑切換分頁', () => {
  it('夠遠、夠快、夠水平才算', () => {
    expect(swipeDir(-120, 10, 200)).toBe(-1)
    expect(swipeDir(120, -10, 200)).toBe(1)
    // 太短
    expect(swipeDir(-40, 0, 150)).toBe(0)
    // 太慢（比較像按著拖）
    expect(swipeDir(-200, 0, 900)).toBe(0)
    // 其實是斜著往下捲
    expect(swipeDir(-100, 80, 200)).toBe(0)
  })

  it('手指往左是下一頁，往右是上一頁', () => {
    expect(swipeTarget(TABS, 'plan', -1)).toBe('lists')
    expect(swipeTarget(TABS, 'plan', 1)).toBe('home')
  })

  it('剛開始動就分出是左右滑還是上下捲', () => {
    expect(dragIntent(5, 3)).toBe('')
    expect(dragIntent(-20, 4)).toBe('x')
    expect(dragIntent(6, 25)).toBe('y')
    // 斜著動當成上下捲，不搶頁面的捲動
    expect(dragIntent(15, 14)).toBe('y')
  })

  it('慢慢拖也算，只要拖過畫面的三分之一', () => {
    expect(swipeDone(-140, 10, 1500, 375)).toBe(-1)
    expect(swipeDone(-100, 10, 1500, 375)).toBe(0)
    expect(swipeDone(130, 0, 2000, 375)).toBe(1)
    // 快速一滑照舊
    expect(swipeDone(-80, 5, 150, 375)).toBe(-1)
  })

  it('已經在頭或尾就不動，不繞回去', () => {
    expect(swipeTarget(TABS, 'home', 1)).toBeNull()
    expect(swipeTarget(TABS, 'more', -1)).toBeNull()
    expect(swipeTarget(TABS, 'plan', 0)).toBeNull()
    expect(swipeTarget(TABS, 'nope', -1)).toBeNull()
  })
})
