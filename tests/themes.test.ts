import { describe, expect, it } from 'vitest'
import type { Flight } from '../src/model/types'
import { autoTheme, resolveTheme } from '../src/themes'

const flight = (from: string, to: string, date: string): Flight => ({
  code: 'XX1', from, to, cabin: '', aircraft: '',
  dep: { local: `${date}T10:00`, tz: 'Asia/Taipei' }, arr: { local: `${date}T14:00`, tz: 'Asia/Taipei' },
})

describe('佈景主題', () => {
  it('依去程的目的地自動決定，回程不算', () => {
    const trip = [flight('CNX', 'TPE', '2027-03-09'), flight('TPE', 'CNX', '2027-03-05')]
    expect(autoTheme(trip)).toBe('thai')
    expect(autoTheme([flight('TPE', 'KIX', '2027-03-05')])).toBe('japan')
    expect(autoTheme([flight('TPE', 'OKA', '2027-03-05')])).toBe('island')
    expect(autoTheme([flight('TPE', 'SIN', '2027-03-05')])).toBe('singapore')
    expect(autoTheme([flight('TPE', 'ICN', '2027-03-05')])).toBe('korea')
    expect(autoTheme([flight('TPE', 'KUL', '2027-03-05')])).toBe('city')
    expect(autoTheme([flight('TPE', 'SYD', '2027-03-05')])).toBe('australia')
    expect(autoTheme([flight('TPE', 'BNE', '2027-03-05')])).toBe('australia')
    expect(autoTheme([flight('TPE', 'AKL', '2027-03-05')])).toBe('newzealand')
    expect(autoTheme([flight('TPE', 'ZQN', '2027-03-05')])).toBe('newzealand')
  })

  it('沒有航班或不認得的機場用通用主題', () => {
    expect(autoTheme([])).toBe('general')
    expect(autoTheme([flight('TPE', 'ZZZ', '2027-03-05')])).toBe('general')
  })

  it('手動選的優先；空白或不認得的值退回自動', () => {
    const trip = [flight('TPE', 'CNX', '2027-03-05')]
    expect(resolveTheme('japan', trip)).toBe('japan')
    expect(resolveTheme('', trip)).toBe('thai')
    expect(resolveTheme(undefined, trip)).toBe('thai')
    expect(resolveTheme('未來才有的主題', trip)).toBe('thai')
  })
})
