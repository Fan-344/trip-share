// 行程金鑰與加解密（規格書第 11 節）：離開手機的資料一律先用 AES-GCM 加密。

export interface TripKey {
  raw: Uint8Array
  aes: CryptoKey
}

const buf = (u: Uint8Array) => u as unknown as BufferSource

export const newKeyBytes = (): Uint8Array => crypto.getRandomValues(new Uint8Array(32))

export async function importKey(raw: Uint8Array): Promise<TripKey> {
  if (raw.length !== 32) throw new Error('行程金鑰長度不對')
  const aes = await crypto.subtle.importKey('raw', buf(raw), 'AES-GCM', false, ['encrypt', 'decrypt'])
  return { raw, aes }
}

/** 輸出：12 位元組隨機 IV ＋ 密文（含驗證碼）。 */
export async function encrypt(key: TripKey, plain: Uint8Array): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: buf(iv) }, key.aes, buf(plain)))
  const out = new Uint8Array(12 + ct.length)
  out.set(iv)
  out.set(ct, 12)
  return out
}

/** 金鑰不對或內容被改過會丟出例外。 */
export async function decrypt(key: TripKey, data: Uint8Array): Promise<Uint8Array> {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: buf(data.subarray(0, 12)) }, key.aes, buf(data.subarray(12)),
  )
  return new Uint8Array(plain)
}

/**
 * 中繼站上用來找到這份行程的標籤。由金鑰算出來，所以中繼站看不到行程 ID，
 * 沒有金鑰的人也算不出該訂閱哪個標籤。
 */
export async function roomTag(key: TripKey, tripId: string, docName: string): Promise<string> {
  const label = new TextEncoder().encode(`trip-room:${tripId}:${docName}:`)
  const input = new Uint8Array(label.length + key.raw.length)
  input.set(label)
  input.set(key.raw, label.length)
  return hex.enc(new Uint8Array(await crypto.subtle.digest('SHA-256', buf(input)))).slice(0, 32)
}

export const hex = {
  enc: (u: Uint8Array): string => [...u].map((b) => b.toString(16).padStart(2, '0')).join(''),
  dec: (s: string): Uint8Array => new Uint8Array((s.match(/../g) ?? []).map((h) => parseInt(h, 16))),
}

export const b64 = {
  enc(u: Uint8Array): string {
    let s = ''
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000))
    return btoa(s)
  },
  dec(s: string): Uint8Array {
    const bin = atob(s)
    const u = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i)
    return u
  },
}

/** 放在網址裡用的寫法（不含 + / =）。 */
export const b64url = {
  enc: (u: Uint8Array): string => b64.enc(u).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s: string): Uint8Array => b64.dec(s.replace(/-/g, '+').replace(/_/g, '/')),
}
