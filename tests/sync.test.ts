import { afterEach, describe, expect, it } from 'vitest'
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure'
import { Trip, newTripDocs } from '../src/model/trip'
import type { Item } from '../src/model/types'
import { b64, importKey, newKeyBytes, type TripKey } from '../src/sync/crypto'
import { TripSync } from '../src/sync/engine'
import { FakeServer, type FakeRelay } from './fake-relay'

// ---- 一支手機 ----

const item = (title: string): Item => ({
  date: '2027-03-06', time: '18:00', tz: 'Asia/Bangkok', title, note: '', place: '', transport: '', kind: 'normal',
})

interface Phone {
  trip: Trip
  sync: TripSync
  relays: FakeRelay[]
  secretKey: Uint8Array
}

const open: TripSync[] = []
afterEach(() => { open.splice(0).forEach((s) => s.stop()) })

async function phone(name: string, key: TripKey, servers: FakeServer[], from?: Phone, extra: { sinceMargin?: number; zipSnapshots?: () => boolean } = {}): Promise<Phone> {
  const trip = from ? from.trip : new Trip(newTripDocs(), { pubkey: `pub${name}`, device: `dev${name}` })
  const relays = servers.map((s) => s.connect())
  const lastSync = { v: null as number | null, get() { return this.v }, set(t: number) { this.v = t } }
  const secretKey = from?.secretKey ?? generateSecretKey()
  const sync = new TripSync({
    tripId: 't1', key, docs: { main: trip.docs.main, comments: trip.docs.comments },
    secretKey, device: `dev${name}`, relays, lastSync, flushMs: 10, retryMs: 20, ...extra,
  })
  await sync.start()
  open.push(sync)
  return { trip, sync, relays, secretKey }
}

/** 等兩輪送出＋處理。 */
async function settle(...phones: Phone[]) {
  for (let i = 0; i < 4; i++) {
    await new Promise((r) => setTimeout(r, 25))
    for (const p of phones) await p.sync.idle()
  }
}

const newKey = () => importKey(newKeyBytes())

