import * as Y from 'yjs'
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure'
import { b64, decrypt, encrypt, hex, roomTag, type TripKey } from './crypto'
import type { Filter, NostrEvent, Relay } from './relay'

/**
 * 同步引擎（規格書第 6 節）：把 Yjs 文件的改動加密後寫到多台中繼站，並把別人的改動抓回來合併。
 *
 * 中繼站上有兩種訊息，都是 kind 30078（應用程式自訂資料，公共中繼站普遍接受）：
 * - 更新（u）：這幾秒內的改動。30 天後過期，免得無限累積。
 * - 快照（s）：某支手機當下的完整內容。每支手機每個文件只留最新一份（新的蓋掉舊的）。
 *
 * 一則訊息加密後若超過 CHUNK，就切成多個事件；收到齊全才解密。
 * （實測多數公共中繼站拒收約 100 KB 的事件，40 KB 都收。）
 *
 * 事件有簽章，但這裡不驗：內容能用行程金鑰解開，就代表是持有金鑰的人寫的；解不開的一律丟掉。
 */

export const KIND = 30078
const CHUNK = 30_000
const UPDATE_TTL = 30 * 86400
/** 自己的快照在中繼站上超過這麼久，就算內容沒變也重發一次。 */
const SNAPSHOT_MAX_AGE = 7 * 86400
/** 抓更新時往回多抓的時間，容忍各手機時鐘不一致。 */
const SINCE_MARGIN = 3 * 86400
const REMOTE = 'remote'

export interface SyncStatus {
  connected: number
  total: number
  /** 最近一次收到別人資料的時間（毫秒）。 */
  lastSyncAt: number | null
  /** 還有改動沒送到所有中繼站。 */
  pending: boolean
}

export interface SyncOptions {
  tripId: string
  key: TripKey
  /** 要同步的文件，例如 { main, comments }。 */
  docs: Record<string, Y.Doc>
  secretKey: Uint8Array
  device: string
  relays: Relay[]
  /** 記住上次同步到什麼時候（秒），下次只抓之後的更新。 */
  lastSync?: { get(): number | null; set(t: number): void }
  flushMs?: number
  /** 快照沒送成功時，隔多久再試。 */
  retryMs?: number
}

interface Channel {
  name: string
  doc: Y.Doc
  room: string
  buffer: Uint8Array[]
  onUpdate: (u: Uint8Array, origin: unknown) => void
}

interface RelayState {
  /** 這台中繼站給過哪些訊息的哪幾塊。 */
  parts: Map<string, Set<number>>
  /** 這台中繼站完整給過的訊息（依文件）。 */
  served: Map<string, Set<string>>
  eosed: Set<string>
  /** 哪些文件有改動沒送到這台。 */
  dirty: Set<string>
  sending: Set<string>
  mySnapAt: Map<string, number>
  lastSnapTry: number
  unsubs: (() => void)[]
}

interface Assembly {
  n: number
  parts: (Uint8Array | undefined)[]
  have: number
  done: boolean
}

const nowSec = () => Math.floor(Date.now() / 1000)

export class TripSync {
  private readonly channels: Channel[] = []
  private readonly states = new Map<Relay, RelayState>()
  private readonly msgs = new Map<string, Assembly>()
  /** 剛開啟、還在補抓時暫存解開的內容，用來判斷中繼站是否已經有我的全部資料。 */
  private plain: Map<string, Uint8Array> | null = new Map()
  private queue: Promise<void> = Promise.resolve()
  private timers: ReturnType<typeof setTimeout>[] = []
  private readonly listeners = new Set<() => void>()
  private lastSyncAt: number | null = null
  private readonly pubkey: string
  private stopped = false
  /** 送出過的事件數（測試與除錯用）。 */
  published = 0

  constructor(private readonly o: SyncOptions) {
    this.pubkey = getPublicKey(o.secretKey)
  }

  async start(): Promise<void> {
    for (const [name, doc] of Object.entries(this.o.docs)) {
      const ch: Channel = {
        name, doc, buffer: [],
        room: await roomTag(this.o.key, this.o.tripId, name),
        onUpdate: (u, origin) => {
          if (origin === REMOTE) return
          ch.buffer.push(u)
          this.emit()
        },
      }
      doc.on('update', ch.onUpdate)
      this.channels.push(ch)
    }
    for (const relay of this.o.relays) {
      const st: RelayState = {
        parts: new Map(), served: new Map(), eosed: new Set(), dirty: new Set(),
        sending: new Set(), mySnapAt: new Map(), lastSnapTry: 0, unsubs: [],
      }
      this.states.set(relay, st)
      relay.onChange(() => this.emit())
      for (const ch of this.channels) {
        st.unsubs.push(relay.subscribe(
          () => this.filters(ch),
          (ev) => this.enqueue(() => this.onEvent(relay, st, ch, ev)),
          () => this.enqueue(() => this.onEose(relay, st, ch)),
        ))
      }
    }
    this.timers.push(setInterval(() => this.enqueue(() => this.tick()), this.o.flushMs ?? 2500))
    this.timers.push(setTimeout(() => this.enqueue(async () => { this.plain = null }), 60_000))
  }

