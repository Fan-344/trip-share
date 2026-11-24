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

/** 輸出：12 位元組隨機 IV ＋ 密文（含驗證碼）。aad 是一起驗證、但不加密的標記；解密時要給一樣的才解得開。 */
export async function encrypt(key: TripKey, plain: Uint8Array, aad?: Uint8Array): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: buf(iv), ...(aad && { additionalData: buf(aad) }) }, key.aes, buf(plain)))
  const out = new Uint8Array(12 + ct.length)
  out.set(iv)
  out.set(ct, 12)
  return out
}

/** 金鑰不對或內容被改過會丟出例外。 */
export async function decrypt(key: TripKey, data: Uint8Array, aad?: Uint8Array): Promise<Uint8Array> {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: buf(data.subarray(0, 12)), ...(aad && { additionalData: buf(aad) }) }, key.aes, buf(data.subarray(12)),
  )
  return new Uint8Array(plain)
}

// ---- 壓縮（整份行程的快照用）----
//
// 行程資料裡同樣的東西一再出現（成員代號、欄位名稱），壓縮後只剩四分之一左右。
// 要先壓縮再加密：加密過的內容看起來像亂數，壓不動。
// 太小的東西壓了反而變大，所以平常一筆一筆的小變動不壓。

/** 這個瀏覽器有沒有內建的壓縮功能（比較舊的 iPhone 沒有）。 */
export const canZip = (): boolean =>
  typeof CompressionStream === 'function' && typeof DecompressionStream === 'function'

async function through(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const piped = new Blob([buf(data)]).stream().pipeThrough(stream as unknown as ReadableWritablePair<Uint8Array, Uint8Array>)
  return new Uint8Array(await new Response(piped).arrayBuffer())
}

export const gzip = (data: Uint8Array): Promise<Uint8Array> => through(data, new CompressionStream('gzip'))
export const gunzip = (data: Uint8Array): Promise<Uint8Array> => through(data, new DecompressionStream('gzip'))

/**
 * 壓縮過的內容加密時多帶這個標記。
 * 還不認得壓縮的舊版 App 會用「沒有標記」的方式去解，一定解不開、直接放棄；
 * 不這樣做的話，它會把壓縮過的位元組當成行程內容塞進文件裡。
 */
const ZIP_MARK = new TextEncoder().encode('all-aboard:gzip:1')

/** 先壓縮再加密。 */
export async function sealZipped(key: TripKey, plain: Uint8Array): Promise<Uint8Array> {
  return encrypt(key, await gzip(plain), ZIP_MARK)
}

/** 解開 sealZipped 的內容。金鑰不對、內容被改過、或其實不是壓縮過的，都會丟出例外。 */
export async function openZipped(key: TripKey, data: Uint8Array): Promise<Uint8Array> {
  return gunzip(await decrypt(key, data, ZIP_MARK))
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
  // 補回 = ：不是每個瀏覽器的 atob 都接受沒有補齊的寫法。
  dec: (s: string): Uint8Array =>
    b64.dec(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)),
}

// ---- 照片檔用 ----

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return hex.enc(new Uint8Array(await crypto.subtle.digest('SHA-256', buf(bytes))))
}

async function derive(key: TripKey, label: string): Promise<Uint8Array> {
  const l = new TextEncoder().encode(label)
  const input = new Uint8Array(l.length + key.raw.length)
  input.set(l)
  input.set(key.raw, l.length)
  return new Uint8Array(await crypto.subtle.digest('SHA-256', buf(input)))
}

/** 一張照片在中繼站上的標籤。由金鑰和照片內容的雜湊算出，中繼站看不出是哪份行程、也看不出內容。 */
export async function blobTag(key: TripKey, tripId: string, hash: string): Promise<string> {
  return hex.enc(await derive(key, `blob:${tripId}:${hash}:`)).slice(0, 32)
}

/**
 * 加密一張照片。跟一般訊息不同，這裡的 IV 是由金鑰和照片內容算出來的，所以同一張照片每次加密的結果都一樣：
 * 重傳不會產生另一份、不同手機傳的切塊可以互相拼。
 * （同一把金鑰下，同一個 IV 只會配同一份內容，所以沒有 IV 重複使用的問題。）
 */
export async function encryptBlob(key: TripKey, hash: string, plain: Uint8Array): Promise<Uint8Array> {
  const iv = (await derive(key, `blob-iv:${hash}:`)).subarray(0, 12)
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: buf(iv) }, key.aes, buf(plain)))
  const out = new Uint8Array(12 + ct.length)
  out.set(iv)
  out.set(ct, 12)
  return out
}
