import { describe, expect, it } from 'vitest'
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure'
import { followChain, keyHash, makeRekey } from '../src/model/rekey'
import { b64url, newKeyBytes } from '../src/sync/crypto'

const person = () => {
  const sk = generateSecretKey()
  return { sk, pubkey: getPublicKey(sk) }
}
const newKey = () => b64url.enc(newKeyBytes())

describe('移出成員時換金鑰', () => {
  it('留下的人拿到新金鑰，被移出的人拿不到', async () => {
    const [dad, mom, guest] = [person(), person(), person()]
    const k1 = newKey()
    const { entry, newKey: k2 } = await makeRekey({
      id: 'r1', by: dad.pubkey, bySk: dad.sk, oldKey: k1, removed: [guest.pubkey], recipients: [dad.pubkey, mom.pubkey],
    })
    expect(k2).not.toBe(k1)
    expect(await followChain([entry], k1, dad)).toEqual({ status: 'rotated', key: k2 })
    expect(await followChain([entry], k1, mom)).toEqual({ status: 'rotated', key: k2 })
    expect(await followChain([entry], k1, guest)).toMatchObject({ status: 'removed', by: dad.pubkey })
    // 紀錄裡看不到新金鑰本身，也沒有給被移出的人的那一份
    expect(JSON.stringify(entry)).not.toContain(k2)
    expect(entry.keys[guest.pubkey]).toBeUndefined()
  })

  it('已經換到最新金鑰的人：維持現狀', async () => {
    const [dad, mom] = [person(), person()]
    const k1 = newKey()
    const { entry, newKey: k2 } = await makeRekey({ id: 'r1', by: dad.pubkey, bySk: dad.sk, oldKey: k1, removed: [], recipients: [dad.pubkey, mom.pubkey] })
    expect(await followChain([entry], k2, mom)).toEqual({ status: 'current' })
    expect(await followChain([], k1, mom)).toEqual({ status: 'current' })
  })

  it('離線很久的人：一次跟上連續換過兩次的金鑰', async () => {
    const [dad, mom, a, b] = [person(), person(), person(), person()]
    const k1 = newKey()
    const first = await makeRekey({ id: 'r1', by: dad.pubkey, bySk: dad.sk, oldKey: k1, removed: [a.pubkey], recipients: [dad.pubkey, mom.pubkey, b.pubkey] })
    const second = await makeRekey({ id: 'r2', by: mom.pubkey, bySk: mom.sk, oldKey: first.newKey, removed: [b.pubkey], recipients: [dad.pubkey, mom.pubkey] })
    const entries = [second.entry, first.entry]
    expect(await followChain(entries, k1, dad)).toEqual({ status: 'rotated', key: second.newKey })
    expect(await followChain(entries, k1, a)).toMatchObject({ status: 'removed' })
    // b 第一次還在、第二次被移出
    expect(await followChain(entries, k1, b)).toMatchObject({ status: 'removed', by: mom.pubkey })
  })

  it('兩個管理員同時換金鑰：所有人選到同一筆，不會分成兩邊', async () => {
    const [dad, mom, kid] = [person(), person(), person()]
    const k1 = newKey()
    const everyone = [dad.pubkey, mom.pubkey, kid.pubkey]
    const x = await makeRekey({ id: 'aaa', by: dad.pubkey, bySk: dad.sk, oldKey: k1, removed: [], recipients: everyone })
    const y = await makeRekey({ id: 'bbb', by: mom.pubkey, bySk: mom.sk, oldKey: k1, removed: [], recipients: everyone })
    for (const order of [[x.entry, y.entry], [y.entry, x.entry]]) {
      for (const p of [dad, mom, kid]) expect(await followChain(order, k1, p)).toEqual({ status: 'rotated', key: x.newKey })
    }
  })

  it('別人拿不到給我的那一份；被動過手腳的紀錄不會讓我換到錯的金鑰', async () => {
    const [dad, mom, stranger] = [person(), person(), person()]
    const k1 = newKey()
    const { entry } = await makeRekey({ id: 'r1', by: dad.pubkey, bySk: dad.sk, oldKey: k1, removed: [], recipients: [dad.pubkey, mom.pubkey] })
    // 陌生人把媽媽那份抄到自己名下：解不開，停在原地
    const stolen = { ...entry, keys: { ...entry.keys, [stranger.pubkey]: entry.keys[mom.pubkey] } }
    expect(await followChain([stolen], k1, stranger)).toEqual({ status: 'current' })
    // 指紋對不上的紀錄不採用
    const forged = { ...entry, next: await keyHash(newKey()) }
    expect(await followChain([forged], k1, mom)).toEqual({ status: 'current' })
  })
})
