import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'
import { newId } from '../model/table'
import { Trip, newTripDocs, type TripDocs } from '../model/trip'
import type { Actor } from '../model/types'

// 本機儲存（規格書第 5 節）：每個 Yjs 文件各自存進 IndexedDB。

async function persist(name: string, doc: Y.Doc): Promise<IndexeddbPersistence> {
  const p = new IndexeddbPersistence(name, doc)
  await p.whenSynced
  return p
}

export interface Me extends Actor {
  nickname: string
}

export interface TripRef {
  id: string
  title: string
  startDate: string
  endDate: string
  addedAt: number
}

const randomHex = (bytes: number) =>
  [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('')

/** 這支手機的登記簿：我是誰、參加過哪些行程。只存本機。 */
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
    return m.pubkey && m.device && m.nickname ? (m as Me) : null
  }

  setNickname(nickname: string): void {
    const m = this.doc.getMap('me')
    this.doc.transact(() => {
      // TODO（同步層）：pubkey 改成真正的 Nostr 金鑰對；目前是同樣長度的隨機佔位值。
      if (!m.get('pubkey')) m.set('pubkey', randomHex(32))
      if (!m.get('device')) m.set('device', randomHex(8))
      m.set('nickname', nickname)
    })
  }

  trips(): TripRef[] {
    return (Object.values(this.doc.getMap('trips').toJSON()) as TripRef[]).sort((a, b) =>
      b.startDate.localeCompare(a.startDate),
    )
  }

  upsertTrip(ref: Omit<TripRef, 'addedAt'>): void {
    const trips = this.doc.getMap<TripRef>('trips')
    const old = trips.get(ref.id)
    if (old && old.title === ref.title && old.startDate === ref.startDate && old.endDate === ref.endDate) return
    trips.set(ref.id, { ...ref, addedAt: old?.addedAt ?? Date.now() })
  }
}

export interface OpenTrip {
  trip: Trip
  close: () => void
}

export async function openTrip(tripId: string, me: Actor): Promise<OpenTrip> {
  const docs = newTripDocs()
  const names = Object.keys(docs) as (keyof TripDocs)[]
  const ps = await Promise.all(names.map((n) => persist(`trip:${tripId}:${n}`, docs[n])))
  return {
    trip: new Trip(docs, { pubkey: me.pubkey, device: me.device }),
    close: () => ps.forEach((p) => void p.destroy()),
  }
}

export async function createTrip(
  reg: Registry,
  input: { title: string; startDate: string; endDate: string },
): Promise<string> {
  const me = reg.me()
  if (!me) throw new Error('尚未設定暱稱')
  const id = newId()
  const { trip, close } = await openTrip(id, me)
  trip.init({ id, ...input }, me.nickname)
  reg.upsertTrip({ id, ...input })
  close()
  return id
}
