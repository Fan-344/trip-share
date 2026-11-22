import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { generateSecretKey } from 'nostr-tools/pure'
import * as Y from 'yjs'
import { Trip, newTripDocs } from '../src/model/trip'
import { BlobStore } from '../src/store/blobs'
import { PhotoStore } from '../src/store/photos'
import { BlobNet } from '../src/sync/blobs'
import { b64, importKey, newKeyBytes, type TripKey } from '../src/sync/crypto'
import { FakeServer, type FakeRelay } from './fake-relay'

interface Phone {
  trip: Trip
  photos: PhotoStore
  relays: FakeRelay[]
}

/** 一支手機：自己的文件、自己的照片資料庫、自己的中繼站連線。 */
async function phone(name: string, key: TripKey, servers: FakeServer[]): Promise<Phone> {
  globalThis.indexedDB = new IDBFactory() // 每支手機各自的儲存
  const trip = new Trip(newTripDocs(), { pubkey: `pub${name}`, device: `dev${name}` })
  const relays = servers.map((s) => s.connect())
  const net = new BlobNet({ tripId: 't1', key, secretKey: generateSecretKey(), relays })
  return { trip, photos: new PhotoStore(trip, await BlobStore.open('t1'), net), relays }
}

/** 行程文件在兩支手機之間同步（照片檔不走這裡）。 */
function syncDocs(a: Phone, b: Phone) {
  for (const k of ['main', 'comments'] as const) {
    Y.applyUpdate(b.trip.docs[k], Y.encodeStateAsUpdate(a.trip.docs[k]))
    Y.applyUpdate(a.trip.docs[k], Y.encodeStateAsUpdate(b.trip.docs[k]))
  }
}

const picture = (size: number, seed = 1) => new Uint8Array(size).map((_, i) => (i * 31 + seed * 7) % 251)
const newKey = () => importKey(newKeyBytes())
const tick = () => new Promise((r) => setTimeout(r, 30))

