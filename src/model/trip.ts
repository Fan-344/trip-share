import * as Y from 'yjs'
import { Table, newId } from './table'
import type { Rekey } from './rekey'
import type {
  Actor, CheckState, Comment, DayInfo, Flight, HistoryEntry, Item, List, ListItem, ListKind,
  Member, Meta, Note, Photo, Pnr, Role, ShopItem, ShopItemView, Stay, TripMeta,
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
  readonly notes: Table<Note>
  readonly shop: Table<ShopItem>
  readonly comments: Table<Comment>
  readonly photos: Table<Photo>
  readonly privLists: Table<List>
  readonly privListItems: Table<ListItem>
  private readonly metaMap: Y.Map<unknown>
  private readonly pnrs: Y.Map<Pnr>
  private readonly rekeys: Y.Array<Rekey>

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
    this.notes = new Table(main, 'notes', actor, this.history)
    this.shop = new Table(main, 'shop', actor, this.history, ['wants'])
    this.comments = new Table(comments, 'comments', actor)
    this.photos = new Table(comments, 'photos', actor)
    this.privLists = new Table(priv, 'lists', actor)
    this.privListItems = new Table(priv, 'listItems', actor, null, ['checks'])
    this.pnrs = device.getMap('pnrs')
    this.rekeys = main.getArray('rekeys')
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

  /**
   * 刪除整份行程（對所有成員）或取消刪除。只是做記號：每個人的 App 看到記號就不再顯示內容，
   * 並請他把行程從手機移除。中繼站上加密過的資料清不掉，所以這不是「銷毀」，而是「大家都收起來」。
   */
  setDeleted(deleted: boolean): void {
    const old = this.meta.deleted ?? null
    if (!!old === deleted) return
    this.docs.main.transact(() => {
      this.metaMap.set('deleted', deleted ? { by: this.actor.pubkey, at: Date.now() } : null)
      this.history.push([{
        id: newId(), at: Date.now(), by: this.actor.pubkey,
        coll: 'trip', recId: this.meta.id, op: deleted ? 'delete' : 'restore',
      }])
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

  /**
   * 把自己加進成員。已經是成員就不動；之前退出或被移出、現在用新的邀請回來的，恢復成一般成員。
   * （被移出的人手上是舊金鑰，畫面會先擋下來，不會走到這裡。）
   */
  join(nickname: string, role: Role = 'member'): void {
    const mine = this.members.get(this.actor.pubkey)
    if (mine && !mine.deleted) return
    if (mine) {
      this.members.restore(this.actor.pubkey)
      this.members.update(this.actor.pubkey, { nickname, role: 'member', joinedAt: Date.now() })
    } else this.members.create({ nickname, role, joinedAt: Date.now() }, this.actor.pubkey)
  }

  nicknameOf(pubkey: string): string {
    return this.members.get(pubkey)?.nickname ?? '（未知成員）'
  }

  /** 這個成員如果已經不在名單上：是誰、什麼時候把他拿掉的。還在名單上就是 null。 */
  removalOf(pubkey: string): { by: string; at: number } | null {
    if (!this.members.get(pubkey)?.deleted) return null
    const stone = this.members.raw(pubkey)?.get("deleted") as { by: string; at: number } | null | undefined
    return stone ? { by: stone.by, at: stone.at } : null
  }

  /** 不用手機的成員（小孩、長輩）：沒有金鑰、不會自己登入，由其他人代管他的清單。 */
  addManaged(nickname: string): string {
    return this.members.create({ nickname, role: 'member', joinedAt: Date.now(), managed: true })
  }

  /** 有手機、現在還在行程裡的成員。換金鑰時新金鑰要給這些人。 */
  phoneMembers(): string[] {
    return this.members.all().filter((m) => !m.managed).map((m) => m.id)
  }

  // ---- 移出成員與換金鑰（見 rekey.ts）----

  rekeyEntries(): Rekey[] {
    return this.rekeys.toArray()
  }

  /** 把人移出，並記下換金鑰的紀錄。兩件事一起寫，別人不會只看到一半。 */
  kick(pubkey: string, entry: Rekey): void {
    this.docs.main.transact(() => {
      this.members.remove(pubkey)
      this.rekeys.push([entry])
    })
  }

  /** 換金鑰的紀錄送不出去時，把剛才的移出收回來。 */
  undoKick(pubkey: string, entryId: string): void {
    this.docs.main.transact(() => {
      const i = this.rekeys.toArray().findIndex((e) => e.id === entryId)
      if (i >= 0) this.rekeys.delete(i, 1)
      this.members.restore(pubkey)
    })
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

  addListItem(list: List & Meta, name: string, extra: { group?: string; note?: string } = {}): string {
    return this.itemsTable(list.kind).create({ listId: list.id, name, group: extra.group ?? '', note: extra.note ?? '' })
  }

  updateListItem(kind: ListKind, id: string, patch: Partial<Pick<ListItem, 'name' | 'group' | 'note'>>): void {
    this.itemsTable(kind).update(id, patch)
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

  // ---- 購物 ----

  shopItems(): ShopItemView[] {
    return this.shop.all().map((s) => {
      const wants: Record<string, number> = {}
      const declined: string[] = []
      ;(this.shop.raw(s.id)!.get('wants') as Y.Map<number>).forEach((n, who) => {
        if (n > 0) wants[who] = n
        else declined.push(who)
      })
      return { ...s, wants, declined, total: s.qty + Object.values(wants).reduce((a, b) => a + b, 0) }
    })
  }

  /**
   * 我要幾個。每個成員的數量各自一格，所以兩個人同時說「幫我帶一個」不會互相蓋掉。
   * - qty 大於 0：要這麼多個。
   * - qty 是 0：明確回覆「不用」（現場詢問時，這樣問的人才知道你看到了）。
   * - qty 是 null：收回，當作沒回覆過。
   */
  setWant(id: string, qty: number | null): void {
    const rec = this.shop.raw(id)
    if (!rec) return
    const wants = rec.get('wants') as Y.Map<number>
    const old = wants.get(this.actor.pubkey)
    const next = qty === null ? undefined : Math.max(0, Math.floor(qty))
    if (old === next) return
    this.shop.mutate(id, 'wants', old ?? null, (r) => {
      const w = r.get('wants') as Y.Map<number>
      if (next === undefined) w.delete(this.actor.pubkey)
      else w.set(this.actor.pubkey, next)
    })
  }

  // ---- 照片的索引（照片本身不在同步文件裡，見 types.ts 的 Photo）----

  /** 某一筆現在的照片索引；沒有照片就是 undefined。 */
  photoRecord(ref: string): (Photo & Meta) | undefined {
    // 兩個人同時換照片會留下兩筆，取比較新的那筆
    return this.photos.all().filter((p) => p.ref === ref).pop()
  }

  /** 換掉或拿掉某一筆的照片。每筆最多一張。 */
  setPhotoRef(ref: string, photo: { hash: string; size: number } | null): void {
    this.docs.comments.transact(() => {
      for (const p of this.photos.all()) {
        if (p.ref !== ref) continue
        // 舊版把整張照片放在紀錄裡；標記刪除不會把內容清掉，要先把那一格清空，文件才會變小
        if (p.data) this.photos.update(p.id, { data: null })
        this.photos.remove(p.id)
      }
      if (photo) this.photos.create({ ref, hash: photo.hash, size: photo.size })
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
      if (e.op === 'delete') this.setDeleted(false)
      else if (e.op === 'restore') this.setDeleted(true)
      else if (e.field) this.updateMeta({ [e.field]: e.old })
      return
    }
    const table = this.mainTables()[e.coll]
    if (!table) return
    if (e.op === 'create' || e.op === 'restore') table.remove(e.recId)
    else if (e.op === 'delete') table.restore(e.recId)
    else if (e.field === 'checked') this.setChecked('shared', e.recId, Boolean(e.old))
    else if (e.field === 'wants') return // 代買數量是每個人自己的，不提供從紀錄還原
    else if (e.field) table.update(e.recId, { [e.field]: e.old })
  }

  private mainTables(): Record<string, Table<any>> {
    return {
      members: this.members, flights: this.flights, stays: this.stays, days: this.days,
      items: this.items, lists: this.lists, listItems: this.listItems, notes: this.notes, shop: this.shop,
    }
  }
}

function readChecks(rec: Y.Map<unknown>): CheckState {
  const by = new Set<string>()
  ;(rec.get('checks') as Y.Map<Check>).forEach((c) => by.add(c.by))
  return { checked: by.size > 0, checkedBy: [...by] }
}