describe('同步', () => {
  it('新手機加入後拿到整份行程，之後雙向即時同步', async () => {
    const key = await newKey()
    const server = new FakeServer()
    const a = await phone('A', key, [server])
    a.trip.init({ id: 't1', title: '清邁', startDate: '2027-03-05', endDate: '2027-03-09' }, '爸爸')
    const id = a.trip.items.create(item('晚餐'))
    await settle(a)

    const b = await phone('B', key, [server])
    await settle(a, b)
    expect(b.trip.meta.title).toBe('清邁')
    expect(b.trip.items.get(id)?.title).toBe('晚餐')

    b.trip.join('媽媽')
    b.trip.items.update(id, { title: '宵夜' })
    await settle(a, b)
    expect(a.trip.items.get(id)?.title).toBe('宵夜')
    expect(a.trip.members.get('pubB')?.nickname).toBe('媽媽')
    expect(a.sync.status()).toMatchObject({ connected: 1, total: 1, pending: false })
    expect(a.sync.status().lastSyncAt).not.toBeNull()
  })

  it('離線時各改各的，恢復連線後自動合併', async () => {
    const key = await newKey()
    const server = new FakeServer()
    const a = await phone('A', key, [server])
    a.trip.init({ id: 't1', title: '清邁', startDate: '2027-03-05', endDate: '2027-03-09' }, '爸爸')
    const id = a.trip.items.create(item('晚餐'))
    const b = await phone('B', key, [server])
    await settle(a, b)

    b.relays[0].setOnline(false)
    b.trip.items.update(id, { time: '19:30' })
    const offlineId = b.trip.items.create(item('夜市'))
    a.trip.items.update(id, { title: '晚餐改地點' })
    await settle(a, b)
    expect(b.sync.status()).toMatchObject({ connected: 0, pending: true })
    expect(a.trip.items.get(offlineId)).toBeUndefined()

    b.relays[0].setOnline(true)
    await settle(a, b)
    for (const p of [a, b]) {
      expect(p.trip.items.get(id)).toMatchObject({ title: '晚餐改地點', time: '19:30' })
      expect(p.trip.items.get(offlineId)?.title).toBe('夜市')
    }
    expect(b.sync.status().pending).toBe(false)
  })

  it('有一台中繼站連不上：其他台送完就算同步完，不會一直顯示同步中', async () => {
    const key = await newKey()
    const good = new FakeServer()
    const bad = new FakeServer()
    const a = await phone('A', key, [good, bad])
    a.relays[1].setOnline(false)
    a.trip.init({ id: 't1', title: '清邁', startDate: '2027-03-05', endDate: '2027-03-09' }, '爸爸')
    a.trip.items.create(item('晚餐'))
    await settle(a)
    expect(a.sync.status()).toMatchObject({ connected: 1, total: 2, pending: false })
    // 連不上的那台其實還欠著，連上之後會補送過去
    expect(a.sync.relayStatus()[1].behind.length).toBeGreaterThan(0)
    a.relays[1].setOnline(true)
    await settle(a)
    expect(a.sync.relayStatus()[1].behind).toEqual([])
    expect(bad.events.size).toBeGreaterThan(0)
  })

  it('斷線重連不會把別人的整份快照重抓一遍；離線期間的改動照樣拿得到', async () => {
    const key = await newKey()
    const server = new FakeServer()
    const a = await phone('A', key, [server])
    // A 先離線編輯再連上：這樣 A 會把整份內容用「快照」補送到中繼站
    a.relays[0].setOnline(false)
    a.trip.init({ id: 't1', title: '清邁', startDate: '2027-03-05', endDate: '2027-03-09' }, '爸爸')
    const id = a.trip.items.create(item('晚餐'))
    await settle(a)
    a.relays[0].setOnline(true)
    await settle(a)
    // 事件的時間以秒計：等過一秒，B 讀完的時間才會晚於 A 快照的時間
    await new Promise((r) => setTimeout(r, 1100))
    const b = await phone('B', key, [server], undefined, { sinceMargin: 0 })
    await settle(a, b)
    expect(b.trip.items.get(id)?.title).toBe('晚餐')

    const others = (evs: { pubkey: string; tags: string[][] }[]) =>
      evs.filter((e) => e.pubkey !== getPublicKey(b.secretKey) && e.tags.some((t) => t[0] === 't' && t[1].endsWith('s')))
    // 第一次連上時拿過 A 的快照
    expect(others(b.relays[0].replayed).length).toBeGreaterThan(0)

    // B 斷線；這段期間 A 又改了東西
    b.relays[0].setOnline(false)
    const late = a.trip.items.create(item('夜市'))
    await settle(a)
    b.relays[0].replayed = []
    b.relays[0].setOnline(true)
    await settle(a, b)
    // 重連：A 沒有重發快照，所以不會重抓；A 離線期間的改動是用「更新」送的，照樣拿得到
    expect(others(b.relays[0].replayed)).toEqual([])
    expect(b.trip.items.get(late)?.title).toBe('夜市')

    // 之後才加入的新手機沒讀過這台，照樣拿得到整份
    const c = await phone('C', key, [server], undefined, { sinceMargin: 0 })
    await settle(a, b, c)
    expect(c.trip.items.get(id)?.title).toBe('晚餐')
    expect(c.trip.items.get(late)?.title).toBe('夜市')
  })

  /** 一支手機離線編了一堆東西再連上：它放到中繼站上的那份快照有多大、有沒有壓縮。 */
  async function offlineSnapshot(zip: boolean) {
    const key = await newKey()
    const server = new FakeServer()
    const a = await phone('A', key, [server], undefined, { zipSnapshots: () => zip })
    a.relays[0].setOnline(false)
    a.trip.init({ id: 't1', title: '清邁', startDate: '2027-03-05', endDate: '2027-03-09' }, '爸爸')
    const ids = Array.from({ length: 40 }, (_, i) => a.trip.items.create(item(`第 ${i} 個行程`)))
    await settle(a)
    a.relays[0].setOnline(true)
    await settle(a)
    const snaps = [...server.events.values()].filter((e) => e.tags.some((t) => t[0] === 't' && t[1].endsWith('s')))
    return { key, server, a, ids, snaps, bytes: snaps.reduce((s, e) => s + e.content.length, 0), zipped: snaps.every((e) => e.tags.some((t) => t[0] === 'z')) }
  }

  it('快照壓縮過再放上去：小很多，別的手機照樣讀得到整份內容', async () => {
    const plain = await offlineSnapshot(false)
    const zipped = await offlineSnapshot(true)
    expect(plain.zipped).toBe(false)
    expect(zipped.zipped).toBe(true)
    expect(zipped.bytes).toBeLessThan(plain.bytes / 2)

    // 之後才加入的手機：只靠這份壓縮過的快照就拿到全部
    const b = await phone('B', zipped.key, [zipped.server])
    await settle(zipped.a, b)
    expect(b.trip.meta.title).toBe('清邁')
    for (const id of zipped.ids) expect(b.trip.items.get(id)?.title).toMatch(/^第 \d+ 個行程$/)
  })

  it('還沒輪到壓縮時（有人還沒更新）照舊發沒壓縮的；讀的時候兩種都認得', async () => {
    const plain = await offlineSnapshot(false)
    // 這支手機自己已經會壓縮了，但它讀別人沒壓縮的快照一樣沒問題
    const b = await phone('B', plain.key, [plain.server], undefined, { zipSnapshots: () => true })
    await settle(plain.a, b)
    expect(b.trip.items.get(plain.ids[0])?.title).toBe('第 0 個行程')
    // 平常一筆一筆的小變動不壓縮
    b.trip.items.update(plain.ids[0], { title: '改過了' })
    await settle(plain.a, b)
    const updates = [...plain.server.events.values()].filter((e) => e.tags.some((t) => t[0] === 't' && t[1].endsWith('u')))
    expect(updates.length).toBeGreaterThan(0)
    expect(updates.some((e) => e.tags.some((t) => t[0] === 'z'))).toBe(false)
    expect(plain.a.trip.items.get(plain.ids[0])?.title).toBe('改過了')
  })

  it('快照變小之後，中繼站上多出來的舊塊會被清掉，新加入的人不會再抓到', async () => {
    const key = await newKey()
    const server = new FakeServer()
    let zip = false
    const a = await phone('A', key, [server], undefined, { zipSnapshots: () => zip })
    a.relays[0].setOnline(false)
    a.trip.init({ id: 't1', title: '清邁', startDate: '2027-03-05', endDate: '2027-03-09' }, '爸爸')
    const ids = Array.from({ length: 150 }, (_, i) => a.trip.items.create(item(`第 ${i} 個行程，寫長一點讓整份內容大到要切成好幾塊`)))
    await settle(a)
    a.relays[0].setOnline(true)
    await settle(a)
    const snapChunks = () => [...server.events.values()].filter((e) => e.tags.some((t) => t[0] === 't' && t[1].endsWith('s')))
    const big = snapChunks().length
    expect(big).toBeGreaterThan(1)

    // 改用壓縮後重新放一次：只需要一塊
    zip = true
    expect(await a.sync.publishSnapshotNow()).toBe(1)
    await settle(a)
    expect(snapChunks()).toHaveLength(1)
    // 原本那幾個位置還在，但被空的蓋掉了
    const blanks = [...server.events.values()].filter((e) => e.content === '')
    expect(blanks).toHaveLength(big - 1)

    // 新加入的手機：只收到那一塊，內容完整
    const b = await phone('B', key, [server])
    await settle(a, b)
    expect(b.relays[0].replayed.filter((e) => e.content === '')).toEqual([])
    expect(b.trip.items.get(ids[149])?.title).toContain('第 149 個行程')
  })

  it('中繼站只看得到密文；金鑰不對的人什麼都拿不到', async () => {
    const key = await newKey()
    const server = new FakeServer()
    const a = await phone('A', key, [server])
    a.trip.init({ id: 't1', title: 'SECRET-TITLE', startDate: '2027-03-05', endDate: '2027-03-09' }, '爸爸')
    await settle(a)

    expect(server.events.size).toBeGreaterThan(0)
    for (const ev of server.events.values()) {
      expect(new TextDecoder().decode(b64.dec(ev.content))).not.toContain('SECRET-TITLE')
      expect(JSON.stringify(ev.tags)).not.toContain('t1')
    }

    // 拿到別把金鑰的人：算出來的標籤不同，根本訂閱不到。
    const stranger = await phone('X', await newKey(), [server])
    await settle(a, stranger)
    expect(stranger.trip.meta.title).toBeUndefined()
  })

  it('大的內容（留言縮圖）切成多塊傳，另一邊組回來', async () => {
    const key = await newKey()
    const server = new FakeServer()
    const a = await phone('A', key, [server])
    const b = await phone('B', key, [server])
    await settle(a, b)
    const thumb = crypto.getRandomValues(new Uint8Array(65_000)).map((_, i) => i % 251)
    const id = a.trip.comments.create({ itemId: 'x', text: '菜單', thumb })
    await settle(a, b)
    expect(server.events.size).toBeGreaterThan(2)
    for (const ev of server.events.values()) expect(ev.content.length).toBeLessThan(45_000)
    expect(b.trip.comments.get(id)?.thumb).toEqual(thumb)
  })

  it('一台中繼站掛掉不影響；它恢復後會被補齊', async () => {
    const key = await newKey()
    const s1 = new FakeServer()
    const s2 = new FakeServer()
    const a = await phone('A', key, [s1, s2])
    a.relays[1].setOnline(false)
    a.trip.init({ id: 't1', title: '清邁', startDate: '2027-03-05', endDate: '2027-03-09' }, '爸爸')
    const b = await phone('B', key, [s1, s2])
    b.relays[1].setOnline(false)
    await settle(a, b)
    expect(b.trip.meta.title).toBe('清邁')
    expect(s2.events.size).toBe(0)

    a.relays[1].setOnline(true)
    await settle(a)
    // 只連得到第二台的手機，也拿得到完整資料。
    const c = await phone('C', key, [s2])
    await settle(a, c)
    expect(c.trip.meta.title).toBe('清邁')
  })

  it('重新開啟而內容沒變時，不重送快照', async () => {
    const key = await newKey()
    const server = new FakeServer()
    const a = await phone('A', key, [server])
    a.trip.init({ id: 't1', title: '清邁', startDate: '2027-03-05', endDate: '2027-03-09' }, '爸爸')
    await settle(a)
    a.sync.stop()

    // 同一支手機再開一次（同樣的文件、裝置與身分，換一條連線）：第一次會補上自己的快照。
    const second = await phone('A', key, [server], a)
    await settle(second)
    second.sync.stop()
    const before = server.accepted
    expect([...server.events.values()].some((e) => e.tags.some((t) => t[0] === 't' && t[1].endsWith('s')))).toBe(true)

    // 第三次開啟：中繼站已經有我的全部內容，不再重送。
    const third = await phone('A', key, [server], a)
    await settle(third)
    expect(server.accepted).toBe(before)
  })

  it('中繼站遺失資料時，下次開啟會重新發布', async () => {
    const key = await newKey()
    const server = new FakeServer()
    const a = await phone('A', key, [server])
    a.trip.init({ id: 't1', title: '清邁', startDate: '2027-03-05', endDate: '2027-03-09' }, '爸爸')
    await settle(a)
    a.sync.stop()
    server.events.clear()

    const again = await phone('A', key, [server], a)
    await settle(again)
    const b = await phone('B', key, [server])
    await settle(again, b)
    expect(b.trip.meta.title).toBe('清邁')
  })
})