describe('照片', () => {
  it('拍的人存在手機上並上傳；另一支手機看到才去抓，抓過就留在手機上', async () => {
    const key = await newKey()
    const server = new FakeServer()
    const a = await phone('A', key, [server])
    const b = await phone('B', key, [server])
    const pic = picture(60_000)

    await a.photos.add('item1', pic)
    await tick()
    expect(a.trip.photoRecord('item1')).toMatchObject({ size: 60_000 })
    expect(await a.photos.get('item1')).toEqual({ state: 'ready', data: pic })

    expect(await b.photos.get('item1')).toEqual({ state: 'none' })
    syncDocs(a, b)
    expect(b.photos.has('item1')).toBe(true)
    expect(await b.photos.get('item1')).toEqual({ state: 'ready', data: pic })

    // 中繼站斷線也看得到：已經存在 B 的手機上
    b.relays[0].setOnline(false)
    expect(await b.photos.get('item1')).toEqual({ state: 'ready', data: pic })
  })

  it('同步文件不會因為照片變大', async () => {
    const key = await newKey()
    const a = await phone('A', key, [new FakeServer()])
    for (let i = 0; i < 10; i++) await a.photos.add(`item${i}`, picture(60_000, i))
    expect(Y.encodeStateAsUpdate(a.trip.docs.comments).length).toBeLessThan(5000)
    expect(Y.encodeStateAsUpdate(a.trip.docs.main).length).toBeLessThan(1000)
  })

  it('大照片切塊傳；中繼站上只有密文', async () => {
    const key = await newKey()
    const server = new FakeServer()
    const a = await phone('A', key, [server])
    const pic = new TextEncoder().encode('PLAINTEXT-MARKER'.repeat(6000)) // 約 96 KB
    await a.photos.add('item1', pic)
    await tick()
    expect(server.events.size).toBeGreaterThanOrEqual(3)
    for (const ev of server.events.values()) {
      expect(ev.content.length).toBeLessThan(45_000)
      expect(new TextDecoder().decode(b64.dec(ev.content))).not.toContain('PLAINTEXT-MARKER')
    }
    const b = await phone('B', key, [server])
    syncDocs(a, b)
    expect(await b.photos.get('item1')).toEqual({ state: 'ready', data: pic })
  })

  it('同一張照片重傳不會多佔一份', async () => {
    const key = await newKey()
    const server = new FakeServer()
    const a = await phone('A', key, [server])
    const pic = picture(40_000)
    await a.photos.add('item1', pic)
    await tick()
    const before = [...server.events.values()].map((e) => e.content).sort()
    await a.photos.add('item2', pic) // 另一筆用同一張照片
    await tick()
    expect([...server.events.values()].map((e) => e.content).sort()).toEqual(before)
  })

  it('離線時拍的：先存著，連上之後補送', async () => {
    const key = await newKey()
    const server = new FakeServer()
    const a = await phone('A', key, [server])
    const b = await phone('B', key, [server])
    a.relays[0].setOnline(false)
    const pic = picture(20_000)
    await a.photos.add('item1', pic)
    await tick()
    expect(await a.photos.blobs.pending()).toHaveLength(1)
    expect(await a.photos.get('item1')).toEqual({ state: 'ready', data: pic }) // 自己看得到

    syncDocs(a, b)
    expect(await b.photos.get('item1')).toEqual({ state: 'missing' }) // 別人還抓不到

    a.relays[0].setOnline(true)
    expect(await a.photos.flushPending()).toBe(1)
    expect(await a.photos.blobs.pending()).toHaveLength(0)
    expect(await b.photos.get('item1')).toEqual({ state: 'ready', data: pic })
  })

  it('中繼站把照片弄丟：拍的人檢查時補傳', async () => {
    const key = await newKey()
    const s1 = new FakeServer()
    const s2 = new FakeServer()
    const a = await phone('A', key, [s1, s2])
    const pic = picture(50_000)
    await a.photos.add('item1', pic)
    await tick()
    s2.events.clear()
    expect(await a.photos.verify()).toBe(1)
    // 只連得到第二台的人也抓得到
    const b = await phone('B', key, [s2])
    Y.applyUpdate(b.trip.docs.comments, Y.encodeStateAsUpdate(a.trip.docs.comments))
    expect(await b.photos.get('item1')).toEqual({ state: 'ready', data: pic })
    // 都還在的時候不重傳
    expect(await a.photos.verify()).toBe(0)
  })

  it('金鑰不對的人抓不到', async () => {
    const server = new FakeServer()
    const a = await phone('A', await newKey(), [server])
    await a.photos.add('item1', picture(10_000))
    await tick()
    const stranger = await phone('X', await newKey(), [server])
    Y.applyUpdate(stranger.trip.docs.comments, Y.encodeStateAsUpdate(a.trip.docs.comments))
    expect(await stranger.photos.get('item1')).toEqual({ state: 'missing' })
  })

  it('舊版塞在文件裡的照片照樣讀得到；拍的人會把它搬成新的存法', async () => {
    const key = await newKey()
    const server = new FakeServer()
    const a = await phone('A', key, [server])
    const b = await phone('B', key, [server])
    const pic = picture(30_000)
    a.trip.photos.create({ ref: 'item1', data: pic })
    syncDocs(a, b)
    expect(await b.photos.get('item1')).toEqual({ state: 'ready', data: pic })

    await b.photos.migrateLegacy() // 不是 B 拍的，不動
    expect(b.trip.photoRecord('item1')?.data).toEqual(pic)
    await a.photos.migrateLegacy()
    await tick()
    expect(a.trip.photoRecord('item1')?.data ?? null).toBeNull()
    expect(a.trip.photoRecord('item1')?.hash).toHaveLength(64)
    expect(Y.encodeStateAsUpdate(a.trip.docs.comments).length).toBeLessThan(3000)
    syncDocs(a, b)
    expect(await b.photos.get('item1')).toEqual({ state: 'ready', data: pic })
  })

  it('拿掉照片', async () => {
    const key = await newKey()
    const a = await phone('A', key, [new FakeServer()])
    await a.photos.add('item1', picture(5000))
    a.photos.remove('item1')
    expect(a.photos.has('item1')).toBe(false)
    expect(await a.photos.get('item1')).toEqual({ state: 'none' })
  })
})
