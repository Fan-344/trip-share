import { describe, expect, it } from 'vitest'
import { pickRates } from '../src/rates'

describe('匯率', () => {
  it('服務給的是 1 台幣換多少外幣，倒過來變成 1 外幣等於多少台幣，四捨五入到小數後二位；不到 0.1 的留兩位有效數字', () => {
    const body = { result: 'success', rates: { TWD: 1, THB: 1.026136, JPY: 4.793719, VND: 778.318938, USD: 0.0312 } }
    expect(pickRates(body, ['泰銖', '日圓', '越南盾', '美元'])).toEqual({ 泰銖: 0.97, 日圓: 0.21, 越南盾: 0.0013, 美元: 32.05 })
  })

  it('沒有的幣別、不是正數的、看不懂的內容都不回傳', () => {
    expect(pickRates({ rates: { THB: 0, JPY: 'x' } }, ['泰銖', '日圓', '韓元', '不存在'])).toEqual({})
    expect(pickRates(null, ['泰銖'])).toEqual({})
    expect(pickRates({ error: 'x' }, ['泰銖'])).toEqual({})
  })
})