  stop(): void {
    this.stopped = true
    this.timers.forEach((t) => clearTimeout(t))
    for (const ch of this.channels) ch.doc.off('update', ch.onUpdate)
    for (const st of this.states.values()) st.unsubs.forEach((f) => f())
    this.listeners.clear()
  }

  status(): SyncStatus {
    let pending = this.channels.some((c) => c.buffer.length > 0)
    for (const st of this.states.values()) if (st.dirty.size || st.sending.size) pending = true
    return {
      connected: this.o.relays.filter((r) => r.connected()).length,
      total: this.o.relays.length,
      lastSyncAt: this.lastSyncAt,
      pending,
    }
  }

  /** 每台中繼站的狀況（除錯與之後的中繼站設定頁用）。 */
  relayStatus(): { url: string; connected: boolean; caughtUp: string[]; behind: string[]; sending: string[] }[] {
    return [...this.states].map(([relay, st]) => ({
      url: relay.url,
      connected: relay.connected(),
      caughtUp: [...st.eosed],
      behind: [...st.dirty],
      sending: [...st.sending],
    }))
  }

  onStatus(cb: () => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  /** 立刻把還沒送的改動送出去，不等下一次計時（App 被切到背景前呼叫）。 */
  flush(): void {
    this.enqueue(() => this.tick())
  }

  /**
   * 現在就把行程主文件的完整快照送到每一台連得上的中繼站，並等它們回覆。
   * 回傳有幾台收下了。換金鑰之前用：要確定「換金鑰的紀錄」留在舊的位置上（快照不會過期），
   * 之後才上線的成員才找得到新金鑰。
   */
  async publishSnapshotNow(channel = 'main'): Promise<number> {
    await this.queue
    const ch = this.channels.find((c) => c.name === channel)
    if (!ch) return 0
    ch.buffer = []
    const events = await this.build(ch, Y.encodeStateAsUpdate(ch.doc), 's')
    const results = await Promise.all([...this.states].map(async ([relay, st]) => {
      if (!relay.connected()) return false
      for (const ev of events) {
        this.published++
        if (!(await relay.publish(ev))) return false
      }
      st.dirty.delete(ch.name)
      st.mySnapAt.set(ch.name, nowSec())
      return true
    }))
    this.emit()
    return results.filter(Boolean).length
  }

  /** 等目前排隊中的處理做完（測試用）。 */
  idle(): Promise<void> {
    return this.queue
  }

  // ---- 收 ----

  private filters(ch: Channel): Filter[] {
    const last = this.o.lastSync?.get()
    const updates: Filter = { kinds: [KIND], '#t': [ch.room + 'u'] }
    if (last) updates.since = last - SINCE_MARGIN
    // 快照不加 since：數量少（每支手機一份），而且是補齊資料的最後防線。
    return [{ kinds: [KIND], '#t': [ch.room + 's'] }, updates]
  }

  private async onEvent(relay: Relay, st: RelayState, ch: Channel, ev: NostrEvent): Promise<void> {
    void relay
    const c = ev.tags.find((t) => t[0] === 'c')
    if (!c || ev.kind !== KIND) return
    const msgId = c[1]
    const i = Number(c[2])
    const n = Number(c[3])
    if (!msgId || !Number.isInteger(i) || !Number.isInteger(n) || i < 0 || i >= n || n > 5000) return

    const d = ev.tags.find((t) => t[0] === 'd')?.[1] ?? ''
    if (ev.pubkey === this.pubkey && d.startsWith(`${ch.room}:s:${this.o.device}:`)) {
      st.mySnapAt.set(ch.name, Math.max(st.mySnapAt.get(ch.name) ?? 0, ev.created_at))
    }

    let seen = st.parts.get(msgId)
    if (!seen) st.parts.set(msgId, (seen = new Set()))
    seen.add(i)
    if (seen.size === n) {
      let served = st.served.get(ch.name)
      if (!served) st.served.set(ch.name, (served = new Set()))
      served.add(msgId)
    }

    let m = this.msgs.get(msgId)
    if (!m) this.msgs.set(msgId, (m = { n, parts: new Array(n), have: 0, done: false }))
    if (m.done || m.n !== n || m.parts[i]) return
    try {
      m.parts[i] = b64.dec(ev.content)
    } catch {
      return
    }
    if (++m.have < n) return

    m.done = true
    const data = concat(m.parts as Uint8Array[])
    m.parts = []
    try {
      const update = await decrypt(this.o.key, data)
      Y.applyUpdate(ch.doc, update, REMOTE)
      this.plain?.set(msgId, update)
      if (ev.pubkey !== this.pubkey) this.lastSyncAt = Date.now()
      this.emit()
    } catch {
      // 不是用這把金鑰加密的，或內容損毀：忽略。
    }
  }

  private async onEose(relay: Relay, st: RelayState, ch: Channel): Promise<void> {
    const first = !st.eosed.has(ch.name)
    st.eosed.add(ch.name)
    this.o.lastSync?.set(nowSec())
    let need = st.dirty.has(ch.name)
    if (first) {
      const age = nowSec() - (st.mySnapAt.get(ch.name) ?? 0)
      if (age > SNAPSHOT_MAX_AGE || !this.covered(st, ch)) need = true
    }
    if (need) await this.sendSnapshot(relay, st, ch)
    this.emit()
  }

  /** 這台中繼站給我的資料，是否已經包含我手上的全部內容？ */
  private covered(st: RelayState, ch: Channel): boolean {
    if (!this.plain) return false
    const updates: Uint8Array[] = []
    for (const id of st.served.get(ch.name) ?? []) {
      const u = this.plain.get(id)
      if (u) updates.push(u)
    }
    const mine = Y.decodeStateVector(Y.encodeStateVector(ch.doc))
    if (mine.size === 0) return true
    if (updates.length === 0) return false
    const theirs = Y.decodeStateVector(Y.encodeStateVectorFromUpdate(Y.mergeUpdates(updates)))
    for (const [client, clock] of mine) if ((theirs.get(client) ?? 0) < clock) return false
    return true
  }

  // ---- 送 ----

  private async tick(): Promise<void> {
    if (this.stopped) return
    for (const ch of this.channels) {
      if (ch.buffer.length === 0) continue
      const update = Y.mergeUpdates(ch.buffer)
      ch.buffer = []
      const events = await this.build(ch, update, 'u')
      for (const [relay, st] of this.states) {
        // 還沒連上或還在補抓的中繼站：先記著，連上後用快照一次補齊。
        if (!relay.connected() || !st.eosed.has(ch.name)) st.dirty.add(ch.name)
        else void this.send(relay, st, ch, events, false)
      }
    }
    const retryMs = this.o.retryMs ?? 30_000
    for (const [relay, st] of this.states) {
      if (!relay.connected() || Date.now() - st.lastSnapTry < retryMs) continue
      for (const ch of this.channels) {
        if (st.dirty.has(ch.name) && st.eosed.has(ch.name)) await this.sendSnapshot(relay, st, ch)
      }
    }
    this.emit()
  }

  private async sendSnapshot(relay: Relay, st: RelayState, ch: Channel): Promise<void> {
    if (st.sending.has(ch.name) || this.stopped) return
    st.dirty.delete(ch.name)
    if (Y.decodeStateVector(Y.encodeStateVector(ch.doc)).size === 0) return
    st.lastSnapTry = Date.now()
    const events = await this.build(ch, Y.encodeStateAsUpdate(ch.doc), 's')
    void this.send(relay, st, ch, events, true)
  }

  private async send(relay: Relay, st: RelayState, ch: Channel, events: NostrEvent[], snapshot: boolean): Promise<void> {
    if (snapshot) st.sending.add(ch.name)
    let ok = true
    for (const ev of events) {
      this.published++
      if (!(await relay.publish(ev))) {
        ok = false
        break
      }
    }
    if (snapshot) st.sending.delete(ch.name)
    if (!ok) st.dirty.add(ch.name)
    else if (snapshot) st.mySnapAt.set(ch.name, nowSec())
    this.emit()
  }

  private async build(ch: Channel, update: Uint8Array, type: 'u' | 's'): Promise<NostrEvent[]> {
    const data = await encrypt(this.o.key, update)
    const n = Math.max(1, Math.ceil(data.length / CHUNK))
    const msgId = hex.enc(crypto.getRandomValues(new Uint8Array(12)))
    const created_at = nowSec()
    const events: NostrEvent[] = []
    for (let i = 0; i < n; i++) {
      // 快照的 d 固定（每支手機每塊一個位置），新的會蓋掉舊的；更新的 d 每則不同，不會互相蓋掉。
      const slot = type === 's' ? this.o.device : msgId
      const tags = [
        ['d', `${ch.room}:${type}:${slot}:${i}`],
        ['t', ch.room + type],
        ['c', msgId, String(i), String(n)],
      ]
      if (type === 'u') tags.push(['expiration', String(created_at + UPDATE_TTL)])
      events.push(finalizeEvent(
        { kind: KIND, created_at, tags, content: b64.enc(data.subarray(i * CHUNK, (i + 1) * CHUNK)) },
        this.o.secretKey,
      ))
    }
    return events
  }

  // ---- 共用 ----

  private enqueue(fn: () => Promise<void>): void {
    this.queue = this.queue.then(fn).catch((e) => console.error('同步處理失敗', e))
  }

  private emit(): void {
    this.listeners.forEach((f) => f())
  }
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}
