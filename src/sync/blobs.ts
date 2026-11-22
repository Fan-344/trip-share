// 照片檔在中繼站上的存取。
//
// 每張照片各自是一組事件（太大就切塊），不過期。跟行程內容分開，有三個好處：
// - 行程的同步文件不會因為照片變大，文字的改動照樣幾秒內到。
// - 新加入的人先看到行程，照片是看到哪張才抓哪張。
// - 一張照片只上傳一次；內容一樣的照片（雜湊相同）不會重複佔空間。
import { finalizeEvent } from 'nostr-tools/pure'
import { b64, blobTag, decrypt, encryptBlob, sha256Hex, type TripKey } from './crypto'
import { KIND } from './engine'
import type { NostrEvent, Relay } from './relay'

const CHUNK = 30_000

export class BlobNet {
  constructor(private readonly o: { tripId: string; key: TripKey; secretKey: Uint8Array; relays: Relay[] }) {}

  private tag(hash: string): Promise<string> {
    return blobTag(this.o.key, this.o.tripId, hash)
  }

  connected(): Relay[] {
    return this.o.relays.filter((r) => r.connected())
  }

  /**
   * 把一張照片送到中繼站。回傳整張都收下的中繼站有幾台。
   * only：只送到這幾台（補傳用）；不給就是所有連得上的。
   */
  async publish(hash: string, bytes: Uint8Array, only?: Relay[]): Promise<number> {
    const tag = await this.tag(hash)
    const data = await encryptBlob(this.o.key, hash, bytes)
    const n = Math.max(1, Math.ceil(data.length / CHUNK))
    const created_at = Math.floor(Date.now() / 1000)
    const events: NostrEvent[] = []
    for (let i = 0; i < n; i++) {
      events.push(finalizeEvent({
        kind: KIND, created_at,
        tags: [['d', `${tag}:${i}`], ['t', tag], ['c', tag, String(i), String(n)]],
        content: b64.enc(data.subarray(i * CHUNK, (i + 1) * CHUNK)),
      }, this.o.secretKey))
    }
    const results = await Promise.all((only ?? this.connected()).map(async (relay) => {
      if (!relay.connected()) return false
      for (const ev of events) if (!(await relay.publish(ev))) return false
      return true
    }))
    return results.filter(Boolean).length
  }

  /**
   * 向所有中繼站要一張照片。任何一台給齊就算拿到；拿到後會核對雜湊，內容不對的不採用。
   * 都沒有或等太久回傳 null。
   */
  fetch(hash: string, timeoutMs = 12_000): Promise<Uint8Array | null> {
    return new Promise((resolve) => {
      let settled = false
      let waiting = this.o.relays.length
      const parts: (Uint8Array | undefined)[] = []
      let total = 0
      const unsubs: (() => void)[] = []
      const finish = (v: Uint8Array | null) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        unsubs.forEach((f) => f())
        resolve(v)
      }
      const timer = setTimeout(() => finish(null), timeoutMs)
      const tryAssemble = async () => {
        if (settled || total === 0) return
        for (let i = 0; i < total; i++) if (!parts[i]) return
        const all = new Uint8Array(parts.reduce((s, p) => s + p!.length, 0))
        let at = 0
        for (const p of parts) { all.set(p!, at); at += p!.length }
        try {
          const plain = await decrypt(this.o.key, all)
          if ((await sha256Hex(plain)) === hash) finish(plain)
        } catch {
          // 解不開：不是完整的一份，繼續等其他中繼站
        }
      }
      void this.tag(hash).then((tag) => {
        if (waiting === 0) return finish(null)
        for (const relay of this.o.relays) {
          unsubs.push(relay.subscribe(
            () => [{ kinds: [KIND], '#t': [tag] }],
            (ev) => {
              const c = ev.tags.find((t) => t[0] === 'c')
              const i = Number(c?.[2])
              const n = Number(c?.[3])
              if (!c || c[1] !== tag || !Number.isInteger(i) || !Number.isInteger(n) || i < 0 || i >= n || n > 2000) return
              total = n
              if (parts[i]) return
              try {
                parts[i] = b64.dec(ev.content)
              } catch {
                return
              }
              void tryAssemble()
            },
            () => {
              // 這台給完了。全部都給完還湊不齊，就是沒有。
              if (--waiting === 0) setTimeout(() => finish(null), 300)
            },
          ))
        }
      })
    })
  }

  /**
   * 檢查這些照片在每台連得上的中繼站上是不是完整的。回傳每台缺了哪些。
   * 中繼站可能會丟資料；手上有照片的人定期補傳，其他人才抓得到。
   */
  async missing(hashes: string[], timeoutMs = 8000): Promise<Map<Relay, string[]>> {
    const tags = new Map<string, string>()
    for (const h of hashes) tags.set(await this.tag(h), h)
    const out = new Map<Relay, string[]>()
    if (tags.size === 0) return out
    await Promise.all(this.connected().map((relay) => new Promise<void>((resolve) => {
      const seen = new Map<string, { n: number; got: Set<number> }>()
      let ended = false
      const end = () => {
        if (ended) return
        ended = true
        clearTimeout(timer)
        unsub()
        out.set(relay, [...tags].filter(([tag]) => {
          const s = seen.get(tag)
          return !s || s.got.size < s.n
        }).map(([, hash]) => hash))
        resolve()
      }
      const timer = setTimeout(end, timeoutMs)
      const unsub = relay.subscribe(
        () => [{ kinds: [KIND], '#t': [...tags.keys()] }],
        (ev) => {
          const c = ev.tags.find((t) => t[0] === 'c')
          if (!c || !tags.has(c[1])) return
          const s = seen.get(c[1]) ?? { n: Number(c[3]), got: new Set<number>() }
          s.got.add(Number(c[2]))
          seen.set(c[1], s)
        },
        end,
      )
    })))
    return out
  }
}
