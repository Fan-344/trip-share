import { describe, expect, it } from 'vitest'
import { missingFields, parseBoardingPass, parseTicketText } from '../src/ticket'

const hint = { near: '2027-03-05' }

describe('機票文字', () => {
  it('英文確認信：來回兩班，代號寫在資料前面', () => {
    const text = `
      Booking reference: ABC123
      Passenger: WANG/XIAOMING MR

      JX1751  Economy
      Fri, 05 Mar 2027
      Taipei (TPE) 07:10  ->  Chiang Mai (CNX) 10:20

      JX1752  Economy
      Tue, 09 Mar 2027
      Chiang Mai (CNX) 11:20  ->  Taipei (TPE) 16:05
      Total: TWD 25,600
    `
    expect(parseTicketText(text, hint)).toEqual([
      { code: 'JX1751', from: 'TPE', to: 'CNX', depDate: '2027-03-05', depTime: '07:10', arrDate: '2027-03-05', arrTime: '10:20', cabin: '經濟艙', pnr: 'ABC123' },
      { code: 'JX1752', from: 'CNX', to: 'TPE', depDate: '2027-03-09', depTime: '11:20', arrDate: '2027-03-09', arrTime: '16:05', cabin: '經濟艙', pnr: 'ABC123' },
    ])
  })

  it('中文確認信：代號寫在資料後面、日期沒有年份', () => {
    const text = `
      訂位代號：K7QM2P
      去程 3月5日（五）
      桃園 TPE 07:10 － 清邁 CNX 10:20　星宇航空 JX 1751　經濟艙
      回程 3月9日（二）
      清邁 CNX 11:20 － 桃園 TPE 16:05　星宇航空 JX 1752　經濟艙
      票價 NT 25600
    `
    const got = parseTicketText(text, hint)
    expect(got.map((f) => [f.code, f.from, f.to, f.depDate, f.depTime, f.arrTime])).toEqual([
      ['JX1751', 'TPE', 'CNX', '2027-03-05', '07:10', '10:20'],
      ['JX1752', 'CNX', 'TPE', '2027-03-09', '11:20', '16:05'],
    ])
    expect(got[0].pnr).toBe('K7QM2P')
    expect(got[0].cabin).toBe('經濟艙')
  })

  it('電子機票那種擠在一行的寫法', () => {
    const got = parseTicketText('BR 198 05MAR27 TPE NRT 0850 1305 BUSINESS\nPNR: 6XYZ9A', hint)
    expect(got).toHaveLength(1)
    expect(got[0]).toMatchObject({ code: 'BR198', from: 'TPE', to: 'NRT', depDate: '2027-03-05', cabin: '商務艙', pnr: '6XYZ9A' })
    expect(missingFields(got[0])).toEqual(['時間']) // 沒有冒號的時間不猜
  })

  it('上午下午、AM/PM', () => {
    const got = parseTicketText('CI 835 2027/03/05 TPE 下午 1:30 BKK 4:15 PM', hint)
    expect(got[0]).toMatchObject({ depTime: '13:30', arrTime: '16:15' })
  })

  it('半夜起飛、隔天抵達', () => {
    const got = parseTicketText('BR 12  Mar 5, 2027  TPE 23:55 - LAX 19:20', hint)
    expect(got[0]).toMatchObject({ depDate: '2027-03-05', arrDate: '2027-03-05' }) // 往東跨換日線：同一天到
    const red = parseTicketText('TG 635 2027-03-05 BKK 23:30 TPE 04:10 +1', hint)
    expect(red[0]).toMatchObject({ depDate: '2027-03-05', arrDate: '2027-03-06' })
    const noMark = parseTicketText('TG 635 2027-03-05 BKK 23:30 TPE 04:10', hint)
    expect(noMark[0].arrDate).toBe('2027-03-06') // 沒寫 +1 也算得出來
  })

  it('沒寫年份：挑離行程最近的', () => {
    expect(parseTicketText('JX1751 TPE 07:10 CNX 10:20 12月30日', { near: '2027-01-02' })[0].depDate).toBe('2026-12-30')
    expect(parseTicketText('JX1751 TPE 07:10 CNX 10:20 1月3日', { near: '2026-12-30' })[0].depDate).toBe('2027-01-03')
  })

  it('表裡沒有的機場：寫成 AAA - BBB 才認', () => {
    const got = parseTicketText('TG 110 5 Mar 2027 BKK - CEI 08:00 09:20 THE FEE USD', hint)
    expect(got[0]).toMatchObject({ from: 'BKK', to: 'CEI' })
  })

  it('不把價錢、時間、訂單編號當成航班或訂位代號', () => {
    expect(parseTicketText('合計 NT 5600 元，PM 0710 報到', hint)).toEqual([])
    expect(parseTicketText('訂單編號 A4 2027 已付款', hint)).toEqual([])
    expect(parseTicketText('JX1751 TPE 07:10 CNX 10:20 Booking number: 123456', hint)[0].pnr).toBe('')
  })

  it('同一班出現兩次（摘要＋明細）只算一班', () => {
    const got = parseTicketText('您的航班 JX1751 已確認\n\nJX1751 2027-03-05 TPE 07:10 CNX 10:20', hint)
    expect(got).toHaveLength(1)
    expect(got[0]).toMatchObject({ from: 'TPE', depTime: '07:10' })
  })

  it('全形英數字也讀得到', () => {
    expect(parseTicketText('ＪＸ１７５１　ＴＰＥ　０７：１０　ＣＮＸ　１０：２０', hint)[0]).toMatchObject({ code: 'JX1751', from: 'TPE', arrTime: '10:20' })
  })

  it('沒有航班的文字', () => {
    expect(parseTicketText('今天晚餐吃什麼', hint)).toEqual([])
    expect(parseTicketText('', hint)).toEqual([])
  })
})

