import { describe, expect, it, vi } from 'vitest'
import { dayKind, fallOf, forecastOpens, hasWeather, isWet, kindOf, parseWeather, pickDays, roundChance, loadWeather } from '../src/weather'

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

  it('行程跟預報有重疊：一天一格列到行程最後一天，預報還沒到的那幾天是佔位', () => {
    const w = parseWeather(sample, 0)
    expect(pickDays(w, '2027-03-05', '2027-03-09').map((d) => `${d.date.slice(8)}${d.none ? '?' : ''}`)).toEqual(['05', '06', '07', '08?', '09?'])
    // 旅行到一半：從今天（預報的第一天）開始列，過去的不列
    expect(pickDays(w, '2027-02-26', '2027-03-03').map((d) => d.date.slice(8))).toEqual(['01', '02', '03'])
    // 十天的行程全部列出來（畫面左右滑）
    expect(pickDays(w, '2027-03-02', '2027-03-11')).toHaveLength(10)
  })

  it('還太早、整趟都沒有預報：不列，改告訴人哪一天起會有；行程結束了列接下來五天', () => {
    const w = parseWeather(sample, 0)
    expect(pickDays(w, '2027-06-01', '2027-06-05')).toEqual([])
    // 預報給七天（今天起算），所以行程第一天的預報在六天前出現
    expect(forecastOpens(w, '2027-06-01')).toBe('2027-05-26')
    expect(pickDays(w, '2027-02-01', '2027-02-05').map((d) => d.date)).toEqual(['2027-03-01', '2027-03-02', '2027-03-03', '2027-03-04', '2027-03-05'])
  })

  it('一整天的天氣：飄一下毛毛雨不算雨天', () => {
    // 實際查到的一組乾季預報（代碼、降雨機率、雨量、雲量），對照手機內建天氣的圖示
    expect(dayKind(51, 61, 1.1, 62)).toBe('rain') // 內建：雨 50%
    expect(dayKind(53, 83, 2.9, 42)).toBe('rain') // 內建：雨 60%
    expect(dayKind(51, 23, 0.1, 18)).toBe('clear') // 內建：多雲時晴
    expect(dayKind(51, 16, 0.1, 50)).toBe('partly') // 內建：多雲時晴
    expect(dayKind(51, 27, 1.1, 68)).toBe('rain') // 內建：雨 35%
  })

  it('一整天的天氣：雷雨、雪照代碼；霧不代表一整天，跟沒下雨的日子一樣看雲量', () => {
    expect(dayKind(95, 10, 0, 10)).toBe('storm')
    expect(dayKind(71, 0, 0, 10)).toBe('snow')
    expect(dayKind(45, 0, 0, 10)).toBe('clear')
    expect(dayKind(45, 25, 0, 55)).toBe('partly')
    expect(dayKind(48, 25, 0, 95)).toBe('cloudy')
    // 沒給雲量：當成陰
    expect(dayKind(45, 0, 0, null)).toBe('cloudy')
    // 現在的天氣是當下那一刻，起霧照樣是霧
    expect(kindOf(45)).toBe('fog')
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

  it('雨還是雪看那天落下來的量，不是看最壞的一刻', () => {
    // 代碼是陣雪（85），但整天幾乎都是雨，只飄了一點雪：算雨天
    expect(dayKind(85, 80, 6, 90, { rain: 6, snow: 0.2 })).toBe('rain')
    // 代碼是雨，實際落下來的雪比雨多：算雪天
    expect(dayKind(61, 70, 3, 90, { rain: 0.2, snow: 2.1 })).toBe('snow')
    // 只有雪
    expect(dayKind(73, 60, 2, 90, { rain: 0, snow: 2 })).toBe('snow')
    // 沒給雨量雪量（舊的暫存）：照代碼
    expect(dayKind(85, 80, 6, 90)).toBe('snow')
  })

  it('雨和雪都有份量才是雨夾雪：各至少 0.5 毫米，少的至少是多的三分之一', () => {
    expect(dayKind(85, 80, 5, 90, { rain: 3, snow: 2 })).toBe('mix')
    expect(dayKind(61, 80, 5, 90, { rain: 1, snow: 3 })).toBe('mix')
    // 少的那個不到三分之一：還是照多的
    expect(dayKind(85, 80, 7, 90, { rain: 6, snow: 1 })).toBe('rain')
    expect(dayKind(85, 80, 7, 90, { rain: 1, snow: 6 })).toBe('snow')
    // 兩邊都很少：不算雨夾雪，照多的那個
    expect(dayKind(85, 80, 0.7, 90, { rain: 0.3, snow: 0.4 })).toBe('snow')
  })

  it('算成雨的那天一樣要過降雨的門檻；雷雨照代碼', () => {
    // 代碼是陣雪但其實是一點點雨，機率又低：不算雨天，看雲量
    expect(dayKind(85, 15, 0.3, 50, { rain: 0.3, snow: 0 })).toBe('partly')
    expect(dayKind(95, 80, 10, 90, { rain: 2, snow: 8 })).toBe('storm')
  })

  it('服務給了降雪量就照量判：札幌實際的兩天，週日是雪、週一是雨', () => {
    const w = parseWeather({
      current: { temperature_2m: 1, weather_code: 2 },
      daily: {
        time: ['2027-03-07', '2027-03-08'], weather_code: [85, 51],
        temperature_2m_max: [3.7, 7.6], temperature_2m_min: [-2.6, -2.1],
        precipitation_probability_max: [61, 88], precipitation_sum: [2.3, 0.8], cloud_cover_mean: [90, 80],
        snowfall_sum: [1.47, 0],
      },
    }, 0)
    expect(w.days.map((d) => d.kind)).toEqual(['snow', 'rain'])
  })

  it('雨量是總降水量減掉雪：整天零下的陣雪不會被當成雨夾雪', () => {
    // 實際查到的札幌：總降水 3.8 毫米、降雪 2.66 公分（融成水剛好 3.8）——全部是雪，沒有雨
    expect(fallOf(3.8, 2.66)).toEqual({ rain: 0, snow: 3.8 })
    expect(dayKind(85, 29, 3.8, 90, fallOf(3.8, 2.66))).toBe('snow')
    // 暖天的陣雨：沒有雪，全部是雨
    expect(fallOf(5.3, 0)).toEqual({ rain: 5.3, snow: 0 })
    // 真的雨雪各半
    expect(dayKind(85, 80, 6, 90, fallOf(6, 2.1))).toBe('mix')
  })

  it('降水機率只在會下的日子顯示，取到 5%', () => {
    expect((['rain', 'snow', 'mix', 'storm'] as const).map(isWet)).toEqual([true, true, true, true])
    expect((['clear', 'partly', 'cloudy', 'fog'] as const).map(isWet)).toEqual([false, false, false, false])
    expect([61, 88, 24, 92, 100, 2, 0, 63].map(roundChance)).toEqual([60, 90, 25, 90, 100, 0, 0, 65])
  })
})

describe('同時查同一個地方的天氣', () => {
  it('主圖和天氣卡同時要時只查一次，兩邊拿到同樣的結果', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(sample)))
    vi.stubGlobal('fetch', fetch)
    try {
      const [a, b] = await Promise.all([loadWeather('CNX', 1000), loadWeather('cnx', 1000)])
      expect(fetch).toHaveBeenCalledTimes(1)
      expect(a?.now.temp).toBe(25)
      expect(b).toBe(a)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
