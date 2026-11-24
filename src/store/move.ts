// 搬家碼：把「我是誰」和手上的行程，從一個地方帶到另一個地方。
//
// iPhone 上，Safari 和加到主畫面的 App 各存各的資料。只靠邀請連結搬過去的話，
// 主畫面的 App 會是一個全新的身分，成員名單上就多出第二個自己。
// 搬家碼是一段文字：身分金鑰、每份行程的金鑰和我的私人清單。在原本的地方複製、到新的地方貼上，
// 就還是同一個人。行程內容不在裡面，貼上之後從中繼站同步回來。訂位代號也不在裡面（跟備份檔一樣）。
//
// 拿到搬家碼的人可以用我的身分看和改所有行程，所以只給自己用，不要傳給別人。
import * as Y from 'yjs'
import { getPublicKey } from 'nostr-tools/pure'
import { b64, b64url, hex } from '../sync/crypto'
import { openTrip, type Registry } from './local'

const PREFIX = 'trip-share-move:'

export interface MoveTrip {
  id: string
  title: string
  startDate: string
  endDate: string
  key: string
  theme?: string
  /** 私人清單那份文件的完整內容（base64）。 */
  priv: string
}

export interface MoveData {
  v: 1
  me: { pubkey: string; sk: string; nickname: string }
  trips: MoveTrip[]
}

/** 產生搬家碼。 */
export async function createMove(reg: Registry): Promise<string> {
  const me = reg.me()
  if (!me) throw new Error('尚未設定暱稱')
  const trips: MoveTrip[] = []
  for (const ref of reg.trips()) {
    const { trip, close } = await openTrip(reg, ref.id, false)
    trips.push({
      id: ref.id, title: ref.title, startDate: ref.startDate, endDate: ref.endDate, key: ref.key,
      ...(ref.theme && { theme: ref.theme }),
      priv: b64.enc(Y.encodeStateAsUpdate(trip.docs.priv)),
    })
    close()
  }
  const data: MoveData = { v: 1, me: { pubkey: me.pubkey, sk: me.sk, nickname: me.nickname }, trips }
  return PREFIX + b64url.enc(new TextEncoder().encode(JSON.stringify(data)))
}

const isStr = (v: unknown): v is string => typeof v === 'string'

function keyOk(key: string): boolean {
  try {
    return b64url.dec(key).length === 32
  } catch {
    return false
  }
}

/** 從一段文字裡找出搬家碼。不是搬家碼、被截斷、或內容對不上（私鑰和公鑰不是一對）都回 null。 */
export function parseMove(text: string): MoveData | null {
  const m = text.replace(/\s+/g, '').match(/trip-share-move:([A-Za-z0-9_-]+)/)
  if (!m) return null
  try {
    const d = JSON.parse(new TextDecoder().decode(b64url.dec(m[1]))) as Partial<MoveData>
    const me = d.me
    if (d.v !== 1 || !me || !isStr(me.sk) || !isStr(me.pubkey) || !isStr(me.nickname) || !me.nickname.trim()) return null
    if (!/^[0-9a-f]{64}$/.test(me.sk) || getPublicKey(hex.dec(me.sk)) !== me.pubkey) return null
    if (!Array.isArray(d.trips)) return null
    const ok = d.trips.every((t) =>
      t && /^[0-9a-f-]{36}$/.test(t.id) && isStr(t.title) && isStr(t.startDate) && isStr(t.endDate) &&
      isStr(t.key) && keyOk(t.key) && isStr(t.priv) && (t.theme === undefined || isStr(t.theme)))
    return ok ? (d as MoveData) : null
  } catch {
    return null
  }
}

/** 這支手機上已經有別的身分：套用搬家碼會把它換掉。 */
export function moveReplaces(reg: Registry, data: MoveData): boolean {
  const me = reg.me()
  return !!me && me.pubkey !== data.me.pubkey
}

export interface MoveResult {
  /** adopted：這裡原本沒有身分；same：本來就是同一個；replaced：換掉了原本的身分。 */
  identity: 'adopted' | 'same' | 'replaced'
  /** 搬家碼帶來的行程數。 */
  trips: number
  /** 換身分時，順手從成員名單拿掉「多出來的自己」的行程數。 */
  cleaned: number
}

/**
 * 套用搬家碼：身分換成搬家碼裡的，行程（金鑰）和私人清單帶進來。
 *
 * 這裡原本有別的身分時（已經用新身分重新加入過了）：先用那個身分把自己從兩邊都有的行程退出，
 * 成員名單上才不會留著重複的那一個；只在這裡有的行程不動。改動先寫在手機上，打開行程時同步給其他人。
 */
export async function applyMove(reg: Registry, data: MoveData): Promise<MoveResult> {
  const before = reg.me()
  const identity = !before ? 'adopted' : before.pubkey === data.me.pubkey ? 'same' : 'replaced'
  let cleaned = 0
  if (before && identity === 'replaced') {
    for (const t of data.trips) {
      if (!reg.trip(t.id)) continue
      const { trip, close } = await openTrip(reg, t.id, false)
      const dup = trip.members.get(before.pubkey)
      if (dup && !dup.deleted) {
        trip.members.remove(before.pubkey)
        cleaned++
      }
      close()
    }
  }
  if (identity !== 'same') reg.adoptIdentity(data.me)
  for (const t of data.trips) {
    reg.upsertTrip({ id: t.id, title: t.title, startDate: t.startDate, endDate: t.endDate, theme: t.theme, key: t.key })
    const { trip, close } = await openTrip(reg, t.id, false)
    Y.applyUpdate(trip.docs.priv, b64.dec(t.priv))
    close()
  }
  return { identity, trips: data.trips.length, cleaned }
}
