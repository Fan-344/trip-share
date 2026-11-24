import { describe, expect, it } from 'vitest'
import { canInstall, detectPlatform, installSteps, needsInstall } from '../src/pwa'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
const MAC = IPAD
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'

describe('要不要先引導加到主畫面', () => {
  it('iPhone 的 Safari 要；從主畫面開啟就不用', () => {
    expect(needsInstall(detectPlatform(IPHONE, 5, false))).toBe(true)
    expect(needsInstall(detectPlatform(IPHONE, 5, true))).toBe(false)
  })

  it('iPad 自稱 Mac，靠觸控點數認出來', () => {
    expect(needsInstall(detectPlatform(IPAD, 5, false))).toBe(true)
  })

  it('電腦與 Android 不擋', () => {
    expect(needsInstall(detectPlatform(MAC, 0, false))).toBe(false)
    expect(needsInstall(detectPlatform(ANDROID, 5, false))).toBe(false)
  })
})

const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1'
const IPHONE_LINE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.16.0'

describe('怎麼加到主畫面', () => {
  it('認得出是哪個瀏覽器', () => {
    expect(detectPlatform(IPHONE, 5, false)).toMatchObject({ ios: true, android: false, browser: 'safari' })
    expect(detectPlatform(IPHONE_CHROME, 5, false)).toMatchObject({ ios: true, browser: 'chrome' })
    expect(detectPlatform(IPHONE_LINE, 5, false)).toMatchObject({ ios: true, browser: 'other' })
    expect(detectPlatform(ANDROID, 5, false)).toMatchObject({ ios: false, android: true, browser: 'chrome' })
    expect(detectPlatform(MAC, 0, false)).toMatchObject({ ios: false, android: false })
  })

  it('手機上還沒從主畫面開才提醒；電腦不提醒', () => {
    expect(canInstall(detectPlatform(IPHONE, 5, false))).toBe(true)
    expect(canInstall(detectPlatform(ANDROID, 5, false))).toBe(true)
    expect(canInstall(detectPlatform(IPHONE, 5, true))).toBe(false)
    expect(canInstall(detectPlatform(MAC, 0, false))).toBe(false)
  })

  it('步驟照瀏覽器給：分享按鈕的位置不一樣', () => {
    expect(installSteps(detectPlatform(IPHONE, 5, false))[0]).toContain('Safari 底下')
    expect(installSteps(detectPlatform(IPHONE_CHROME, 5, false))[0]).toContain('網址列右邊')
    expect(installSteps(detectPlatform(IPHONE_LINE, 5, false))[0]).toContain('用 Safari 開啟')
    expect(installSteps(detectPlatform(ANDROID, 5, false))[0]).toContain('⋮')
    for (const ua of [IPHONE, IPHONE_CHROME]) expect(installSteps(detectPlatform(ua, 5, false)).join('')).toContain('加入主畫面')
  })

  it('已經從主畫面開、或在電腦上，沒有步驟', () => {
    expect(installSteps(detectPlatform(IPHONE, 5, true))).toEqual([])
    expect(installSteps(detectPlatform(MAC, 0, false))).toEqual([])
  })
})
