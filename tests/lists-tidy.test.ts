import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { Trip, newTripDocs } from '../src/model/trip'

const phone = (name: string) => new Trip(newTripDocs(), { pubkey: `pub${name}`, device: `dev${name}` })
const sync = (a: Trip, b: Trip) => {
  for (const k of ['main', 'comments'] as const) {
    Y.applyUpdate(b.docs[k], Y.encodeStateAsUpdate(a.docs[k]))
    Y.applyUpdate(a.docs[k], Y.encodeStateAsUpdate(b.docs[k]))
  }
}
/** 每份清單：名稱、以及「欄位：項目」。 */
const shape = (t: Trip) => t.allLists().map((l) => [l.title, t.listItemsOf(l).map((i) => `${i.section || '-'}:${i.name}${i.checked ? '✓' : ''}`)])

/** 最早的版本：欄位記在項目的 group 上。 */
function legacy(t: Trip) {
  const list = t.lists.get(t.createList({ kind: 'shared', title: '出發前清單', owners: [] }))!
  const passport = t.listItems.create({ listId: list.id, name: '護照', group: '證件', note: '' })
  t.listItems.create({ listId: list.id, name: '影本', group: '證件', note: '存雲端' })
  t.listItems.create({ listId: list.id, name: '換泰銖', group: '金錢', note: '' })
  t.setChecked('shared', passport, true)
  return list
}

/** 中間有一版把每個分類拆成獨立清單、原清單刪掉。這裡照那一版的做法重現。 */
function splitLikeOldVersion(t: Trip) {
  for (const list of t.lists.all()) {
    const items = t.listItems.all().filter((i) => i.listId === list.id)
    const groups = [...new Set(items.map((i) => i.group ?? '').filter(Boolean))]
    for (const group of groups) {
      let h = 5381
      for (const ch of group) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0
      const id = `${list.id}.${h.toString(36)}`
      if (!t.lists.get(id)) t.lists.create({ kind: list.kind, title: group, owners: list.owners }, id)
      for (const i of items) if (i.group === group) t.listItems.update(i.id, { listId: id, group: '' })
    }
    if (groups.length > 0 && items.every((i) => i.group)) t.lists.remove(list.id)
  }
}

const WANT = [['出發前清單', ['證件:護照✓', '證件:影本', '金錢:換泰銖']]]

describe('清單整理成「清單底下有欄位」', () => {
  it('最早的資料：group 改記到 section', () => {
    const a = phone('A')
    legacy(a)
    expect(a.listsNeedTidy()).toBe(true)
    a.tidyLists()
    expect(shape(a)).toEqual(WANT)
    expect(a.listItems.all().every((i) => !i.group)).toBe(true)
    expect(a.listsNeedTidy()).toBe(false)
    expect(a.tidyLists()).toBe(0)
  })

  it('被拆開的清單併回原清單：欄位、說明、勾選都在，拆出來的那幾份不見', () => {
    const a = phone('A')
    legacy(a)
    splitLikeOldVersion(a)
    expect(a.allLists().map((l) => l.title)).toEqual(['證件', '金錢'])
    expect(a.listsNeedTidy()).toBe(true)
    a.tidyLists()
    expect(shape(a)).toEqual(WANT)
    expect(a.listItemsOf(a.allLists()[0])[1].note).toBe('存雲端')
    expect(a.listsNeedTidy()).toBe(false)
  })

  it('拆開後改過名、加過項目：併回時照改過的名字，新項目也跟著', () => {
    const a = phone('A')
    legacy(a)
    splitLikeOldVersion(a)
    const money = a.allLists().find((l) => l.title === '金錢')!
    a.updateList(money, { title: '錢' })
    a.addListItem(money, '信用卡')
    a.tidyLists()
    expect(shape(a)).toEqual([['出發前清單', ['證件:護照✓', '證件:影本', '錢:換泰銖', '錢:信用卡']]])
  })

  it('兩支手機各自整理：同步後結果相同、沒有重複', () => {
    const a = phone('A')
    const b = phone('B')
    legacy(a)
    splitLikeOldVersion(a)
    sync(a, b)
    a.tidyLists()
    b.tidyLists()
    sync(a, b)
    expect(shape(a)).toEqual(WANT)
    expect(shape(b)).toEqual(WANT)
  })

  it('整理後的資料，還停在拆清單那一版的手機不會再拆一次', () => {
    const a = phone('A')
    const b = phone('B')
    legacy(a)
    splitLikeOldVersion(a)
    a.tidyLists()
    sync(a, b)
    splitLikeOldVersion(b) // B 還沒更新
    sync(a, b)
    expect(shape(a)).toEqual(WANT)
    expect(a.listsNeedTidy()).toBe(false)
  })

  it('本來就是獨立的清單不會被併掉', () => {
    const a = phone('A')
    legacy(a)
    const own = a.lists.get(a.createList({ kind: 'shared', title: '行李', owners: [] }))!
    a.addListItem(own, '泳衣', { section: '衣物' })
    a.addListItem(own, '零食')
    a.tidyLists()
    expect(shape(a)).toEqual([...WANT, ['行李', ['衣物:泳衣', '-:零食']]])
  })

  it('欄位改名', () => {
    const a = phone('A')
    const list = legacy(a)
    a.tidyLists()
    a.renameSection(a.lists.get(list.id)!, '證件', '文件')
    expect(shape(a)[0][1]).toEqual(['文件:護照✓', '文件:影本', '金錢:換泰銖'])
  })

  it('私人清單也整理，而且不會跑到同步的文件裡', () => {
    const a = phone('A')
    const list = a.privLists.get(a.createList({ kind: 'private', title: '我的', owners: ['pubA'] }))!
    a.privListItems.create({ listId: list.id, name: '禮物', group: '秘密', note: '' })
    a.tidyLists()
    expect(shape(a)).toEqual([['我的', ['秘密:禮物']]])
    expect(a.lists.all()).toHaveLength(0)
  })
})
