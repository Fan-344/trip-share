// 備份與還原（規格書第 7 節）。
//
// 備份檔是一個 JSON：身分金鑰、每份行程的金鑰與完整內容（主文件、留言、私人清單）。
// 訂位代號不在裡面——它放在另一個文件（device），這裡從頭到尾不去讀它。
// 設了密碼就整包加密；沒設的話，拿到檔案的人可以看到所有行程，並以你的身分修改。
import * as Y from 'yjs'
import { newId } from '../model/table'
import { b64, b64url, newKeyBytes, sha256Hex } from '../sync/crypto'
import { openTrip, type Registry } from './local'

const FORMAT = 'trip-share-backup'
const PBKDF2_ROUNDS = 250_000

export interface BackupTrip {
  id: string
  title: string
  startDate: string
  endDate: string
  key: string
  theme?: string
  /** 三個 Yjs 文件的完整內容（base64）。 */
  main: string
  comments: string
  priv: string
  /** 照片檔（雜湊 → base64）。行程裡沒有照片就沒有這個欄位。 */
  blobs?: Record<string, string>
}

export interface BackupData {
  format: typeof FORMAT
  version: 1
  createdAt: number
  /**
   * 身分金鑰。完整備份才有；單趟行程的檔案沒有——
   * 那種檔案可能會傳給別人或長期留著，不該帶著「能以我的身分修改所有行程」的鑰匙。
   */
  me?: { pubkey: string; sk: string; nickname: string }
  trips: BackupTrip[]
}

interface Sealed {
  format: typeof FORMAT
  version: 1
  sealed: { salt: string; iv: string; data: string }
}

export class BackupError extends Error {
  constructor(readonly code: 'bad-file' | 'need-password' | 'bad-password') {
    super({ 'bad-file': '這不是旅遊共編的備份檔，或檔案已損壞。', 'need-password': '這份備份有密碼。', 'bad-password': '密碼不對。' }[code])
  }
}

const buf = (u: Uint8Array) => u as unknown as BufferSource

async function passwordKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', buf(new TextEncoder().encode(password)), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: buf(salt), iterations: PBKDF2_ROUNDS },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  )
}

/**
 * 產生備份檔的內容。（備份時間由介面在檔案真的存出去之後才記。）
 * - 不給 onlyTrip：完整備份，含身分與所有行程。
 * - 給 onlyTrip（行程 ID）：只有那一趟，含它的金鑰和我的私人清單，不含身分。
 */
export async function createBackup(reg: Registry, password = '', onlyTrip = ''): Promise<string> {
  const me = reg.me()
  if (!me) throw new Error('尚未設定暱稱')
  const trips: BackupTrip[] = []
  for (const ref of reg.trips()) {
    if (onlyTrip && ref.id !== onlyTrip) continue
    const { trip, photos, close } = await openTrip(reg, ref.id, false)
    const { main, comments, priv } = trip.docs
    // 照片檔不在同步文件裡，要另外帶：只帶目前還有被用到、而且手機上有的
    const blobs: Record<string, string> = {}
    for (const p of trip.photos.all()) {
      if (!p.hash || blobs[p.hash]) continue
      const data = await photos.blobs.get(p.hash)
      if (data) blobs[p.hash] = b64.enc(data)
    }
    trips.push({
      id: ref.id, title: ref.title, startDate: ref.startDate, endDate: ref.endDate, key: ref.key,
      ...(ref.theme && { theme: ref.theme }),
      main: b64.enc(Y.encodeStateAsUpdate(main)),
      comments: b64.enc(Y.encodeStateAsUpdate(comments)),
      priv: b64.enc(Y.encodeStateAsUpdate(priv)),
      ...(Object.keys(blobs).length > 0 && { blobs }),
    })
    close()
  }
  const data: BackupData = {
    format: FORMAT, version: 1, createdAt: Date.now(),
    ...(!onlyTrip && { me: { pubkey: me.pubkey, sk: me.sk, nickname: me.nickname } }),
    trips,
  }
  if (onlyTrip && trips.length === 0) throw new Error('找不到這份行程')
  if (!password) return JSON.stringify(data)

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: buf(iv) }, await passwordKey(password, salt), buf(new TextEncoder().encode(JSON.stringify(data))),
  )
  const sealed: Sealed = {
    format: FORMAT, version: 1,
    sealed: { salt: b64.enc(salt), iv: b64.enc(iv), data: b64.enc(new Uint8Array(cipher)) },
  }
  return JSON.stringify(sealed)
}

const isStr = (v: unknown): v is string => typeof v === 'string'

