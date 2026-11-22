import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Item } from '../src/model/types'
import { BackupError, createBackup, readBackup, restoreBackup } from '../src/store/backup'
import { Registry, createTrip, openTrip, removeTrip, renameEverywhere } from '../src/store/local'

// 每個測試一支全新的手機（清空的瀏覽器儲存）。
const newPhone = () => { globalThis.indexedDB = new IDBFactory() }
beforeEach(newPhone)

const item = (title: string): Item => ({
  date: '2027-03-06', time: '18:00', tz: 'Asia/Bangkok', title, note: '', place: '', transport: '', kind: 'normal',
})

/** 一支用過的手機：有身分、一份行程（含項目、私人清單、訂位代號）。 */
async function usedPhone() {
  const reg = await Registry.open()
  reg.setNickname('爸爸')
  const id = await createTrip(reg, { title: '清邁', startDate: '2027-03-05', endDate: '2027-03-09' })
  const { trip, close } = await openTrip(reg, id, false)
  const itemId = trip.items.create(item('晚餐'))
  const flight = trip.flights.create({
    code: 'JX1751', from: 'TPE', to: 'CNX', cabin: '', aircraft: '',
    dep: { local: '2027-03-05T13:05', tz: 'Asia/Taipei' }, arr: { local: '2027-03-05T16:00', tz: 'Asia/Bangkok' },
  })
  trip.setPnr(flight, { airline: 'JX', code: 'PNRSECRET' })
  const privId = trip.createList({ kind: 'private', title: '私人清單', owners: [] })
  trip.addListItem(trip.privLists.get(privId)!, '私人的東西')
  close()
  return { reg, id, itemId, flight }
}

describe('備份檔', () => {
  it('不含訂位代號；含行程、私人清單與身分', async () => {
    const { reg } = await usedPhone()
    const text = await createBackup(reg)
    expect(text).not.toContain('PNRSECRET')
    const data = await readBackup(text)
    expect(data.me).toMatchObject({ nickname: '爸爸', pubkey: reg.me()!.pubkey, sk: reg.me()!.sk })
    expect(data.trips).toHaveLength(1)
    expect(reg.lastBackupAt()).toBeNull()
    reg.setLastBackup(data.createdAt)
    expect(reg.lastBackupAt()).toBe(data.createdAt)
  })

  it('設了密碼：檔案裡看不到內容，要對的密碼才打得開', async () => {
    const { reg } = await usedPhone()
    const text = await createBackup(reg, '芒果糯米飯')
    expect(text).not.toContain('爸爸')
    expect(text).not.toContain(reg.me()!.sk)
    await expect(readBackup(text)).rejects.toMatchObject({ code: 'need-password' })
    await expect(readBackup(text, '錯的')).rejects.toMatchObject({ code: 'bad-password' })
    expect((await readBackup(text, '芒果糯米飯')).me?.nickname).toBe('爸爸')
  })

  it('不是備份檔會被擋下', async () => {
    await expect(readBackup('亂打的字')).rejects.toBeInstanceOf(BackupError)
    await expect(readBackup('{"format":"別的東西"}')).rejects.toMatchObject({ code: 'bad-file' })
    await expect(readBackup('{"format":"trip-share-backup","version":1}')).rejects.toMatchObject({ code: 'bad-file' })
  })
})

