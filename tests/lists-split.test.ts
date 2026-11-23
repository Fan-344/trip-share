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
const shape = (t: Trip) => t.allLists().map((l) => [l.title, t.listItemsOf(l).map((i) => i.name + (i.checked ? '✓' : ''))])

/** 舊版的樣子：一份清單裡有分類。 */
function oldStyle(t: Trip) {
  const list = t.lists.get(t.createList({ kind: 'shared', title: '出發前清單', owners: [] }))!
  const passport = t.addListItem(list, '護照', { group: '證件' })
  t.addListItem(list, '影本', { group: '證件', note: '存雲端' })
  t.addListItem(list, '換泰銖', { group: '金錢' })
  t.setChecked('shared', passport, true)
  return list
}

describe('清單的分類拆成各自一份清單', () => {
  it('每個分類變成一份清單，項目、說明、勾選都跟著；搬空的原清單刪掉', () => {
    const a = phone('A')
    oldStyle(a)
    expect(a.splitListGroups()).toBe(2)
    expect(shape(a)).toEqual([['證件', ['護照✓', '影本']], ['金錢', ['換泰銖']]])
    const moved = a.listItemsOf(a.allLists()[0])[1]
    expect(moved.note).toBe('存雲端')
    expect(moved.group).toBe('')
    expect(a.splitListGroups()).toBe(0) // 再跑一次不會再拆
  })

  it('原清單裡沒分類的項目留在原清單', () => {
    const a = phone('A')
    const list = oldStyle(a)
    a.addListItem(list, '暈車藥')
    a.splitListGroups()
    expect(shape(a)).toEqual([['出發前清單', ['暈車藥']], ['證件', ['護照✓', '影本']], ['金錢', ['換泰銖']]])
  })

  it('兩支手機各自拆：同步後還是各一份，不會重複', () => {
    const a = phone('A')
    const b = phone('B')
    oldStyle(a)
    sync(a, b)
    a.splitListGroups()
    b.splitListGroups()
    sync(a, b)
    expect(shape(a)).toEqual(shape(b))
    expect(shape(a).map(([title]) => title).sort()).toEqual(['證件', '金錢'].sort())
    expect(shape(a).flatMap(([, items]) => items).sort()).toEqual(['影本', '護照✓', '換泰銖'].sort())
  })

  it('別人用舊版又加了有分類的項目：再拆一次會併進已經拆好的那份', () => {
    const a = phone('A')
    const b = phone('B')
    const list = oldStyle(a)
    sync(a, b)
    a.splitListGroups()
    b.addListItem(b.lists.get(list.id)!, 'TDAC', { group: '證件' }) // B 還沒更新
    sync(a, b)
    a.splitListGroups()
    expect(shape(a).find(([title]) => title === '證件')?.[1]).toEqual(['護照✓', '影本', 'TDAC'])
  })

  it('私人清單也拆，而且不會跑到同步的文件裡', () => {
    const a = phone('A')
    const list = a.privLists.get(a.createList({ kind: 'private', title: '我的', owners: ['pubA'] }))!
    a.addListItem(list, '禮物', { group: '秘密' })
    a.splitListGroups()
    expect(shape(a)).toEqual([['秘密', ['禮物']]])
    expect(a.lists.all()).toHaveLength(0)
  })
})