describe('登機證條碼', () => {
  // 欄位：M＋段數、姓名 20 格、E、訂位代號 7、出發 3、抵達 3、航空公司 3、航班 5、第幾天 3、艙等 1、座位 4、序號 5、狀態 1、附加長度 2
  const leg = (pnr: string, from: string, to: string, air: string, no: string, day: string, cls: string, extra = '00') =>
    pnr.padEnd(7) + from + to + air.padEnd(3) + no.padEnd(5) + day + cls + '012A' + '0001 ' + '1' + extra

  it('單段', () => {
    const raw = 'M1' + 'WANG/XIAOMING'.padEnd(20) + 'E' + leg('ABC123', 'TPE', 'CNX', 'JX', '1751', '064', 'Y')
    expect(parseBoardingPass(raw, hint)).toEqual([
      { code: 'JX1751', from: 'TPE', to: 'CNX', depDate: '2027-03-05', depTime: '', arrDate: '2027-03-05', arrTime: '', cabin: '經濟艙', pnr: 'ABC123' },
    ])
  })

  it('兩段、中間夾附加資料、航班號有補零', () => {
    const raw = 'M2' + 'WANG/XIAOMING'.padEnd(20) + 'E' +
      leg('ABC123', 'TPE', 'BKK', 'TG', '0635', '064', 'C', '0A') + '>218 W  B ' +
      leg('ABC123', 'BKK', 'CNX', 'TG', '0102', '064', 'Y')
    const got = parseBoardingPass(raw, hint)
    expect(got.map((f) => [f.code, f.from, f.to, f.cabin])).toEqual([['TG635', 'TPE', 'BKK', '商務艙'], ['TG102', 'BKK', 'CNX', '經濟艙']])
  })

  it('不是登機證的條碼', () => {
    expect(parseBoardingPass('https://example.com/abc', hint)).toEqual([])
    expect(parseBoardingPass('M1' + 'x'.repeat(80), hint)).toEqual([])
  })

  it('沒有姓名', () => {
    const raw = 'M1' + 'WANG/XIAOMING'.padEnd(20) + 'E' + leg('ABC123', 'TPE', 'CNX', 'JX', '1751', '064', 'Y')
    expect(JSON.stringify(parseBoardingPass(raw, hint))).not.toContain('WANG')
  })
})

describe('截圖辨識出來的文字（會有錯字）', () => {
  // 深色底的訂位畫面：代號被認錯、兩欄的字混在一起、機場不在表裡
  const ocr = `Flight Information
Z 1x0309
Sun, Sep 13, Sun, Sep 13,
2027 2027
10:40 11:00

AIRBUS A321NEO

ZZQ 1h 20mins RMQ
Somewhere Taichung

Non-stop
Airport International
Terminal 2
= 63 kg CO2e`

  it('代號認錯也推得回來、補零拿掉、表裡沒有的機場照樣讀', () => {
    expect(parseTicketText(ocr, hint)).toEqual([
      { code: 'JX309', from: 'ZZQ', to: 'RMQ', depDate: '2027-09-13', depTime: '10:40', arrDate: '2027-09-13', arrTime: '11:00', cabin: '', pnr: '' },
    ])
  })

  it('完全沒有代號：其他欄位照樣帶出來，代號留空', () => {
    const got = parseTicketText(ocr.replace('Z 1x0309', '%%'), hint)
    expect(got).toHaveLength(1)
    expect(got[0]).toMatchObject({ code: '', from: 'ZZQ', to: 'RMQ', depTime: '10:40' })
    expect(missingFields(got[0])).toEqual(['航班代號'])
  })

  it('沒有機場佐證的相近字不算航班', () => {
    expect(parseTicketText('訂單 1X0309 已付款 10:40', hint)).toEqual([])
    expect(parseTicketText('1h 20mins, 63 kg', hint)).toEqual([])
  })
})
