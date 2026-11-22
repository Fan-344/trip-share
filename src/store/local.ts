import * as Y from 'yjs'
import { IndexeddbPersistence, clearDocument } from 'y-indexeddb'
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure'
import { makeRekey } from '../model/rekey'
import { newId } from '../model/table'
import { Trip, newTripDocs, type TripDocs } from '../model/trip'
import type { Actor } from '../model/types'
import { b64url, hex, importKey, newKeyBytes } from '../sync/crypto'
import { BlobNet } from '../sync/blobs'
import { TripSync } from '../sync/engine'
import { WsRelay } from '../sync/relay'
import { BlobStore } from './blobs'
import { PhotoStore } from './photos'

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
  /**
   * 剛接受了這份行程的邀請、還沒完成加入。
   * 被移出的人平常不會自己把自己加回成員；有了這個記號（代表有人重新邀請他）才會。加入完成就清掉。
   */
  invited?: boolean
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

  /** 換成新的行程金鑰（有人被移出後換的，或用新的邀請重新加入）。 */
  setTripKey(id: string, key: string): void {
    const trips = this.doc.getMap<TripRef>('trips')
    const old = trips.get(id)
    if (old && old.key !== key) trips.set(id, { ...old, key })
  }

  /** 改自己的暱稱（之後加入的行程用新的；已加入的行程要各自改成員名稱）。 */
  rename(nickname: string): void {
    this.doc.getMap('me').set('nickname', nickname)
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
    trips.set(ref.id, {
      ...ref, key, addedAt: old?.addedAt ?? Date.now(), ...(theme && { theme }), ...(old?.invited && { invited: true }),
    })
  }

  /** 記下（或清掉）「剛接受了這份行程的邀請」。見 TripRef.invited。 */
  setInvited(id: string, invited: boolean): void {
    const trips = this.doc.getMap<TripRef>('trips')
    const old = trips.get(id)
    if (!old || !!old.invited === invited) return
    const { invited: _drop, ...rest } = old
    trips.set(id, invited ? { ...rest, invited: true } : rest)
  }
}

export interface OpenTrip {
  trip: Trip
  sync: TripSync | null
  /** 這份行程的照片（手機上的檔案＋中繼站上的檔案）。 */
  photos: PhotoStore
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

  const blobs = await BlobStore.open(tripId)
  closers.push(() => blobs.close())

