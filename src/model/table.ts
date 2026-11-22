import * as Y from 'yjs'
import type { Actor, HistoryEntry, HistoryOp, Meta } from './types'

export const newId = (): string => crypto.randomUUID()

/**
 * 建立時間，保證同一支手機上每筆都比前一筆晚至少 1 毫秒。
 * 一口氣建很多筆（貼上一整份清單、還原、複製）時，才不會因為時間相同而亂了先後順序。
 */
let lastStamp = 0
function nextStamp(): number {
  lastStamp = Math.max(Date.now(), lastStamp + 1)
  return lastStamp
}

type Rec = Y.Map<unknown>

interface Tombstone {
  by: string
  at: number
  /** 刪除當下看到的各裝置修改次數。 */
  seen: Record<string, number>
}

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b)

/**
 * 一個集合（例如 items）：Y.Map<id, Y.Map<欄位, 值>>。
 *
 * 衝突規則（規格書第 6 節）怎麼落在結構上：
 * - 每個欄位各自是 Y.Map 的一個 key，所以兩人改不同欄位都會保留，改同一欄位由 Yjs 的邏輯時鐘決定誰贏。
 * - 每筆有 rev：裝置 → 修改次數。每個裝置只寫自己那格，不會互相衝突。
 * - 刪除不移除資料，只寫入墓碑並記下當時的 rev。之後只要有任何裝置的 rev 超過墓碑記下的值，
 *   代表「刪除的人沒看過這次修改」，這筆就視為沒被刪 →「一人刪除、一人修改，保留修改的版本」。
 */
export class Table<T extends object> {
  readonly map: Y.Map<Rec>

  constructor(
    readonly doc: Y.Doc,
    readonly name: string,
    private readonly actor: Actor,
    private readonly history: Y.Array<HistoryEntry> | null = null,
    /** 建立時要一起放進去的巢狀 Y.Map 欄位（例如清單項目的 checks）。 */
    private readonly nested: string[] = [],
  ) {
    this.map = doc.getMap(name) as Y.Map<Rec>
  }

  create(fields: T, id: string = newId()): string {
    this.doc.transact(() => {
      const rec: Rec = new Y.Map()
      this.map.set(id, rec)
      const now = nextStamp()
      rec.set('id', id)
      rec.set('createdAt', now)
      rec.set('createdBy', this.actor.pubkey)
      rec.set('rev', new Y.Map())
      for (const k of this.nested) rec.set(k, new Y.Map())
      for (const [k, v] of Object.entries(fields)) rec.set(k, v)
      this.bump(rec)
      this.log('create', id)
    })
    return id
  }

  update(id: string, patch: Partial<T>): void {
    const rec = this.map.get(id)
    if (!rec) return
    this.doc.transact(() => {
      let changed = false
      for (const [k, v] of Object.entries(patch)) {
        const old = rec.get(k)
        if (same(old, v)) continue
        rec.set(k, v)
        this.log('update', id, k, old)
        changed = true
      }
      if (changed) this.bump(rec)
    })
  }

  /** 改巢狀結構用：fn 內直接動 Y 型別，這裡負責記次數與修改紀錄。 */
  mutate(id: string, field: string, old: unknown, fn: (rec: Rec) => void): void {
    const rec = this.map.get(id)
    if (!rec) return
    this.doc.transact(() => {
      fn(rec)
      this.bump(rec)
      this.log('update', id, field, old)
    })
  }

  remove(id: string): void {
    const rec = this.map.get(id)
    if (!rec || isDeleted(rec)) return
    this.doc.transact(() => {
      const stone: Tombstone = {
        by: this.actor.pubkey,
        at: Date.now(),
        seen: (rec.get('rev') as Y.Map<number>).toJSON(),
      }
      rec.set('deleted', stone)
      this.log('delete', id)
    })
  }

  restore(id: string): void {
    const rec = this.map.get(id)
    if (!rec || !isDeleted(rec)) return
    this.doc.transact(() => {
      rec.set('deleted', null)
      this.bump(rec)
      this.log('restore', id)
    })
  }

  raw(id: string): Rec | undefined {
    return this.map.get(id)
  }

  get(id: string): (T & Meta) | undefined {
    const rec = this.map.get(id)
    return rec ? read<T>(rec) : undefined
  }

  all(includeDeleted = false): (T & Meta)[] {
    const out: (T & Meta)[] = []
    this.map.forEach((rec) => {
      const r = read<T>(rec)
      if (includeDeleted || !r.deleted) out.push(r)
    })
    return out.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
  }

  private bump(rec: Rec): void {
    const rev = rec.get('rev') as Y.Map<number>
    rev.set(this.actor.device, (rev.get(this.actor.device) ?? 0) + 1)
    rec.set('updatedAt', Date.now())
    rec.set('updatedBy', this.actor.pubkey)
  }

  private log(op: HistoryOp, recId: string, field?: string, old?: unknown): void {
    if (!this.history) return
    const e: HistoryEntry = { id: newId(), at: Date.now(), by: this.actor.pubkey, coll: this.name, recId, op }
    if (field !== undefined) e.field = field
    if (old !== undefined) e.old = old
    this.history.push([e])
  }
}

export function isDeleted(rec: Rec): boolean {
  const stone = rec.get('deleted') as Tombstone | null | undefined
  if (!stone) return false
  let editedAfter = false
  ;(rec.get('rev') as Y.Map<number>).forEach((n, device) => {
    if (n > (stone.seen[device] ?? 0)) editedAfter = true
  })
  return !editedAfter
}

function read<T>(rec: Rec): T & Meta {
  const out: Record<string, unknown> = {}
  rec.forEach((v, k) => {
    if (!(v instanceof Y.Map)) out[k] = v
  })
  let revCount = 0
  ;(rec.get('rev') as Y.Map<number>).forEach((n) => (revCount += n))
  out.deleted = isDeleted(rec)
  out.revCount = revCount
  return out as T & Meta
}
