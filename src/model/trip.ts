import * as Y from 'yjs'
import { Table, newId } from './table'
import type {
  Actor, CheckState, Comment, DayInfo, Flight, HistoryEntry, Item, List, ListItem, ListKind,
  Member, Meta, Pnr, Role, Stay, TripMeta,
} from './types'

export const SCHEMA = 1

/**
 * 一份行程的四個 Yjs 文件。哪些資料能離開手機，由「放在哪個文件」決定，而不是靠程式記得過濾：
 * - main、comments：交給同步層，全體成員共享。
 * - priv：私人清單。不同步，但會進使用者自己的備份。
 * - device：訂位代號。不同步、不進備份，永遠只留在這支手機。
 */
export interface TripDocs {
  main: Y.Doc
  comments: Y.Doc
  priv: Y.Doc
  device: Y.Doc
}

export const newTripDocs = (): TripDocs => ({
  main: new Y.Doc(),
  comments: new Y.Doc(),
  priv: new Y.Doc(),
  device: new Y.Doc(),
})

interface Check {
  by: string
  at: number
}

export type ListItemView = ListItem & Meta & CheckState

export class Trip {
  readonly history: Y.Array<HistoryEntry>
  readonly members: Table<Member>
  readonly flights: Table<Flight>
  readonly stays: Table<Stay>
  readonly items: Table<Item>
  readonly days: Table<DayInfo>
  readonly lists: Table<List>
  readonly listItems: Table<ListItem>
  readonly comments: Table<Comment>
  readonly privLists: Table<List>
  readonly privListItems: Table<ListItem>
  private readonly metaMap: Y.Map<unknown>
  private readonly pnrs: Y.Map<Pnr>

  constructor(readonly docs: TripDocs, readonly actor: Actor) {
    const { main, comments, priv, device } = docs
    this.history = main.getArray('history')
    this.metaMap = main.getMap('trip')
    this.members = new Table(main, 'members', actor, this.history)
    this.flights = new Table(main, 'flights', actor, this.history)
    this.stays = new Table(main, 'stays', actor, this.history)
    this.items = new Table(main, 'items', actor, this.history)
    this.days = new Table(main, 'days', actor, this.history)
    this.lists = new Table(main, 'lists', actor, this.history)
    this.listItems = new Table(main, 'listItems', actor, this.history, ['checks'])
    this.comments = new Table(comments, 'comments', actor)
    this.privLists = new Table(priv, 'lists', actor)
    this.privListItems = new Table(priv, 'listItems', actor, null, ['checks'])
    this.pnrs = device.getMap('pnrs')
  }

  // ---- 行程本身 ----

  /** 建立者第一次呼叫：寫入行程資料，並把自己設為管理員。 */
  init(meta: Omit<TripMeta, 'schema'>, nickname: string): void {
    this.docs.main.transact(() => {
      for (const [k, v] of Object.entries({ ...meta, schema: SCHEMA })) this.metaMap.set(k, v)
      this.join(nickname, 'admin')
    })
  }

  get meta(): TripMeta {
    return this.metaMap.toJSON() as TripMeta
  }

  /** 把這份內容變成另一份獨立的行程（從備份另存成舊版副本時用）。不留修改紀錄。 */
  rebrand(id: string, title: string): void {
    this.docs.main.transact(() => {
      this.metaMap.set('id', id)
      this.metaMap.set('title', title)
    })
  }

  updateMeta(patch: Partial<Pick<TripMeta, 'title' | 'startDate' | 'endDate' | 'theme' | 'desc'>>): void {
    this.docs.main.transact(() => {
      for (const [k, v] of Object.entries(patch)) {
        const old = this.metaMap.get(k)
        if (old === v) continue
        this.metaMap.set(k, v)
        this.history.push([{
          id: newId(), at: Date.now(), by: this.actor.pubkey,
          coll: 'trip', recId: this.meta.id, op: 'update', field: k, old,
        }])
      }
    })
  }