  let sync: TripSync | null = null
  let photos = new PhotoStore(trip, blobs, null)
  const ref = reg.trip(tripId)
  if (withSync && ref) {
    const relays = DEFAULT_RELAYS.map((url) => new WsRelay(url))
    const lastKey = `lastSync:${tripId}`
    const key = await importKey(b64url.dec(ref.key))
    const verifyKey = `photoVerify:${tripId}`
    // 照片走同一批中繼站連線，但跟行程內容分開傳
    photos = new PhotoStore(trip, blobs, new BlobNet({ tripId, key, secretKey: hex.dec(me.sk), relays }), {
      get: () => Number(localStorage.getItem(verifyKey)) || 0,
      set: (t) => localStorage.setItem(verifyKey, String(t)),
    })
    photos.start()
    closers.push(() => photos.stop())
    sync = new TripSync({
      tripId,
      key,
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
  return { trip, sync, photos, close: () => closers.forEach((f) => f()) }
}

/**
 * 把一份行程從這支手機移除：登記簿、金鑰、四個文件（含私人清單與訂位代號）、照片檔全部清掉。
 * 只影響這支手機，其他成員不受影響；之後要再看，得重新被邀請或從備份還原。
 * 呼叫前要先離開那份行程的畫面（文件還開著的話，瀏覽器會等它關閉才真的刪）。
 */
export async function removeTrip(reg: Registry, tripId: string): Promise<void> {
  reg.forgetTrip(tripId)
  try {
    localStorage.removeItem(`lastSync:${tripId}`)
    localStorage.removeItem(`photoVerify:${tripId}`)
  } catch {
    // 沒有 localStorage（測試環境）就略過。
  }
  await Promise.all([
    ...Object.keys(newTripDocs()).map((n) => clearDocument(`trip:${tripId}:${n}`)),
    BlobStore.destroy(tripId),
  ])
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

/**
 * 改我的顯示名稱，並套用到這支手機上的每一份行程（成員名單裡的我）。
 * 各行程的改動先寫在手機上，下次打開那份行程時就會同步給其他人。回傳改了幾份行程。
 */
export async function renameEverywhere(reg: Registry, nickname: string): Promise<number> {
  const me = reg.me()
  if (!me) throw new Error('尚未設定暱稱')
  reg.rename(nickname)
  let changed = 0
  for (const ref of reg.trips()) {
    const { trip, close } = await openTrip(reg, ref.id, false)
    const mine = trip.members.get(me.pubkey)
    if (mine && !mine.deleted && mine.nickname !== nickname) {
      trip.members.update(me.pubkey, { nickname })
      changed++
    }
    close()
  }
  return changed
}

/** 邀請連結的有效期限（規格書第 11 節）。 */
export const INVITE_DAYS = 7

/**
 * 邀請連結：行程 ID、金鑰與到期時間都放在 # 後面，瀏覽器不會把這段送給任何伺服器。
 *
 * 到期時間是 App 自己檢查的：過期的連結 App 不會接受，但連結裡的金鑰本身並沒有失效
 * （沒有伺服器可以讓它失效）。真的要讓流出去的連結沒用，要把人移出、換金鑰。
 */
export function inviteLink(ref: TripRef, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + INVITE_DAYS * 86400
  return `${location.origin}${location.pathname}#/join/${ref.id}/${ref.key}/${exp}`
}

export interface Invite {
  id: string
  key: string
  /** 到期時間（毫秒）；舊版的連結沒有，就是 null。 */
  expiresAt: number | null
}

/**
 * 從一段文字裡找出邀請（行程 ID、金鑰、到期時間）。接受完整連結、只有 # 之後的部分，
 * 也容忍通訊軟體加上的前後文字、換行或把符號轉成 %xx。金鑰長度不對就當成沒有。
 */
export function parseInvite(text: string): Invite | null {
  let s = text
  try {
    s = decodeURIComponent(text)
  } catch {
    // 不是合法的 %xx 就照原樣找。
  }
  const m = s.replace(/\s+/g, '').match(/#\/join\/([0-9a-fA-F-]{36})\/([A-Za-z0-9_-]{43})(?:\/(\d{9,11}))?(?![A-Za-z0-9_-])/)
  return m ? { id: m[1].toLowerCase(), key: m[2], expiresAt: m[3] ? Number(m[3]) * 1000 : null } : null
}

/**
 * 從邀請連結加入：先記下金鑰，內容等同步層從中繼站抓回來。
 * 手機上已經有這份行程、但邀請裡的金鑰不一樣時（之前被移出或金鑰換過，現在重新受邀），換成邀請裡的那把。
 */
export function acceptInvite(reg: Registry, invite: Invite, now = Date.now()): void {
  let ok = false
  try {
    ok = b64url.dec(invite.key).length === 32
  } catch {
    // 下面一併當成不完整。
  }
  if (!ok) throw new Error('邀請連結不完整，請對方重新複製一次')
  if (invite.expiresAt !== null && now > invite.expiresAt) {
    throw new Error(`這個邀請已經過期了（邀請 ${INVITE_DAYS} 天內有效）。請對方重新顯示 QR Code 或再傳一次連結。`)
  }
  if (reg.trip(invite.id)) reg.setTripKey(invite.id, invite.key)
  else reg.upsertTrip({ id: invite.id, key: invite.key, title: '（同步中的行程）', startDate: '', endDate: '' })
  reg.setInvited(invite.id, true)
}

/**
 * 移出成員時要不要換行程金鑰。
 *
 * false（目前，親友測試階段）：只把人從成員名單拿掉。他的 App 會顯示「你已經不在這份行程裡」並停止顯示內容，
 * 但他手上還是有行程金鑰——這是請他離開，不是技術上擋住他。好處是簡單、不需要網路、不會有人因為沒跟上新金鑰而掉出去。
 *
 * true：換一把新金鑰，只交給留下來的人（model/rekey.ts）。被移出的人之後的內容真的看不到。
 * 程式和測試都留著，要啟用改這裡就好。
 */
export const ROTATE_KEY_ON_REMOVE = false

/**
 * 把一個成員移出行程。
 * 換金鑰的模式需要網路：換金鑰的紀錄一定要先送到中繼站，其他人才找得到新金鑰；送不出去就整個取消。
 */
export async function kickMember(reg: Registry, trip: Trip, sync: TripSync | null, pubkey: string): Promise<void> {
  const me = reg.me()
  const ref = reg.trip(trip.meta.id)
  if (!me || !ref) throw new Error('找不到這份行程')
  if (!ROTATE_KEY_ON_REMOVE) {
    trip.members.remove(pubkey)
    return
  }
  if (!sync || sync.status().connected === 0) throw new Error('現在沒有連上網路。移出成員要換金鑰並通知其他人，請連上網路後再試。')
  const { entry, newKey } = await makeRekey({
    id: newId(), by: me.pubkey, bySk: hex.dec(me.sk), oldKey: ref.key, removed: [pubkey],
    recipients: trip.phoneMembers().filter((p) => p !== pubkey),
  })
  trip.kick(pubkey, entry)
  if ((await sync.publishSnapshotNow()) === 0) {
    trip.undoKick(pubkey, entry.id)
    throw new Error('送不出去，沒有任何一台中繼站收下。已經取消這次移出，請稍後再試。')
  }
  reg.setTripKey(ref.id, newKey)
}
