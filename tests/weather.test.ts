import { describe, expect, it } from 'vitest'
import { dayKind, hasWeather, kindOf, parseWeather, pickDays } from '../src/weather'

const sample = {
  current: { temperature_2m: 24.7, weather_code: 0 },
  daily: {
    time: ['2027-03-01', '2027-03-02', '2027-03-03', '2027-03-04', '2027-03-05', '2027-03-06', '2027-03-07'],
    weather_code: [1, 3, 95, 55, 45, 71, 2],
    temperature_2m_max: [30.3, 30.3, 29.0, 27.6, 28.1, 28.6, 28.5],
    temperature_2m_min: [20.4, 20.7, 20.6, 20.6, 19.8, 18.7, 19.3],
    precipitation_probability_max: [0, 2, 63, 73, 20, null, 28],
  },
}

describe('天氣', () => {
  it('氣象代碼歸成七種天氣', () => {
    expect([0, 1, 3, 45, 55, 71, 82, 95].map(kindOf)).toEqual(['clear', 'partly', 'cloudy', 'fog', 'rain', 'snow', 'rain', 'storm'])
  })

  it('整理服務回傳的內容：氣溫四捨五入，沒有降雨機率當 0', () => {
    const w = parseWeather(sample, 1000)
    expect(w.now).toEqual({ temp: 25, kind: 'clear' })
    expect(w.days[2]).toEqual({ date: '2027-03-03', kind: 'storm', hi: 29, lo: 21, rain: 63 })
    expect(w.days[5].rain).toBe(0)
  })

  it('格式不對就丟出錯誤，不會畫出壞掉的卡片', () => {
    expect(() => parseWeather({ current: {} }, 0)).toThrow()
  })

  it('行程落在預報範圍內就列行程那幾天，否則列接下來五天', () => {
    const w = parseWeather(sample, 0)
    expect(pickDays(w, '2027-03-05', '2027-03-09').map((d) => d.date)).toEqual(['2027-03-05', '2027-03-06', '2027-03-07'])
    expect(pickDays(w, '2027-06-01', '2027-06-05').map((d) => d.date)).toEqual(['2027-03-01', '2027-03-02', '2027-03-03', '2027-03-04', '2027-03-05'])
  })

  it('一整天的天氣：飄一下毛毛雨不算雨天', () => {
    // 實際查到的一組乾季預報（代碼、降雨機率、雨量、雲量），對照手機內建天氣的圖示
    expect(dayKind(51, 61, 1.1, 62)).toBe('rain') // 內建：雨 50%
    expect(dayKind(53, 83, 2.9, 42)).toBe('rain') // 內建：雨 60%
    expect(dayKind(51, 23, 0.1, 18)).toBe('clear') // 內建：多雲時晴
    expect(dayKind(51, 16, 0.1, 50)).toBe('partly') // 內建：多雲時晴
    expect(dayKind(51, 27, 1.1, 68)).toBe('rain') // 內建：雨 35%
  })

  it('一整天的天氣：雷雨、雪、霧照代碼；沒下雨的看雲量', () => {
    expect(dayKind(95, 10, 0, 10)).toBe('storm')
    expect(dayKind(71, 0, 0, 10)).toBe('snow')
    expect(dayKind(45, 0, 0, 10)).toBe('fog')
    // 當日代碼是陰，但整天平均雲量不高
    expect(dayKind(3, 0, 0, 42)).toBe('partly')
    expect(dayKind(1, 0, 0, 85)).toBe('cloudy')
  })

  it('一整天的天氣：服務沒給機率或雲量時的退路', () => {
    // 沒給機率：只看雨量
    expect(dayKind(61, null, 3, 50)).toBe('rain')
    expect(dayKind(61, null, 0.2, 50)).toBe('partly')
    // 什麼都沒給（舊格式）：照代碼
    expect(dayKind(61, null, null, null)).toBe('rain')
    expect(dayKind(2, null, null, null)).toBe('partly')
  })

  it('只有認得的機場才查天氣', () => {
    expect(hasWeather('cnx')).toBe(true)
    expect(hasWeather('ZZZ')).toBe(false)
  })
})
