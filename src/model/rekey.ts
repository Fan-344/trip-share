// 移出成員時換行程金鑰（規格書第 7、11 節）。
//
// 沒有伺服器可以「撤銷」誰的權限，所以把人移出的做法是：換一把新的行程金鑰，只交給留下來的人。
// 被移出的人手上還是舊金鑰，之後的內容都用新金鑰加密、放在新的位置，他看不到也改不了。
// （他已經下載到手機上的內容收不回來。）
//
// 新金鑰怎麼交給留下的人：管理員用自己的私鑰和對方的公鑰算出一把只有兩人知道的鑰匙（NIP-44），
// 把新金鑰加密後寫進行程文件。每個留下的人各一份，只有本人解得開。
import { decrypt, encrypt, getConversationKey } from 'nostr-tools/nip44'
import { b64url, hex, newKeyBytes } from '../sync/crypto'

export interface Rekey {
  id: string
  at: number
  /** 誰換的（公鑰）。 */
  by: string
  /** 換之前那把金鑰的指紋；用來接成一條鏈，知道哪一筆接在哪一筆後面。 */
  prev: string
  /** 新金鑰的指紋。 */
  next: string
  /** 這次移出的人。 */
  removed: string[]
  /** 給每個留下的人的新金鑰（公鑰 → 加密後的內容）。 */
  keys: Record<string, string>
}

/** 金鑰的指紋：只用來比對是不是同一把，推不回金鑰本身。 */
export async function keyHash(key: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', b64url.dec(key) as unknown as BufferSource)
  return hex.enc(new Uint8Array(digest)).slice(0, 24)
}

/** 產生一筆換金鑰的紀錄。recipients 是留下來、有手機的成員（含自己）。 */
export async function makeRekey(o: {
  id: string
  by: string
  bySk: Uint8Array
  oldKey: string
  removed: string[]
  recipients: string[]
}): Promise<{ entry: Rekey; newKey: string }> {
  const newKey = b64url.enc(newKeyBytes())
  const keys: Record<string, string> = {}
  for (const pub of o.recipients) keys[pub] = encrypt(newKey, getConversationKey(o.bySk, pub))
  const entry: Rekey = {
    id: o.id, at: Date.now(), by: o.by, removed: o.removed, keys,
    prev: await keyHash(o.oldKey), next: await keyHash(newKey),
  }
  return { entry, newKey }
}

export type ChainResult =
  /** 我手上的就是最新的金鑰。 */
  | { status: 'current' }
  /** 金鑰換過了，這是我該換成的新金鑰。 */
  | { status: 'rotated'; key: string }
  /** 金鑰換過了，但沒有給我的那一份：我被移出了。 */
  | { status: 'removed'; by: string; at: number }

/**
 * 從我手上的金鑰出發，沿著換金鑰的紀錄一路往後走，走到最新的那一把。
 * 兩個管理員同時換金鑰時會有兩筆接在同一把後面：大家一律選 id 比較小的那筆，才不會分成兩邊。
 */
export async function followChain(entries: Rekey[], myKey: string, me: { pubkey: string; sk: Uint8Array }): Promise<ChainResult> {
  let key = myKey
  let h = await keyHash(key)
  for (let step = 0; step < 100; step++) {
    const next = entries.filter((e) => e.prev === h).sort((a, b) => a.id.localeCompare(b.id))[0]
    if (!next) break
    const wrapped = next.keys[me.pubkey]
    if (!wrapped) return { status: 'removed', by: next.by, at: next.at }
    let unwrapped: string
    try {
      unwrapped = decrypt(wrapped, getConversationKey(me.sk, next.by))
    } catch {
      break // 解不開（紀錄損毀或不是給我的）：停在目前這把，不亂換
    }
    if ((await keyHash(unwrapped)) !== next.next) break
    key = unwrapped
    h = next.next
  }
  return key === myKey ? { status: 'current' } : { status: 'rotated', key }
}
