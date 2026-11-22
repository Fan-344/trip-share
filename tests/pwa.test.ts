import { describe, expect, it } from 'vitest'
import { detectPlatform, needsInstall } from '../src/pwa'

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
