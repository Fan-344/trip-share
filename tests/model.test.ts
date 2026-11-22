import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { Trip, newTripDocs } from '../src/model/trip'
import type { Item } from '../src/model/types'

// 兩支手機：各自有完整副本，只有 main 與 comments 會互傳。
function twoPhones() {
  const a = new Trip(newTripDocs(), { pubkey: 'pubA', device: 'devA' })
  const b = new Trip(newTripDocs(), { pubkey: 'pubB', device: 'devB' })
  a.init({ id: 't1', title: '清邁', startDate: '2027-03-05', endDate: '2027-03-09' }, '爸爸')
  sync(a, b)
  b.join('媽媽')
  sync(a, b)
  return { a, b }
}

function sync(a: Trip, b: Trip) {
  for (const k of ['main', 'comments'] as const) {
    const ua = Y.encodeStateAsUpdate(a.docs[k])
    const ub = Y.encodeStateAsUpdate(b.docs[k])
    Y.applyUpdate(b.docs[k], ua)
    Y.applyUpdate(a.docs[k], ub)
  }
}

const item = (title: string): Item => ({
  date: '2027-03-06', time: '18:00', tz: 'Asia/Bangkok', title, note: '', place: '', transport: '', kind: 'normal',
})

describe('行程與成員', () => {
  it('建立者是管理員，加入者是成員', () => {
    const { a, b } = twoPhones()
    expect(b.meta.title).toBe('清邁')
    expect(a.members.get('pubA')?.role).toBe('admin')
    expect(a.members.get('pubB')).toMatchObject({ nickname: '媽媽', role: 'member' })
  })
})

describe('衝突規則', () => {
  it('兩人改同一筆的不同欄位，兩邊都保留', () => {
    const { a, b } = twoPhones()
    const id = a.items.create(item('晚餐'))
    sync(a, b)
    a.items.update(id, { title: '晚餐（改）' })
    b.items.update(id, { time: '19:00' })
    sync(a, b)
    for (const t of [a, b]) expect(t.items.get(id)).toMatchObject({ title: '晚餐（改）', time: '19:00' })
  })

  it('兩人改同一欄位，兩支手機結果一致', () => {
    const { a, b } = twoPhones()
    const id = a.items.create(item('晚餐'))
    sync(a, b)
    a.items.update(id, { title: 'A 版' })
    b.items.update(id, { title: 'B 版' })
    sync(a, b)
    expect(a.items.get(id)!.title).toBe(b.items.get(id)!.title)
  })

  it('一人刪除、一人修改：保留修改的版本', () => {
    const { a, b } = twoPhones()
    const id = a.items.create(item('晚餐'))
    sync(a, b)
    a.items.remove(id)
    b.items.update(id, { title: '晚餐改地點' })
    sync(a, b)
    for (const t of [a, b]) {
      expect(t.items.get(id)).toMatchObject({ deleted: false, title: '晚餐改地點' })
    }
  })

  it('對方看過之後才刪：確實刪除，但資料還在、可還原', () => {
    const { a, b } = twoPhones()
    const id = a.items.create(item('晚餐'))
    sync(a, b)
    b.items.update(id, { title: '改過' })
    sync(a, b)
    a.items.remove(id)
    sync(a, b)
    expect(b.items.all()).toHaveLength(0)
    expect(b.items.all(true)).toHaveLength(1)
    b.items.restore(id)
    sync(a, b)
    expect(a.items.get(id)).toMatchObject({ deleted: false, title: '改過' })
  })

  it('共用清單：同時一勾一取消，有人勾就算勾', () => {
    const { a, b } = twoPhones()
    const listId = a.createList({ kind: 'shared', title: '共用', owners: [] })
    const list = a.lists.get(listId)!
    const id = a.addListItem(list, '充電器')
    a.setChecked('shared', id, true)
    sync(a, b)
    a.setChecked('shared', id, false)
    b.setChecked('shared', id, false)
    b.setChecked('shared', id, true)
    sync(a, b)
    for (const t of [a, b]) {
      expect(t.listItemsOf(list)[0]).toMatchObject({ checked: true, checkedBy: ['pubB'] })
    }
  })

  it('兩人都取消勾選：就是沒勾', () => {
    const { a, b } = twoPhones()
    const list = a.lists.get(a.createList({ kind: 'shared', title: '共用', owners: [] }))!
    const id = a.addListItem(list, '防蚊液')
    a.setChecked('shared', id, true)
    sync(a, b)
    a.setChecked('shared', id, false)
    b.setChecked('shared', id, false)
    sync(a, b)
    expect(a.listItemsOf(list)[0].checked).toBe(false)
  })
})

