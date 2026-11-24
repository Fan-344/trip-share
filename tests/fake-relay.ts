// 測試用的假中繼站：存事件、同位置新的蓋掉舊的、依 #t 與 since 過濾、可以切斷連線。
import type { Filter, NostrEvent, Relay } from '../src/sync/relay'

export class FakeServer {
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

export class FakeRelay implements Relay {
  url = 'fake'
  online = true
  /** 連上（或重連）時，中繼站把既有資料重送給這條連線的每一則事件。測試用來看重連時重抓了多少。 */
  replayed: NostrEvent[] = []
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
    for (const ev of this.server.events.values()) {
      if (!fs.some((f) => matches(f, ev))) continue
      this.replayed.push(ev)
      queueMicrotask(() => sub.onEvent(ev))
    }
    queueMicrotask(() => sub.onEose())
  }
}

