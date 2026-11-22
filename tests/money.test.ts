import { describe, expect, it } from 'vitest'
import type { Flight } from '../src/model/types'
import { defaultCurrency, detectCurrency, formatPrice, parsePrice } from '../src/money'

const flight = (to: string, tz: string, date: string): Flight => ({
  code: 'XX1', from: 'TPE', to, cabin: '', aircraft: '',
  dep: { local: `${date}T10:00`, tz: 'Asia/Taipei' }, arr: { local: `${date}T14:00`, tz },
})

describe('幣別', () => {
  it('預設是去程目的地的貨幣', () => {
    expect(defaultCurrency([flight('CNX', 'Asia/Bangkok', '2027-03-05')])).toBe('泰銖')
    expect(defaultCurrency([flight('KIX', 'Asia/Tokyo', '2027-03-05')])).toBe('日圓')
    // 回程飛回台灣不影響
    const back: Flight = { ...flight('TPE', 'Asia/Taipei', '2027-03-09'), from: 'CNX' }
    expect(defaultCurrency([back, flight('CNX', 'Asia/Bangkok', '2027-03-05')])).toBe('泰銖')
  })

  it('沒有航班或不認得的地方用台幣', () => {
    expect(defaultCurrency([])).toBe('台幣')
    expect(defaultCurrency([flight('ZZZ', 'Pacific/Port_Moresby', '2027-03-05')])).toBe('台幣')
  })

  it('價錢存成文字，拆得回金額與幣別', () => {
    expect(formatPrice('350', '泰銖')).toBe('350 泰銖')
    expect(formatPrice('  ', '泰銖')).toBe('')
    expect(parsePrice('350 泰銖', '台幣')).toEqual({ amount: '350', currency: '泰銖' })
    expect(parsePrice('1,200日圓', '台幣')).toEqual({ amount: '1,200', currency: '日圓' })
    expect(parsePrice('', '泰銖')).toEqual({ amount: '', currency: '泰銖' })
    // 拆不出幣別的舊寫法：整段當金額
    expect(parsePrice('約三百', '泰銖')).toEqual({ amount: '約三百', currency: '泰銖' })
  })
})

describe('依目的地偵測幣別', () => {
  it('有航班：用去程目的地，並說明依據', () => {
    expect(detectCurrency([flight('CNX', 'Asia/Bangkok', '2027-03-05')])).toEqual({ currency: '泰銖', why: 'flight', detail: 'XX1 飛 CNX' })
  })

  it('沒有航班：看行程項目最常用的當地時間，台灣的不算', () => {
    const zones = ['Asia/Taipei', 'Asia/Taipei', 'Asia/Taipei', 'Asia/Tokyo', 'Asia/Tokyo', 'Asia/Seoul']
    expect(detectCurrency([], zones)).toMatchObject({ currency: '日圓', why: 'items' })
    expect(detectCurrency([], ['Asia/Taipei'])).toMatchObject({ currency: '台幣', why: 'none' })
  })

  it('再沒有就看手動選的主題；都沒有才是台幣', () => {
    expect(detectCurrency([], [], 'thai')).toMatchObject({ currency: '泰銖', why: 'theme' })
    expect(detectCurrency([], [], 'japan')).toMatchObject({ currency: '日圓', why: 'theme' })
    expect(detectCurrency([], [], 'city')).toMatchObject({ currency: '台幣', why: 'none' })
    expect(detectCurrency([])).toMatchObject({ currency: '台幣', why: 'none' })
  })

  it('航班優先於其他線索', () => {
    expect(detectCurrency([flight('CNX', 'Asia/Bangkok', '2027-03-05')], ['Asia/Tokyo'], 'japan').currency).toBe('泰銖')
  })
})
