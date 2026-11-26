import * as Y from 'yjs'
import { Table, newId } from './table'
import type { Rekey } from './rekey'
import type {
  Actor, CheckState, Comment, DayInfo, Expense, Flight, HistoryEntry, Item, List, ListItem, ListKind,
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
  /** 每位成員的 App 會什麼（目前只有一項：讀得懂壓縮過的快照）。以成員的公鑰當 key。 */
  private readonly caps: Y.Map<number>
  readonly members: Table<Member>
  readonly flights: Table<Flight>
  readonly stays: Table<Stay>
  readonly items: Table<Item>
  readonly days: Table<DayInfo>
  readonly lists: Table<List>
  readonly listItems: Table<ListItem>
  readonly notes: Table<Note>
  readonly shop: Table<ShopItem>
  readonly expenses: Table<Expense>
  /** 分帳用的匯率：外幣 → 1 單位等於多少台幣。每趟自己填。 */
  private readonly rateMap: Y.Map<number>
  /** 匯率是哪一天抓的（day）、是不是改成自己填（manual）。 */
  private readonly rateInfoMap: Y.Map<unknown>
  /** 幣別設定：home 是結帳用的、local 是當地用的（兩種預設幣別），extra 是另外加進選單的幣別。 */
  private readonly currencyMap: Y.Map<unknown>
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
    this.caps = main.getMap('caps')
    this.members = new Table(main, 'members', actor, this.history)
    this.flights = new Table(main, 'flights', actor, this.history)
    this.stays = new Table(main, 'stays', actor, this.history)
    this.items = new Table(main, 'items', actor, this.history)
    this.days = new Table(main, 'days', actor, this.history)
    this.lists = new Table(main, 'lists', actor, this.history)
    this.listItems = new Table(main, 'listItems', actor, this.history, ['checks'])
    this.notes = new Table(main, 'notes', actor, this.history)
    this.shop = new Table(main, 'shop', actor, this.history, ['wants'])
    this.expenses = new Table(main, 'expenses', actor, this.history)
    this.rateMap = main.getMap('rates')
    this.rateInfoMap = main.getMap('rateInfo')
    this.currencyMap = main.getMap('currency')
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

  // ---- 分帳的匯率 ----

  rates(): Record<string, number> {
    return this.rateMap.toJSON() as Record<string, number>
  }

  /** 匯率的狀態：day 是自動抓的那一天（沒抓過是空字串），manual 是改成自己填、不再自動抓。 */
  rateInfo(): { day: string; manual: boolean } {
    return { day: String(this.rateInfoMap.get('day') ?? ''), manual: this.rateInfoMap.get('manual') === true }
  }

  /** 自動抓到的匯率：一次寫進去，記下是哪一天抓的。 */
  setFetchedRates(rates: Record<string, number>, day: string): void {
    this.docs.main.transact(() => {
      for (const [cur, n] of Object.entries(rates)) if (n > 0) this.rateMap.set(cur, n)
      this.rateInfoMap.set('day', day)
    })
  }

  /**
   * 幣別設定（成員與設定頁），整份行程共用。兩種預設幣別：
   * home 是結帳用的（空字串代表沒指定，就是台幣）；local 是當地用的（空字串代表沒指定，照目的地判斷）。
   * extra 是這兩種以外，另外加進選單的幣別。
   */
  currencySetup(): { home: string; local: string; extra: string[] } {
    const extra = this.currencyMap.get('extra')
    return {
      home: String(this.currencyMap.get('home') ?? ''), local: String(this.currencyMap.get('local') ?? ''),
      extra: Array.isArray(extra) ? extra.map(String) : [],
    }
  }

  /** 改結帳幣別。匯率是「1 外幣等於多少結帳幣別」，換了結帳幣別舊的匯率就不能用了，一起清掉重抓。 */
  setCurrencyHome(cur: string): void {
    if (cur === this.currencySetup().home) return
    this.docs.main.transact(() => {
      this.currencyMap.set('home', cur)
      for (const key of [...this.rateMap.keys()]) this.rateMap.delete(key)
      this.rateInfoMap.set('day', '')
      this.rateInfoMap.set('manual', false)
    })
  }

  setCurrencyLocal(cur: string): void {
    this.currencyMap.set('local', cur)
  }

  setCurrencyExtra(list: string[]): void {
    this.currencyMap.set('extra', [...new Set(list)])
  }

  /** 開或關「自己填匯率」。關掉時把抓取日期清掉，下次打開分帳就會重抓。 */
  setRateManual(manual: boolean): void {
    this.docs.main.transact(() => {
      this.rateInfoMap.set('manual', manual)
      if (!manual) this.rateInfoMap.set('day', '')
    })
  }

  /** 填匯率；0 或不是數字就是清掉。 */
  setRate(cur: string, rate: number): void {
    if (rate > 0) this.rateMap.set(cur, rate)
    else this.rateMap.delete(cur)
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

  /**
   * 這個成員的行李收好了沒：他名下的個人清單（大家本來就看得到的那種）至少有一項，而且全部勾完。
   * 私人清單不算，別人看不到。
   */
  packedOf(pubkey: string): boolean {
    const items = this.lists.all()
      .filter((l) => l.kind === 'personal' && l.owners.includes(pubkey))
      .flatMap((l) => this.listItemsOf(l))
    return items.length > 0 && items.every((i) => i.checked)
  }

  /**
   * 登記「我的 App 讀得懂壓縮過的快照」。全團都登記了，大家才開始發壓縮過的快照；
   * 還有人沒更新的話，壓縮過的他讀不到，所以先維持舊的做法。
   */
  markCanZip(): void {
    if (this.caps.get(this.actor.pubkey) !== 1) this.caps.set(this.actor.pubkey, 1)
  }

  /** 是不是每一位有手機的成員都登記過了。（不用手機的成員沒有 App，不算。） */
  allCanZip(): boolean {
    const phones = this.members.all().filter((m) => !m.managed)
    return phones.length > 0 && phones.every((m) => this.caps.get(m.id) === 1)
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

  /**
   * 把清單整理成現在的樣子：一份清單底下可以有幾個「欄位」（子清單），項目用 section 記自己在哪一欄。
   * 要處理兩種舊資料，回傳動了幾筆（0 代表已經是整理好的）：
   *
   * 1. 更早的版本把欄位記在項目的 group 上 → 改記到 section。
   * 2. 有一版把每個分類拆成獨立的清單（ID 是「原清單.分類雜湊」）、原清單刪掉 →
   *    項目搬回原清單、欄位名用拆出來那份清單的名稱（改過名就照改過的），原清單還原，拆出來的刪掉。
   *
   * 不沿用 group 這個欄位名，是因為還停在拆清單那一版的手機看到 group 會再拆一次；用新的名字它就不會動。
   * 每支手機打開行程時都會跑，做的事都一樣，同時跑結果也相同。
   */
  tidyLists(): number {
    let changed = 0
    for (const kind of ['shared', 'private'] as const) {
      const table = kind === 'private' ? this.privLists : this.lists
      const items = this.itemsTable(kind)
      for (const i of items.all()) {
        if (!i.group) continue
        items.update(i.id, { section: i.section || i.group, group: '' })
        changed++
      }
      for (const part of table.all()) {
        const cut = part.id.lastIndexOf('.')
        const origin = cut > 0 ? table.get(part.id.slice(0, cut)) : undefined
        if (!origin) continue
        if (origin.deleted) table.restore(origin.id)
        for (const i of items.all()) if (i.listId === part.id) items.update(i.id, { listId: origin.id, section: part.title })
        table.remove(part.id)
        changed++
      }
    }
    return changed
  }

  /** 有沒有還沒整理的舊資料（畫面用它決定要不要跑 tidyLists）。 */
  listsNeedTidy(): boolean {
    const old = (t: Table<ListItem>) => t.all().some((i) => i.group)
    const split = (t: Table<List>) => t.all().some((l) => { const cut = l.id.lastIndexOf('.'); return cut > 0 && !!t.get(l.id.slice(0, cut)) })
    return old(this.listItems) || old(this.privListItems) || split(this.lists) || split(this.privLists)
  }

  /** 把一個欄位改名：這份清單裡在那一欄的項目全部改過去。 */
  renameSection(list: List & Meta, from: string, to: string): void {
    const items = this.itemsTable(list.kind)
    for (const i of items.all()) if (i.listId === list.id && (i.section ?? '') === from) items.update(i.id, { section: to })
  }

  updateList(list: List & Meta, patch: Partial<Pick<List, 'title' | 'icon'>>): void {
    ;(list.kind === 'private' ? this.privLists : this.lists).update(list.id, patch)
  }

  allLists(): (List & Meta)[] {
    return [...this.lists.all(), ...this.privLists.all()]
  }

  private itemsTable(kind: ListKind): Table<ListItem> {
    return kind === 'private' ? this.privListItems : this.listItems
  }

  addListItem(list: List & Meta, name: string, extra: { section?: string; note?: string } = {}): string {
    return this.itemsTable(list.kind).create({ listId: list.id, name, section: extra.section ?? '', note: extra.note ?? '' })
  }

  updateListItem(kind: ListKind, id: string, patch: Partial<Pick<ListItem, 'name' | 'section' | 'note'>>): void {
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

  /**
   * 修改紀錄只留最近 keep 筆，更早的丟掉；回傳丟掉幾筆。丟掉的救不回來。
   * 修改紀錄跟行程內容存在同一份文件裡，全部留著的話只增不減，會佔掉將近一半的大小，
   * 而每次同步都要把整份文件傳一遍。
   */
  trimHistory(keep: number): number {
    const extra = this.history.length - keep
    if (extra <= 0) return 0
    this.docs.main.transact(() => this.history.delete(0, extra))
    return extra
  }

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
      items: this.items, lists: this.lists, listItems: this.listItems, notes: this.notes, shop: this.shop, expenses: this.expenses,
    }
  }
}

function readChecks(rec: Y.Map<unknown>): CheckState {
  const by = new Set<string>()
  ;(rec.get('checks') as Y.Map<Check>).forEach((c) => by.add(c.by))
  return { checked: by.size > 0, checkedBy: [...by] }
}
