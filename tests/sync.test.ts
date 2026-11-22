import { afterEach, describe, expect, it } from 'vitest'
import { generateSecretKey } from 'nostr-tools/pure'
import { Trip, newTripDocs } from '../src/model/trip'
import type { Item } from '../src/model/types'
import { b64, importKey, newKeyBytes, type TripKey } from '../src/sync/crypto'
import { TripSync } from '../src/sync/engine'
import type { Filter, NostrEvent, Relay } from '../src/sync/relay'

// ---- 假的中繼站：存事件、同位置新的蓋掉舊的、依 #t 與 since 過濾、可以切斷連線 ----

class FakeServer {
  events = new Map<string, NostrEvent>()
  conns = new Set<FakeRelay>()
  accepted = 0

  connect(): FakeRelay {
    const r = new FakeRelay(this)
    this.conns.add(r)
    return r
  }
}

const matches = (f: Filter, ev: NostrEvent) =>
  (!f.kinds || f.kinds.includes(ev.kind)) &&
  (!f['#t'] || ev.tags.some((t) => t[0] === 't' && f['#t']!.includes(t[1]))) &&
  (!f.since || ev.created_at >= f.since)

class FakeRelay implements Relay {
  url = 'fake'
  online = true
  private subs = new Set<{ filters: () => Filter[]; onEvent: (ev: NostrEvent) => void; onEose: () => void }>()
  private listeners: (() => void)[] = []

  constructor(private server: FakeServer) {}

  connected() { return this.online }

  async publish(ev: NostrEvent) {
    if (!this.online) return false
    const d = ev.tags.find((t) => t[0] === 'd')![1]
    this.server.events.set(`${ev.pubkey}:${ev.kind}:${d}`, ev)
    this.server.accepted++
    for (const c of this.server.conns) if (c.online) c.deliver(ev)
    return true
  }

  subscribe(filters: () => Filter[], onEvent: (ev: NostrEvent) => void, onEose: () => void) {
    const sub = { filters, onEvent, onEose }
    this.subs.add(sub)
    if (this.online) this.replay(sub)
    return () => void this.subs.delete(sub)
  }

  onChange(cb: () => void) { this.listeners.push(cb) }
  kick() {}
  close() { this.online = false }

  setOnline(v: boolean) {
    this.online = v
    this.listeners.forEach((f) => f())
    if (v) for (const s of this.subs) this.replay(s)
  }

  private deliver(ev: NostrEvent) {
    for (const s of this.subs) if (s.filters().some((f) => matches(f, ev))) queueMicrotask(() => s.onEvent(ev))
  }

  private replay(sub: { filters: () => Filter[]; onEvent: (ev: NostrEvent) => void; onEose: () => void }) {
    const fs = sub.filters()
    for (const ev of this.server.events.values()) if (fs.some((f) => matches(f, ev))) queueMicrotask(() => sub.onEvent(ev))
    queueMicrotask(() => sub.onEose())
  }
}

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

async function phone(name: string, key: TripKey, servers: FakeServer[], from?: Phone): Promise<Phone> {
  const trip = from ? from.trip : new Trip(newTripDocs(), { pubkey: `pub${name}`, device: `dev${name}` })
  const relays = servers.map((s) => s.connect())
  const lastSync = { v: null as number | null, get() { return this.v }, set(t: number) { this.v = t } }
  const secretKey = from?.secretKey ?? generateSecretKey()
  const sync = new TripSync({
    tripId: 't1', key, docs: { main: trip.docs.main, comments: trip.docs.comments },
    secretKey, device: `dev${name}`, relays, lastSync, flushMs: 10, retryMs: 20,
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
