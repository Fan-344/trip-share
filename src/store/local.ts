import * as Y from 'yjs'
import { IndexeddbPersistence, clearDocument } from 'y-indexeddb'
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure'
import { newId } from '../model/table'
import { Trip, newTripDocs, type TripDocs } from '../model/trip'
import type { Actor } from '../model/types'
import { b64url, hex, importKey, newKeyBytes } from '../sync/crypto'
import { TripSync } from '../sync/engine'
import { WsRelay } from '../sync/relay'

// 本機儲存（規格書第 5 節）：每個 Yjs 文件各自存進 IndexedDB。

/**
 * 內建的公共中繼站。2026-11-22 在台灣用 scripts/relay-probe.mjs 實測：
 * 五台都能寫入並讀回 40 KB 的事件；泰國的連線品質尚未實測。
 */
export const DEFAULT_RELAYS = [
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://nostr.mom',
  'wss://offchain.pub',
  'wss://relay.nostr.net',
]

async function persist(name: string, doc: Y.Doc): Promise<IndexeddbPersistence> {
  const p = new IndexeddbPersistence(name, doc)
  await p.whenSynced
  return p
}

export interface Me extends Actor {
  nickname: string
  /** Nostr 私鑰（十六進位）。只存本機。 */
  sk: string
}

export interface TripRef {
  id: string
  title: string
  startDate: string
  endDate: string
  /** 行程金鑰（網址用的 base64）。只存本機，靠邀請連結傳給家人。 */
  key: string
  addedAt: number
  /** 上次開啟時用的佈景主題，首頁的行程卡用它上色。 */
  theme?: string
}

/** 這支手機的登記簿：我是誰、參加過哪些行程與它們的金鑰。只存本機。 */
export class Registry {
  private constructor(private readonly doc: Y.Doc) {}

  static async open(): Promise<Registry> {
    const doc = new Y.Doc()
    await persist('registry', doc)
    // 申請持久保存，降低瀏覽器自動清資料的機會；被拒絕也照常運作。
    void navigator.storage?.persist?.()
    return new Registry(doc)
  }

  get ydoc(): Y.Doc {
    return this.doc
  }

  me(): Me | null {
    const m = this.doc.getMap('me').toJSON() as Partial<Me>
    return m.pubkey && m.device && m.nickname && m.sk ? (m as Me) : null
  }

  setNickname(nickname: string): void {
    const m = this.doc.getMap('me')
    this.doc.transact(() => {
      if (!m.get('sk')) {
        const sk = generateSecretKey()
        m.set('sk', hex.enc(sk))
        m.set('pubkey', getPublicKey(sk))
      }
      if (!m.get('device')) m.set('device', hex.enc(crypto.getRandomValues(new Uint8Array(8))))
      m.set('nickname', nickname)
    })
  }

  /** 從備份還原身分（手機上還沒有身分時）。裝置代號一律用新的：它代表「這次安裝」，不該跟著備份走。 */
  adoptIdentity(id: { sk: string; pubkey: string; nickname: string }): void {
    const m = this.doc.getMap('me')
    this.doc.transact(() => {
      m.set('sk', id.sk)
      m.set('pubkey', id.pubkey)
      m.set('nickname', id.nickname)
      if (!m.get('device')) m.set('device', hex.enc(crypto.getRandomValues(new Uint8Array(8))))
    })
  }

  /** 上次下載備份檔的時間（毫秒）；沒備份過是 null。 */
  lastBackupAt(): number | null {
    return (this.doc.getMap('settings').get('lastBackupAt') as number | undefined) ?? null
  }

  setLastBackup(at: number): void {
    this.doc.getMap('settings').set('lastBackupAt', at)
  }

  trips(): TripRef[] {
    return (Object.values(this.doc.getMap('trips').toJSON()) as TripRef[]).sort((a, b) =>
      b.startDate.localeCompare(a.startDate),
    )
  }

  trip(id: string): TripRef | undefined {
    return this.doc.getMap<TripRef>('trips').get(id)
  }

  /** 從登記簿拿掉一份行程（連同它的金鑰）。文件本身由 removeTrip 清。 */
  forgetTrip(id: string): void {
    this.doc.getMap('trips').delete(id)
  }

  /** 新增行程，或更新首頁顯示用的標題與日期。金鑰一旦記下就不會被這裡改掉。 */
  upsertTrip(ref: Omit<TripRef, 'addedAt' | 'key'> & { key?: string }): void {
    const trips = this.doc.getMap<TripRef>('trips')
    const old = trips.get(ref.id)
    const key = old?.key ?? ref.key
    if (!key) return
    const theme = ref.theme ?? old?.theme
    if (old && old.title === ref.title && old.startDate === ref.startDate && old.endDate === ref.endDate && old.theme === theme) return
    trips.set(ref.id, { ...ref, key, addedAt: old?.addedAt ?? Date.now(), ...(theme && { theme }) })
  }
}