describe('修改紀錄', () => {
  it('記下誰改了哪個欄位與舊值，並可還原', () => {
    const { a, b } = twoPhones()
    const id = a.items.create(item('晚餐'))
    sync(a, b)
    b.items.update(id, { title: '宵夜' })
    sync(a, b)
    const e = a.historyEntries().find((h) => h.recId === id && h.op === 'update')!
    expect(e).toMatchObject({ by: 'pubB', coll: 'items', field: 'title', old: '晚餐' })
    a.revert(e)
    sync(a, b)
    expect(b.items.get(id)!.title).toBe('晚餐')
  })

  it('兩人同時改，兩筆紀錄都留著', () => {
    const { a, b } = twoPhones()
    const id = a.items.create(item('晚餐'))
    sync(a, b)
    a.items.update(id, { title: 'A' })
    b.items.update(id, { title: 'B' })
    sync(a, b)
    const updates = a.historyEntries().filter((h) => h.recId === id && h.op === 'update')
    expect(updates).toHaveLength(2)
    expect(b.historyEntries()).toHaveLength(a.historyEntries().length)
  })

  it('刪除可從紀錄還原；行程標題也可還原', () => {
    const { a } = twoPhones()
    const id = a.items.create(item('晚餐'))
    a.items.remove(id)
    a.revert(a.historyEntries().find((h) => h.recId === id && h.op === 'delete')!)
    expect(a.items.get(id)!.deleted).toBe(false)
    a.updateMeta({ title: '清邁親子' })
    a.revert(a.historyEntries().find((h) => h.coll === 'trip')!)
    expect(a.meta.title).toBe('清邁')
  })
})

describe('不該離開手機的資料', () => {
  it('訂位代號與私人清單不在會同步的文件裡', () => {
    const { a, b } = twoPhones()
    const f = a.flights.create({
      code: 'JX1751', from: 'TPE', to: 'CNX',
      dep: { local: '2027-03-05T13:05', tz: 'Asia/Taipei' },
      arr: { local: '2027-03-05T15:55', tz: 'Asia/Bangkok' },
      cabin: 'Y', aircraft: '',
    })
    a.setPnr(f, { airline: 'JX', code: 'SECRET1' })
    const privId = a.createList({ kind: 'private', title: '私人', owners: ['pubA'] })
    const priv = a.allLists().find((l) => l.id === privId)!
    a.addListItem(priv, 'PRIVATEITEM')
    sync(a, b)

    expect(a.getPnr(f)?.code).toBe('SECRET1')
    expect(a.listItemsOf(priv)).toHaveLength(1)
    expect(b.flights.get(f)?.code).toBe('JX1751')
    expect(b.getPnr(f)).toBeUndefined()
    expect(b.allLists()).toHaveLength(0)

    // 連同步出去的原始位元組都不該出現這些字。
    for (const k of ['main', 'comments'] as const) {
      const bytes = new TextDecoder().decode(Y.encodeStateAsUpdate(a.docs[k]))
      expect(bytes).not.toContain('SECRET1')
      expect(bytes).not.toContain('PRIVATEITEM')
    }
    // 會進備份的 priv 也不含訂位代號。
    expect(new TextDecoder().decode(Y.encodeStateAsUpdate(a.docs.priv))).not.toContain('SECRET1')
  })

  it('留言在留言文件，不在主文件', () => {
    const { a, b } = twoPhones()
    const id = a.items.create(item('晚餐'))
    a.comments.create({ itemId: id, text: 'COMMENTTEXT', thumb: new Uint8Array([1, 2, 3]) })
    sync(a, b)
    expect(b.comments.all()[0]).toMatchObject({ text: 'COMMENTTEXT', createdBy: 'pubA' })
    expect(new TextDecoder().decode(Y.encodeStateAsUpdate(a.docs.main))).not.toContain('COMMENTTEXT')
  })
})