  // ---- 每天的標題與圖示（以日期當 ID）----

  setDay(date: string, info: DayInfo): void {
    if (this.days.raw(date)) {
      this.days.restore(date)
      this.days.update(date, info)
    } else this.days.create(info, date)
  }

  // ---- 成員（以公鑰當 ID）----

  join(nickname: string, role: Role = 'member'): void {
    if (this.members.raw(this.actor.pubkey)) return
    this.members.create({ nickname, role, joinedAt: Date.now() }, this.actor.pubkey)
  }

  nicknameOf(pubkey: string): string {
    return this.members.get(pubkey)?.nickname ?? '（未知成員）'
  }

  // ---- 清單 ----

  /** 共用、個人清單在 main；私人清單在 priv，不會同步。 */
  createList(list: List): string {
    return (list.kind === 'private' ? this.privLists : this.lists).create(list)
  }

  allLists(): (List & Meta)[] {
    return [...this.lists.all(), ...this.privLists.all()]
  }

  private itemsTable(kind: ListKind): Table<ListItem> {
    return kind === 'private' ? this.privListItems : this.listItems
  }

  addListItem(list: List & Meta, name: string): string {
    return this.itemsTable(list.kind).create({ listId: list.id, name })
  }

  removeListItem(kind: ListKind, id: string): void {
    this.itemsTable(kind).remove(id)
  }

  listItemsOf(list: List & Meta): ListItemView[] {
    const table = this.itemsTable(list.kind)
    return table
      .all()
      .filter((i) => i.listId === list.id)
      .map((i) => ({ ...i, ...readChecks(table.raw(i.id)!) }))
  }

  /**
   * 勾選是「加入一筆勾選紀錄」，取消是「刪掉目前看得到的勾選紀錄」。
   * 兩人同時一勾一取消時，新加的那筆不會被刪到 →「有人勾就算勾」。
   */
  setChecked(kind: ListKind, id: string, checked: boolean): void {
    const table = this.itemsTable(kind)
    const rec = table.raw(id)
    if (!rec) return
    const was = readChecks(rec).checked
    if (was === checked) return
    table.mutate(id, 'checked', was, (r) => {
      const checks = r.get('checks') as Y.Map<Check>
      if (checked) checks.set(newId(), { by: this.actor.pubkey, at: Date.now() })
      else [...checks.keys()].forEach((k) => checks.delete(k))
    })
  }

  // ---- 訂位代號（只在 device 文件）----

  setPnr(flightId: string, pnr: Pnr | null): void {
    if (pnr) this.pnrs.set(flightId, pnr)
    else this.pnrs.delete(flightId)
  }

  getPnr(flightId: string): Pnr | undefined {
    return this.pnrs.get(flightId)
  }

  // ---- 修改紀錄 ----

  historyEntries(): HistoryEntry[] {
    return this.history.toArray()
  }

  /** 還原一筆修改紀錄。還原本身也是一次修改，會再留下一筆紀錄。 */
  revert(e: HistoryEntry): void {
    if (e.coll === 'trip') {
      if (e.field) this.updateMeta({ [e.field]: e.old })
      return
    }
    const table = this.mainTables()[e.coll]
    if (!table) return
    if (e.op === 'create' || e.op === 'restore') table.remove(e.recId)
    else if (e.op === 'delete') table.restore(e.recId)
    else if (e.field === 'checked') this.setChecked('shared', e.recId, Boolean(e.old))
    else if (e.field) table.update(e.recId, { [e.field]: e.old })
  }

  private mainTables(): Record<string, Table<any>> {
    return {
      members: this.members, flights: this.flights, stays: this.stays, days: this.days,
      items: this.items, lists: this.lists, listItems: this.listItems,
    }
  }
}

function readChecks(rec: Y.Map<unknown>): CheckState {
  const by = new Set<string>()
  ;(rec.get('checks') as Y.Map<Check>).forEach((c) => by.add(c.by))
  return { checked: by.size > 0, checkedBy: [...by] }
}