function validate(d: unknown): BackupData {
  const x = d as Partial<BackupData>
  const ok = x?.format === FORMAT && x.version === 1 && typeof x.createdAt === 'number' &&
    (x.me === undefined || (x.me && isStr(x.me.pubkey) && isStr(x.me.sk) && isStr(x.me.nickname))) && Array.isArray(x.trips) &&
    x.trips.every((t) => t && isStr(t.id) && isStr(t.title) && isStr(t.key) && isStr(t.main) && isStr(t.comments) && isStr(t.priv))
  if (!ok) throw new BackupError('bad-file')
  return x as BackupData
}

/** 讀備份檔。有密碼卻沒給會丟 need-password，密碼錯丟 bad-password，其他問題丟 bad-file。 */
export async function readBackup(text: string, password = ''): Promise<BackupData> {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new BackupError('bad-file')
  }
  const sealed = (raw as Partial<Sealed>)?.sealed
  if (!sealed) return validate(raw)
  if ((raw as Sealed).format !== FORMAT) throw new BackupError('bad-file')
  if (!password) throw new BackupError('need-password')
  let plain: ArrayBuffer
  try {
    plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: buf(b64.dec(sealed.iv)) }, await passwordKey(password, b64.dec(sealed.salt)), buf(b64.dec(sealed.data)),
    )
  } catch {
    throw new BackupError('bad-password')
  }
  try {
    return validate(JSON.parse(new TextDecoder().decode(plain)))
  } catch {
    throw new BackupError('bad-file')
  }
}

/**
 * merge：合併回原行程。備份裡的內容和手機上現有的內容合在一起，不會把行程退回舊版。
 * copy：另存成舊版副本。手機上已經有的行程，另外建一份獨立的副本（新的行程、新的金鑰，不跟原行程同步）。
 * 兩種模式下，手機上沒有的行程都會直接還原回來。
 */
export type RestoreMode = 'merge' | 'copy'

export interface RestoreResult {
  /**
   * adopted：手機上沒有身分，用了備份裡的；same：本來就是同一個；
   * kept：手機上已有別的身分，沒有換；none：檔案裡沒有身分（單趟行程的檔案），用手機上原本的。
   */
  identity: 'adopted' | 'same' | 'kept' | 'none'
  added: string[]
  merged: string[]
  copied: string[]
}

export async function restoreBackup(reg: Registry, data: BackupData, mode: RestoreMode): Promise<RestoreResult> {
  const before = reg.me()
  if (!before && !data.me) throw new Error('這是單趟行程的檔案，裡面沒有身分。請先取一個暱稱，再從首頁載入。')
  const identity = !data.me ? 'none' : !before ? 'adopted' : before.pubkey === data.me.pubkey ? 'same' : 'kept'
  if (!before && data.me) reg.adoptIdentity(data.me)

  const result: RestoreResult = { identity, added: [], merged: [], copied: [] }
  const stamp = new Date(data.createdAt)
  const label = `${stamp.getMonth() + 1}/${stamp.getDate()}`

  for (const t of data.trips) {
    const exists = !!reg.trip(t.id)
    const asCopy = exists && mode === 'copy'
    const id = asCopy ? newId() : t.id
    const title = asCopy ? `${t.title}（${label} 的副本）` : t.title
    // 合併到手機上已有的行程時不動登記簿：標題、日期、金鑰都以手機上現有的為準。
    if (!exists || asCopy) {
      reg.upsertTrip({
        id, title, startDate: t.startDate, endDate: t.endDate, theme: t.theme,
        key: asCopy ? b64url.enc(newKeyBytes()) : t.key,
      })
    }
    const { trip, photos, close } = await openTrip(reg, id, false)
    Y.applyUpdate(trip.docs.main, b64.dec(t.main))
    Y.applyUpdate(trip.docs.comments, b64.dec(t.comments))
    Y.applyUpdate(trip.docs.priv, b64.dec(t.priv))
    for (const [hash, data] of Object.entries(t.blobs ?? {})) {
      const bytes = b64.dec(data)
      // 檔名就是內容的雜湊；對不上的（檔案被改過或壞掉）不收
      if ((await sha256Hex(bytes)) !== hash) continue
      await photos.blobs.put(hash, bytes)
      // 副本是新的行程、新的金鑰，中繼站上沒有這些照片：記成還沒送，打開後會補傳
      if (asCopy) await photos.blobs.setPending(hash, true)
    }
    if (asCopy) trip.rebrand(id, title)
    close()
    ;(asCopy ? result.copied : exists ? result.merged : result.added).push(title)
  }
  return result
}
