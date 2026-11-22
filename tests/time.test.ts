import { describe, expect, it } from 'vitest'
import type { Flight } from '../src/model/types'
import { ago, countdown, dayLabel, daysBetween, defaultTz, nightsBetween, placeName, safeUrl, toInstant } from '../src/time'

const out: Flight = {
  code: 'JX1751', from: 'TPE', to: 'CNX', cabin: '', aircraft: '',
  dep: { local: '2027-03-05T13:05', tz: 'Asia/Taipei' },
  arr: { local: '2027-03-05T16:00', tz: 'Asia/Bangkok' },
}
const back: Flight = {
  code: 'JX1752', from: 'CNX', to: 'TPE', cabin: '', aircraft: '',
  dep: { local: '2027-03-09T17:00', tz: 'Asia/Bangkok' },
  arr: { local: '2027-03-09T21:30', tz: 'Asia/Taipei' },
}

describe('時區', () => {
  it('當地時間換成絕對時間', () => {
    expect(new Date(toInstant(out.dep)).toISOString()).toBe('2027-03-05T05:05:00.000Z')
    expect(new Date(toInstant(out.arr)).toISOString()).toBe('2027-03-05T09:00:00.000Z')
    // 飛行時間 3 小時 55 分，跟手機在哪個時區無關
    expect(toInstant(out.arr) - toInstant(out.dep)).toBe((3 * 60 + 55) * 60_000)
  })

  it('有日光節約時間的時區也算對', () => {
    expect(new Date(toInstant({ local: '2027-07-01T09:00', tz: 'America/Los_Angeles' })).toISOString()).toBe('2027-07-01T16:00:00.000Z')
    expect(new Date(toInstant({ local: '2027-01-01T09:00', tz: 'America/Los_Angeles' })).toISOString()).toBe('2027-01-01T17:00:00.000Z')
  })

  it('地名優先用航班的機場', () => {
    expect(placeName('Asia/Bangkok', [out, back])).toBe('清邁')
    expect(placeName('Asia/Taipei', [out, back])).toBe('台灣')
    expect(placeName('Asia/Bangkok')).toBe('泰國')
    expect(placeName('Pacific/Port_Moresby')).toBe('Port Moresby')
  })

  it('新增項目的預設時區是那天人在的地方', () => {
    const flights = [back, out]
    expect(defaultTz('2027-03-04', flights)).toBe('Asia/Taipei')
    expect(defaultTz('2027-03-05', flights)).toBe('Asia/Bangkok')
    expect(defaultTz('2027-03-07', flights)).toBe('Asia/Bangkok')
    expect(defaultTz('2027-03-09', flights)).toBe('Asia/Taipei')
  })
})

describe('日期', () => {
  it('列出每一天與星期', () => {
    expect(daysBetween('2027-03-05', '2027-03-09')).toEqual(['2027-03-05', '2027-03-06', '2027-03-07', '2027-03-08', '2027-03-09'])
    expect(daysBetween('', '2027-03-09')).toEqual([])
    expect(daysBetween('2027-03-09', '2027-03-05')).toEqual([])
    expect(dayLabel('2027-03-05')).toEqual({ md: '3/5', wd: '五' })
    expect(nightsBetween('2027-03-05', '2027-03-09')).toBe(4)
  })

  it('倒數與多久以前', () => {
    expect(countdown(((2 * 24 + 12) * 60 + 16) * 60_000 + 46_000)).toEqual({ d: 2, h: 12, m: 16, s: 46 })
    expect(countdown(-5)).toEqual({ d: 0, h: 0, m: 0, s: 0 })
    const now = Date.UTC(2027, 2, 5, 12)
    expect(ago(now - 20_000, now)).toBe('剛剛')
    expect(ago(now - 10 * 60_000, now)).toBe('10 分鐘前')
    expect(ago(now - 3 * 3600_000, now)).toBe('3 小時前')
  })
})

describe('連結', () => {
  it('只接受 http 與 https', () => {
    expect(safeUrl('https://maps.app.goo.gl/abc')).toBe('https://maps.app.goo.gl/abc')
    expect(safeUrl('javascript:alert(1)')).toBeNull()
    expect(safeUrl('data:text/html,hi')).toBeNull()
    expect(safeUrl('不是網址')).toBeNull()
  })
})
