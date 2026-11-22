import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import { INVITE_DAYS, Registry, acceptInvite, parseInvite } from '../src/store/local'
import { b64url, newKeyBytes } from '../src/sync/crypto'

const id = '5874aa64-abac-4cae-a6ed-9c96c1f54bb0'
beforeEach(() => { globalThis.indexedDB = new IDBFactory() })

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
    const want = { id, key, expiresAt: null }
    expect(parseInvite(link)).toEqual(want)
    expect(parseInvite(`#/join/${id}/${key}`)).toEqual(want)
    expect(parseInvite(`  來看行程 ${link}\n`)).toEqual(want)
    expect(parseInvite(link.replace('#', '%23').replace(/\//g, '%2F'))).toEqual(want)
    expect(parseInvite(link.slice(0, 80) + '\n' + link.slice(80))).toEqual(want)
  })

  it('連結帶到期時間', () => {
    const key = b64url.enc(newKeyBytes())
    expect(parseInvite(`https://example.github.io/trip-share/#/join/${id}/${key}/1800000000`)).toEqual({ id, key, expiresAt: 1_800_000_000_000 })
  })

  it('被截斷或多了字的連結不接受', () => {
    const key = b64url.enc(newKeyBytes())
    expect(parseInvite(`#/join/${id}/${key.slice(0, 42)}`)).toBeNull()
    expect(parseInvite(`#/join/${id}/${key}A`)).toBeNull()
    expect(parseInvite(`#/join/${id}`)).toBeNull()
    expect(parseInvite('https://example.github.io/trip-share/')).toBeNull()
  })
})

describe('接受邀請', () => {
  const now = 1_800_000_000_000
  const key = () => b64url.enc(newKeyBytes())

  it(`${INVITE_DAYS} 天內有效，過期就不接受`, async () => {
    const reg = await Registry.open()
    const invite = { id, key: key(), expiresAt: now + INVITE_DAYS * 86_400_000 }
    expect(() => acceptInvite(reg, invite, invite.expiresAt + 1000)).toThrow('過期')
    expect(reg.trip(id)).toBeUndefined()
    acceptInvite(reg, invite, now)
    expect(reg.trip(id)?.key).toBe(invite.key)
  })

  it('沒有到期時間的舊連結照樣能用', async () => {
    const reg = await Registry.open()
    const invite = { id, key: key(), expiresAt: null }
    acceptInvite(reg, invite, now)
    expect(reg.trip(id)?.key).toBe(invite.key)
  })

  it('手機上已有這份行程、邀請裡是新的金鑰：換成新的（重新受邀）', async () => {
    const reg = await Registry.open()
    const old = key()
    acceptInvite(reg, { id, key: old, expiresAt: null }, now)
    reg.upsertTrip({ id, title: '清邁', startDate: '2027-03-05', endDate: '2027-03-09' })
    const fresh = key()
    acceptInvite(reg, { id, key: fresh, expiresAt: null }, now)
    expect(reg.trip(id)).toMatchObject({ key: fresh, title: '清邁' })
  })
})