describe('行前準備與購物', () => {
  it('清單項目可以有分類與說明，並能修改', () => {
    const { a, b } = twoPhones()
    const list = a.lists.get(a.createList({ kind: 'shared', title: '出發前清單', owners: [] }))!
    const id = a.addListItem(list, '護照效期確認', { group: '證件', note: '至少 6 個月' })
    sync(a, b)
    expect(b.listItemsOf(list)[0]).toMatchObject({ name: '護照效期確認', group: '證件', note: '至少 6 個月' })
    b.updateListItem('shared', id, { note: '已確認' })
    sync(a, b)
    expect(a.listItemsOf(list)[0].note).toBe('已確認')
  })

  it('兩個人同時請同一個人代買，數量都算進去', () => {
    const { a, b } = twoPhones()
    const id = a.shop.create({ name: '包包', note: '', date: '', itemId: '', place: '', owner: 'pubA', qty: 1, bought: false })
    sync(a, b)
    // 第三支手機
    const c = new Trip(newTripDocs(), { pubkey: 'pubC', device: 'devC' })
    for (const k of ['main', 'comments'] as const) Y.applyUpdate(c.docs[k], Y.encodeStateAsUpdate(a.docs[k]))
    b.setWant(id, 2)
    c.setWant(id, 1)
    sync(a, b)
    for (const k of ['main', 'comments'] as const) {
      Y.applyUpdate(a.docs[k], Y.encodeStateAsUpdate(c.docs[k]))
      Y.applyUpdate(c.docs[k], Y.encodeStateAsUpdate(a.docs[k]))
    }
    sync(a, b)
    for (const t of [a, b, c]) {
      expect(t.shopItems()[0]).toMatchObject({ qty: 1, total: 4, wants: { pubB: 2, pubC: 1 } })
    }
    b.setWant(id, 0)
    sync(a, b)
    expect(a.shopItems()[0]).toMatchObject({ total: 2, wants: { pubC: 1 } })
  })

  it('買到了會同步，並留下可還原的紀錄', () => {
    const { a, b } = twoPhones()
    const id = a.shop.create({ name: '芒果乾', note: '', date: '', itemId: '', place: '', owner: '', qty: 3, bought: false })
    sync(a, b)
    b.shop.update(id, { bought: true })
    sync(a, b)
    expect(a.shopItems()[0].bought).toBe(true)
    a.revert(a.historyEntries().find((h) => h.coll === 'shop' && h.field === 'bought')!)
    expect(a.shopItems()[0].bought).toBe(false)
  })
})

describe('現場詢問', () => {
  const ask = { name: '手工皂', note: '', date: '', itemId: '', place: '市集', owner: 'pubA', qty: 1, bought: false, ask: true, price: '120 泰銖' }

  it('回覆「要」「不用」和「還沒回」分得清楚，收回也可以', () => {
    const { a, b } = twoPhones()
    const id = a.shop.create(ask)
    sync(a, b)
    expect(a.shopItems()[0]).toMatchObject({ wants: {}, declined: [], total: 1 })

    b.setWant(id, 0)
    sync(a, b)
    expect(a.shopItems()[0]).toMatchObject({ wants: {}, declined: ['pubB'], total: 1 })

    b.setWant(id, 2)
    sync(a, b)
    expect(a.shopItems()[0]).toMatchObject({ wants: { pubB: 2 }, declined: [], total: 3 })

    b.setWant(id, null)
    sync(a, b)
    expect(a.shopItems()[0]).toMatchObject({ wants: {}, declined: [], total: 1 })
  })

  it('照片放在留言文件，不在行程主文件；換照片只留一張', () => {
    const { a, b } = twoPhones()
    const id = a.shop.create(ask)
    const first = new Uint8Array(3000).fill(7)
    const second = new Uint8Array(3000).fill(9)
    a.setPhoto(id, first)
    a.setPhoto(id, second)
    sync(a, b)
    expect(b.photoOf(id)).toEqual(second)
    expect(b.photos.all()).toHaveLength(1)
    expect(Y.encodeStateAsUpdate(a.docs.main).length).toBeLessThan(3000)
    expect(Y.encodeStateAsUpdate(a.docs.comments).length).toBeGreaterThan(3000)
    a.setPhoto(id, null)
    sync(a, b)
    expect(b.photoOf(id)).toBeUndefined()
  })
})

describe('移出成員（不換金鑰）', () => {
  it('被移出的人從名單消失，查得到是誰、什麼時候移的', () => {
    const { a, b } = twoPhones()
    expect(a.removalOf('pubB')).toBeNull()
    a.members.remove('pubB')
    sync(a, b)
    expect(b.members.all().map((m) => m.id)).toEqual(['pubA'])
    expect(b.removalOf('pubB')).toMatchObject({ by: 'pubA' })
    // 名字還查得到，修改紀錄才不會變成「未知成員」
    expect(a.nicknameOf('pubB')).toBe('媽媽')
  })

  it('重新加入：回到名單上，是一般成員', () => {
    const { a, b } = twoPhones()
    a.members.update('pubB', { role: 'admin' })
    a.members.remove('pubB')
    sync(a, b)
    b.join('媽咪')
    sync(a, b)
    expect(a.removalOf('pubB')).toBeNull()
    expect(a.members.get('pubB')).toMatchObject({ nickname: '媽咪', role: 'member', deleted: false })
  })

  it('不用手機的成員不算在「有手機的成員」裡', () => {
    const { a } = twoPhones()
    const kid = a.addManaged('大女兒')
    expect(a.members.get(kid)).toMatchObject({ nickname: '大女兒', managed: true })
    expect(a.phoneMembers().sort()).toEqual(['pubA', 'pubB'])
  })
})