describe('移出成員', () => {
  it('馬上把完整快照送到每台連得上的中繼站', async () => {
    const key = await newKey()
    const s1 = new FakeServer()
    const s2 = new FakeServer()
    const a = await phone('A', key, [s1, s2])
    a.relays[1].setOnline(false)
    a.trip.init({ id: 't1', title: '清邁', startDate: '2027-03-05', endDate: '2027-03-09' }, '爸爸')
    expect(await a.sync.publishSnapshotNow()).toBe(1)
    const snaps = [...s1.events.values()].filter((e) => e.tags.some((t) => t[0] === 't' && t[1].endsWith('s')))
    expect(snaps.length).toBeGreaterThan(0)
    expect(s2.events.size).toBe(0)

    // 之後才上線的新手機，光靠這份快照就拿得到內容
    const b = await phone('B', key, [s1])
    await settle(a, b)
    expect(b.trip.meta.title).toBe('清邁')
  })

  it('完全沒連線時回報 0，讓呼叫的人知道沒送出去', async () => {
    const key = await newKey()
    const server = new FakeServer()
    const a = await phone('A', key, [server])
    a.relays[0].setOnline(false)
    a.trip.init({ id: 't1', title: '清邁', startDate: '2027-03-05', endDate: '2027-03-09' }, '爸爸')
    expect(await a.sync.publishSnapshotNow()).toBe(0)
  })
})