export interface OpenTrip {
  trip: Trip
  sync: TripSync | null
  close: () => void
}

export async function openTrip(reg: Registry, tripId: string, withSync = true): Promise<OpenTrip> {
  const me = reg.me()
  if (!me) throw new Error('尚未設定暱稱')
  const docs = newTripDocs()
  const names = Object.keys(docs) as (keyof TripDocs)[]
  const ps = await Promise.all(names.map((n) => persist(`trip:${tripId}:${n}`, docs[n])))
  const trip = new Trip(docs, { pubkey: me.pubkey, device: me.device })
  const closers: (() => void)[] = [() => ps.forEach((p) => void p.destroy())]

  let sync: TripSync | null = null
  const ref = reg.trip(tripId)
  if (withSync && ref) {
    const relays = DEFAULT_RELAYS.map((url) => new WsRelay(url))
    const lastKey = `lastSync:${tripId}`
    sync = new TripSync({
      tripId,
      key: await importKey(b64url.dec(ref.key)),
      // 只有這兩個文件交給同步層；priv 與 device 永遠不會進到這裡。
      docs: { main: docs.main, comments: docs.comments },
      secretKey: hex.dec(me.sk),
      device: me.device,
      relays,
      lastSync: {
        get: () => Number(localStorage.getItem(lastKey)) || null,
        set: (t) => localStorage.setItem(lastKey, String(t)),
      },
    })
    await sync.start()
    // 手機切回畫面或恢復網路時，立刻重連，不等重試計時。
    // 切到背景或關掉之前，把剛改的東西馬上送出，不等 2.5 秒的計時（手機常常改完就切走）。
    const kick = () => {
      if (document.visibilityState === 'visible') relays.forEach((r) => r.kick())
      else sync!.flush()
    }
    document.addEventListener('visibilitychange', kick)
    addEventListener('online', kick)
    closers.push(() => {
      document.removeEventListener('visibilitychange', kick)
      removeEventListener('online', kick)
      sync!.stop()
      relays.forEach((r) => r.close())
    })
  }
  return { trip, sync, close: () => closers.forEach((f) => f()) }
}

/**
 * 把一份行程從這支手機移除：登記簿、金鑰、四個文件（含私人清單與訂位代號）全部清掉。
 * 只影響這支手機，其他成員不受影響；之後要再看，得重新被邀請或從備份還原。
 * 呼叫前要先離開那份行程的畫面（文件還開著的話，瀏覽器會等它關閉才真的刪）。
 */
export async function removeTrip(reg: Registry, tripId: string): Promise<void> {
  reg.forgetTrip(tripId)
  try {
    localStorage.removeItem(`lastSync:${tripId}`)
  } catch {
    // 沒有 localStorage（測試環境）就略過。
  }
  await Promise.all(Object.keys(newTripDocs()).map((n) => clearDocument(`trip:${tripId}:${n}`)))
}

export async function createTrip(
  reg: Registry,
  input: { title: string; startDate: string; endDate: string },
): Promise<string> {
  const me = reg.me()
  if (!me) throw new Error('尚未設定暱稱')
  const id = newId()
  reg.upsertTrip({ id, ...input, key: b64url.enc(newKeyBytes()) })
  const { trip, close } = await openTrip(reg, id, false)
  trip.init({ id, ...input }, me.nickname)
  close()
  return id
}

/** 邀請連結：行程 ID 與金鑰都放在 # 後面，瀏覽器不會把這段送給任何伺服器。 */
export function inviteLink(ref: TripRef): string {
  return `${location.origin}${location.pathname}#/join/${ref.id}/${ref.key}`
}

/**
 * 從一段文字裡找出邀請（行程 ID 與金鑰）。接受完整連結、只有 # 之後的部分，
 * 也容忍通訊軟體加上的前後文字、換行或把符號轉成 %xx。金鑰長度不對就當成沒有。
 */
export function parseInvite(text: string): { id: string; key: string } | null {
  let s = text
  try {
    s = decodeURIComponent(text)
  } catch {
    // 不是合法的 %xx 就照原樣找。
  }
  const m = s.replace(/\s+/g, '').match(/#\/join\/([0-9a-fA-F-]{36})\/([A-Za-z0-9_-]{43})(?![A-Za-z0-9_-])/)
  return m ? { id: m[1].toLowerCase(), key: m[2] } : null
}

/** 從邀請連結加入：先記下金鑰，內容等同步層從中繼站抓回來。 */
export function acceptInvite(reg: Registry, id: string, key: string): void {
  let ok = false
  try {
    ok = b64url.dec(key).length === 32
  } catch {
    // 下面一併當成不完整。
  }
  if (!ok) throw new Error('邀請連結不完整，請對方重新複製一次')
  if (reg.trip(id)) return
  reg.upsertTrip({ id, key, title: '（同步中的行程）', startDate: '', endDate: '' })
}