describe('還原', () => {
  it('換新手機：身分、行程、私人清單都回來，訂位代號不會', async () => {
    const old = await usedPhone()
    const pubkey = old.reg.me()!.pubkey
    const oldDevice = old.reg.me()!.device
    const text = await createBackup(old.reg)

    newPhone()
    const reg = await Registry.open()
    expect(reg.me()).toBeNull()
    const result = await restoreBackup(reg, await readBackup(text), 'merge')
    expect(result).toMatchObject({ identity: 'adopted', added: ['清邁'], merged: [], copied: [] })
    expect(reg.me()).toMatchObject({ nickname: '爸爸', pubkey })
    expect(reg.me()!.device).not.toBe(oldDevice)

    const { trip, close } = await openTrip(reg, old.id, false)
    expect(trip.meta.title).toBe('清邁')
    expect(trip.items.get(old.itemId)?.title).toBe('晚餐')
    expect(trip.members.get(pubkey)?.role).toBe('admin')
    expect(trip.allLists().map((l) => l.title)).toEqual(['私人清單'])
    expect(trip.listItemsOf(trip.allLists()[0]).map((i) => i.name)).toEqual(['私人的東西'])
    expect(trip.getPnr(old.flight)).toBeUndefined()
    close()
    // 金鑰也回來了，之後才能繼續跟家人同步
    expect(reg.trip(old.id)?.key).toBe(old.reg.trip(old.id)?.key)
  })

  it('合併回原行程：備份後才做的修改不會被蓋掉，修改紀錄不重複', async () => {
    const { reg, id, itemId } = await usedPhone()
    const text = await createBackup(reg)

    const a = await openTrip(reg, id, false)
    a.trip.items.update(itemId, { title: '晚餐改地點' })
    const later = a.trip.items.create(item('夜市'))
    const historyBefore = a.trip.historyEntries().length
    a.close()

    const result = await restoreBackup(reg, await readBackup(text), 'merge')
    expect(result).toMatchObject({ identity: 'same', added: [], merged: ['清邁'], copied: [] })
    expect(reg.trips()).toHaveLength(1)

    const b = await openTrip(reg, id, false)
    expect(b.trip.items.get(itemId)?.title).toBe('晚餐改地點')
    expect(b.trip.items.get(later)?.title).toBe('夜市')
    expect(b.trip.historyEntries()).toHaveLength(historyBefore)
    b.close()
  })

  it('另存成舊版副本：多一份獨立的行程，內容是備份當時的樣子，原行程不動', async () => {
    const { reg, id, itemId } = await usedPhone()
    const text = await createBackup(reg)
    const a = await openTrip(reg, id, false)
    a.trip.items.update(itemId, { title: '晚餐改地點' })
    a.close()

    const result = await restoreBackup(reg, await readBackup(text), 'copy')
    expect(result.copied).toHaveLength(1)
    expect(reg.trips()).toHaveLength(2)
    const copy = reg.trips().find((t) => t.id !== id)!
    expect(copy.title).toContain('清邁')
    expect(copy.title).toContain('副本')
    // 新的金鑰：副本不會跟原行程同步到一起
    expect(copy.key).not.toBe(reg.trip(id)!.key)

    const c = await openTrip(reg, copy.id, false)
    expect(c.trip.meta.id).toBe(copy.id)
    expect(c.trip.items.get(itemId)?.title).toBe('晚餐')
    c.close()
    const o = await openTrip(reg, id, false)
    expect(o.trip.items.get(itemId)?.title).toBe('晚餐改地點')
    o.close()
  })

  it('手機上已經是別的身分時，不會被備份裡的身分換掉', async () => {
    const old = await usedPhone()
    const text = await createBackup(old.reg)
    newPhone()
    const reg = await Registry.open()
    reg.setNickname('媽媽')
    const mine = reg.me()!.pubkey
    const result = await restoreBackup(reg, await readBackup(text), 'merge')
    expect(result.identity).toBe('kept')
    expect(reg.me()).toMatchObject({ nickname: '媽媽', pubkey: mine })
    expect(reg.trips()).toHaveLength(1)
  })
})

describe('移除與刪除行程', () => {
  it('從這支手機移除：登記簿和所有內容都清掉，包含私人清單與訂位代號', async () => {
    const { reg, id, flight } = await usedPhone()
    await removeTrip(reg, id)
    expect(reg.trips()).toHaveLength(0)
    expect(reg.trip(id)).toBeUndefined()

    // 用同一個 ID 再打開，看到的是空的
    reg.upsertTrip({ id, key: 'x'.repeat(43), title: '', startDate: '', endDate: '' })
    const { trip, close } = await openTrip(reg, id, false)
    expect(trip.meta.id).toBeUndefined()
    expect(trip.items.all()).toHaveLength(0)
    expect(trip.allLists()).toHaveLength(0)
    expect(trip.getPnr(flight)).toBeUndefined()
    close()
  })

  it('移除一份不影響其他行程，備份裡也不再有它', async () => {
    const { reg, id } = await usedPhone()
    const other = await createTrip(reg, { title: '東京', startDate: '2027-06-01', endDate: '2027-06-05' })
    await removeTrip(reg, id)
    expect(reg.trips().map((t) => t.id)).toEqual([other])
    const data = await readBackup(await createBackup(reg))
    expect(data.trips.map((t) => t.title)).toEqual(['東京'])
  })

  it('管理員刪除行程：做記號、留紀錄，可以取消', async () => {
    const { reg, id, itemId } = await usedPhone()
    const { trip, close } = await openTrip(reg, id, false)
    expect(trip.meta.deleted ?? null).toBeNull()
    trip.setDeleted(true)
    expect(trip.meta.deleted).toMatchObject({ by: reg.me()!.pubkey })
    // 內容沒有真的清掉
    expect(trip.items.get(itemId)?.title).toBe('晚餐')
    const entry = trip.historyEntries().at(-1)!
    expect(entry).toMatchObject({ coll: 'trip', op: 'delete' })
    trip.revert(entry)
    expect(trip.meta.deleted ?? null).toBeNull()
    close()
  })
})

