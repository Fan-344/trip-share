import { describe, expect, it } from 'vitest'
import { parseInvite } from '../src/store/local'
import { b64url, newKeyBytes } from '../src/sync/crypto'

const id = '5874aa64-abac-4cae-a6ed-9c96c1f54bb0'

describe('邀請連結', () => {
  it('金鑰寫成網址用的格式再讀回來，內容不變（任何結尾字元都一樣）', () => {
    for (let i = 0; i < 200; i++) {
      const raw = newKeyBytes()
      const text = b64url.enc(raw)
      expect(text).toHaveLength(43)
      expect(b64url.dec(text)).toEqual(raw)
    }
  })

  it('從各種貼法裡找出邀請', () => {
    const key = b64url.enc(newKeyBytes())
    const link = `https://example.github.io/trip-share/#/join/${id}/${key}`
    const want = { id, key }
    expect(parseInvite(link)).toEqual(want)
    expect(parseInvite(`#/join/${id}/${key}`)).toEqual(want)
    expect(parseInvite(`  來看行程 ${link}\n`)).toEqual(want)
    expect(parseInvite(link.replace('#', '%23').replace(/\//g, '%2F'))).toEqual(want)
    expect(parseInvite(link.slice(0, 80) + '\n' + link.slice(80))).toEqual(want)
  })

  it('被截斷或多了字的連結不接受', () => {
    const key = b64url.enc(newKeyBytes())
    expect(parseInvite(`#/join/${id}/${key.slice(0, 42)}`)).toBeNull()
    expect(parseInvite(`#/join/${id}/${key}A`)).toBeNull()
    expect(parseInvite(`#/join/${id}`)).toBeNull()
    expect(parseInvite('https://example.github.io/trip-share/')).toBeNull()
  })
})
