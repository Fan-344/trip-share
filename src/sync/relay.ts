// 一條到 Nostr 中繼站的連線：斷線自動重連，重連後自動重新訂閱。

export interface NostrEvent {
  id: string
  pubkey: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
  sig: string
}

export interface Filter {
  kinds?: number[]
  '#t'?: string[]
  since?: number
}

export interface Relay {
  readonly url: string
  connected(): boolean
  /** 中繼站回覆接受才是 true；沒連線、被拒絕、逾時都是 false。 */
  publish(ev: NostrEvent): Promise<boolean>
  /** filters 是函式：每次（重新）連上時重算，才能帶入最新的 since。回傳取消訂閱的函式。 */
  subscribe(filters: () => Filter[], onEvent: (ev: NostrEvent) => void, onEose: () => void): () => void
  onChange(cb: () => void): void
  /** 立刻重試連線（切回畫面、恢復網路時呼叫）。 */
  kick(): void
  close(): void
}

interface Sub {
  filters: () => Filter[]
  onEvent: (ev: NostrEvent) => void
  onEose: () => void
}

const PUBLISH_TIMEOUT = 8000
const MAX_RETRY = 60_000

export class WsRelay implements Relay {
  private ws: WebSocket | null = null
  private readonly subs = new Map<string, Sub>()
  private readonly oks = new Map<string, (ok: boolean) => void>()
  private readonly listeners: (() => void)[] = []
  private retry = 1000
  private timer: ReturnType<typeof setTimeout> | undefined
  private closed = false
  private seq = 0

  constructor(readonly url: string) {
    this.connect()
  }

  connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  publish(ev: NostrEvent): Promise<boolean> {
    if (!this.connected()) return Promise.resolve(false)
    return new Promise((resolve) => {
      const finish = (ok: boolean) => {
        clearTimeout(t)
        this.oks.delete(ev.id)
        resolve(ok)
      }
      const t = setTimeout(() => finish(false), PUBLISH_TIMEOUT)
      this.oks.set(ev.id, finish)
      this.ws!.send(JSON.stringify(['EVENT', ev]))
    })
  }

  subscribe(filters: () => Filter[], onEvent: (ev: NostrEvent) => void, onEose: () => void): () => void {
    const id = `s${++this.seq}`
    const sub = { filters, onEvent, onEose }
    this.subs.set(id, sub)
    if (this.connected()) this.req(id, sub)
    return () => {
      this.subs.delete(id)
      if (this.connected()) this.ws!.send(JSON.stringify(['CLOSE', id]))
    }
  }

  onChange(cb: () => void): void {
    this.listeners.push(cb)
  }

  kick(): void {
    if (this.closed || this.ws) return
    clearTimeout(this.timer)
    this.retry = 1000
    this.connect()
  }

  close(): void {
    this.closed = true
    clearTimeout(this.timer)
    this.ws?.close()
  }

  private connect(): void {
    if (this.closed) return
    let ws: WebSocket
    try {
      ws = new WebSocket(this.url)
    } catch {
      return this.scheduleRetry()
    }
    this.ws = ws
    ws.onopen = () => {
      this.retry = 1000
      for (const [id, sub] of this.subs) this.req(id, sub)
      this.emit()
    }
    ws.onmessage = (m) => this.handle(String(m.data))
    ws.onerror = () => ws.close()
    ws.onclose = () => {
      if (this.ws !== ws) return
      this.ws = null
      for (const finish of [...this.oks.values()]) finish(false)
      this.emit()
      this.scheduleRetry()
    }
  }

  private scheduleRetry(): void {
    if (this.closed) return
    this.timer = setTimeout(() => this.connect(), this.retry)
    this.retry = Math.min(this.retry * 2, MAX_RETRY)
  }

  private req(id: string, sub: Sub): void {
    this.ws!.send(JSON.stringify(['REQ', id, ...sub.filters()]))
  }

  private handle(data: string): void {
    let msg: unknown[]
    try {
      msg = JSON.parse(data)
    } catch {
      return
    }
    if (!Array.isArray(msg)) return
    if (msg[0] === 'EVENT') this.subs.get(msg[1] as string)?.onEvent(msg[2] as NostrEvent)
    else if (msg[0] === 'EOSE') this.subs.get(msg[1] as string)?.onEose()
    else if (msg[0] === 'OK') this.oks.get(msg[1] as string)?.(msg[2] === true)
  }

  private emit(): void {
    this.listeners.forEach((f) => f())
  }
}
