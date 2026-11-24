import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import { applyMove, createMove, moveReplaces, parseMove } from '../src/store/move'
import { Registry, createTrip, openTrip } from '../src/store/local'
import { b64url } from '../src/sync/crypto'

// 每個測試一支全新的手機（清空的瀏覽器儲存）。
const newPhone = () => { globalThis.indexedDB = new IDBFactory() }
beforeEach(newPhone)

/** Safari 裡用過的樣子：有身分、一份行程、一份私人清單。 */
async function safari() {
  const reg = await Registry.open()
  reg.setNickname('爸爸')
  const id = await createTrip(reg, { title: '清邁', startDate: '2027-03-05', endDate: '2027-03-09' })
  const { trip, close } = await openTrip(reg, id, false)
  const privId = trip.createList({ kind: 'private', title: '私人清單', owners: [] })
  trip.addListItem(trip.privLists.get(privId)!, '私人的東西')
  close()
  return { code: await createMove(reg), me: reg.me()!, id, key: reg.trip(id)!.key }
}

describe('搬家碼', () => {
  it('貼到全新的地方：同一個身分、行程和私人清單都在', async () => {
    const from = await safari()
    newPhone()
    const reg = await Registry.open()
    const data = parseMove(`  ${from.code}\n`)!
    expect(moveReplaces(reg, data)).toBe(false)
    const r = await applyMove(reg, data)
    expect(r).toEqual({ identity: 'adopted', trips: 1, cleaned: 0 })
    const me = reg.me()!
    expect(me.pubkey).toBe(from.me.pubkey)
    expect(me.sk).toBe(from.me.sk)
    expect(me.nickname).toBe('爸爸')
    // 裝置代號代表「這次安裝」，不跟著搬
    expect(me.device).not.toBe(from.me.device)
    expect(reg.trip(from.id)).toMatchObject({ title: '清邁', startDate: '2027-03-05', key: from.key })
    const { trip, close } = await openTrip(reg, from.id, false)
    expect(trip.privLists.all().map((l) => l.title)).toEqual(['私人清單'])
    close()
  })

  it('再貼一次不會有事', async () => {
    const from = await safari()
    newPhone()
    const reg = await Registry.open()
    await applyMove(reg, parseMove(from.code)!)
    expect(await applyMove(reg, parseMove(from.code)!)).toEqual({ identity: 'same', trips: 1, cleaned: 0 })
    expect(reg.trips()).toHaveLength(1)
  })

  it('已經用新身分重新加入過：換回原本的身分，多出來的那個從成員名單拿掉', async () => {
    const from = await safari()
    newPhone()
    const reg = await Registry.open()
    reg.setNickname('爸爸')
    const dup = reg.me()!.pubkey
    reg.upsertTrip({ id: from.id, key: from.key, title: '清邁', startDate: '', endDate: '' })
    // 另外還有一份只在這裡的行程：不該被動到
    const own = await createTrip(reg, { title: '只在這裡', startDate: '2027-05-01', endDate: '2027-05-02' })
    const a = await openTrip(reg, from.id, false)
    a.trip.join('爸爸')
    a.close()

    const data = parseMove(from.code)!
    expect(moveReplaces(reg, data)).toBe(true)
    expect(await applyMove(reg, data)).toEqual({ identity: 'replaced', trips: 1, cleaned: 1 })
    expect(reg.me()!.pubkey).toBe(from.me.pubkey)
    expect(reg.trips()).toHaveLength(2)

    const b = await openTrip(reg, from.id, false)
    expect(b.trip.members.all().map((m) => m.id)).not.toContain(dup)
    b.close()
    const c = await openTrip(reg, own, false)
    expect(c.trip.members.all().map((m) => m.id)).toContain(dup)
    c.close()
  })

  it('不是搬家碼、被截斷或被改過的都不接受', async () => {
    const { code } = await safari()
    expect(parseMove('')).toBeNull()
    expect(parseMove('https://example.github.io/trip-share/#/join/abc')).toBeNull()
    expect(parseMove(code.slice(0, code.length - 40))).toBeNull()
    // 私鑰和公鑰不是一對
    const data = parseMove(code)!
    const fake = { ...data, me: { ...data.me, pubkey: 'f'.repeat(64) } }
    const b64 = b64url.enc(new TextEncoder().encode(JSON.stringify(fake)))
    expect(parseMove(`trip-share-move:${b64}`)).toBeNull()
  })
})