describe('單趟行程的檔案', () => {
  it('只有那一趟，沒有身分金鑰，也沒有訂位代號；私人清單有帶', async () => {
    const { reg, id } = await usedPhone()
    await createTrip(reg, { title: '東京', startDate: '2027-06-01', endDate: '2027-06-05' })
    const text = await createBackup(reg, '', id)
    expect(text).not.toContain(reg.me()!.sk)
    expect(text).not.toContain('PNRSECRET')
    const data = await readBackup(text)
    expect(data.me).toBeUndefined()
    expect(data.trips.map((t) => t.title)).toEqual(['清邁'])
    expect(data.trips[0].key).toBe(reg.trip(id)!.key)
  })

  it('在另一支手機載入：行程回來，用那支手機原本的身分', async () => {
    const old = await usedPhone()
    const text = await createBackup(old.reg, '', old.id)

    newPhone()
    const reg = await Registry.open()
    reg.setNickname('媽媽')
    const mine = reg.me()!.pubkey
    const result = await restoreBackup(reg, await readBackup(text), 'merge')
    expect(result).toMatchObject({ identity: 'none', added: ['清邁'] })
    expect(reg.me()).toMatchObject({ nickname: '媽媽', pubkey: mine })

    const { trip, close } = await openTrip(reg, old.id, false)
    expect(trip.items.get(old.itemId)?.title).toBe('晚餐')
    expect(trip.allLists().map((l) => l.title)).toEqual(['私人清單'])
    // 還不是成員；打開行程後畫面會以這支手機的身分加入
    expect(trip.members.get(mine)).toBeUndefined()
    close()
  })

  it('手機上還沒有身分時不能載入單趟檔案，並說明原因', async () => {
    const old = await usedPhone()
    const text = await createBackup(old.reg, '', old.id)
    newPhone()
    const reg = await Registry.open()
    await expect(restoreBackup(reg, await readBackup(text), 'merge')).rejects.toThrow('先取一個暱稱')
    expect(reg.trips()).toHaveLength(0)
  })

  it('設密碼、另存成副本都跟完整備份一樣能用', async () => {
    const { reg, id } = await usedPhone()
    const text = await createBackup(reg, '密碼', id)
    await expect(readBackup(text)).rejects.toMatchObject({ code: 'need-password' })
    const result = await restoreBackup(reg, await readBackup(text, '密碼'), 'copy')
    expect(result.copied).toHaveLength(1)
    expect(reg.trips()).toHaveLength(2)
  })
})

describe('更改顯示名稱', () => {
  it('套用到手機上每一份行程裡的自己', async () => {
    const { reg, id } = await usedPhone()
    const other = await createTrip(reg, { title: '東京', startDate: '2027-06-01', endDate: '2027-06-05' })
    expect(await renameEverywhere(reg, '把拔')).toBe(2)
    expect(reg.me()!.nickname).toBe('把拔')
    for (const tripId of [id, other]) {
      const { trip, close } = await openTrip(reg, tripId, false)
      expect(trip.nicknameOf(reg.me()!.pubkey)).toBe('把拔')
      close()
    }
    // 再改成一樣的名字：沒有東西要改
    expect(await renameEverywhere(reg, '把拔')).toBe(0)
  })
})

describe('備份裡的照片', () => {
  const pic = new Uint8Array(40_000).map((_, i) => (i * 13) % 251)

  it('完整備份帶著照片；換新手機還原後不用網路也看得到', async () => {
    const { reg, id } = await usedPhone()
    const a = await openTrip(reg, id, false)
    await a.photos.add('item1', pic)
    a.close()
    const text = await createBackup(reg)
    const data = await readBackup(text)
    expect(Object.keys(data.trips[0].blobs ?? {})).toHaveLength(1)

    newPhone()
    const fresh = await Registry.open()
    await restoreBackup(fresh, data, 'merge')
    const b = await openTrip(fresh, id, false)
    expect(await b.photos.get('item1')).toEqual({ state: 'ready', data: pic })
    b.close()
  })

  it('備份檔裡被動過手腳的照片不收', async () => {
    const { reg, id } = await usedPhone()
    const a = await openTrip(reg, id, false)
    await a.photos.add('item1', pic)
    a.close()
    const data = await readBackup(await createBackup(reg))
    const hash = Object.keys(data.trips[0].blobs!)[0]
    data.trips[0].blobs![hash] = btoa('not the original photo')

    newPhone()
    const fresh = await Registry.open()
    await restoreBackup(fresh, data, 'merge')
    const b = await openTrip(fresh, id, false)
    expect(await b.photos.get('item1')).toEqual({ state: 'missing' })
    b.close()
  })

  it('另存成副本：照片跟著過去，並記成要補傳（副本是新的金鑰）', async () => {
    const { reg, id } = await usedPhone()
    const a = await openTrip(reg, id, false)
    await a.photos.add('item1', pic)
    a.close()
    await restoreBackup(reg, await readBackup(await createBackup(reg)), 'copy')
    const copy = reg.trips().find((t) => t.id !== id)!
    const c = await openTrip(reg, copy.id, false)
    expect(await c.photos.get('item1')).toEqual({ state: 'ready', data: pic })
    expect(await c.photos.blobs.pending()).toHaveLength(1)
    c.close()
  })

  it('從手機移除行程：照片檔也清掉', async () => {
    const { reg, id } = await usedPhone()
    const a = await openTrip(reg, id, false)
    await a.photos.add('item1', pic)
    a.close()
    await removeTrip(reg, id)
    reg.upsertTrip({ id, key: 'x'.repeat(43), title: '', startDate: '', endDate: '' })
    const b = await openTrip(reg, id, false)
    expect(await b.photos.blobs.keys()).toHaveLength(0)
    b.close()
  })
})
