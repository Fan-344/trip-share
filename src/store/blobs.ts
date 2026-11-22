// 照片檔在這支手機上的儲存。每份行程一個資料庫，以照片內容的雜湊當檔名。
//
// 照片不放在行程的同步文件裡（那樣每多一張，所有人每次同步都要多搬一次），
// 文件裡只留「這筆有一張照片，雜湊是什麼」。照片本身存在這裡，需要時才向中繼站要。

const STORE = 'blobs'
const PENDING = 'pending'

export const blobDbName = (tripId: string): string => `trip:${tripId}:blobs`

function done<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export class BlobStore {
  private constructor(private readonly db: IDBDatabase) {}

  static open(tripId: string): Promise<BlobStore> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(blobDbName(tripId), 1)
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE)
        // 還沒成功送到任何中繼站的照片（離線時拍的）
        req.result.createObjectStore(PENDING)
      }
      req.onsuccess = () => resolve(new BlobStore(req.result))
      req.onerror = () => reject(req.error)
    })
  }

  static destroy(tripId: string): Promise<void> {
    return new Promise((resolve) => {
      const req = indexedDB.deleteDatabase(blobDbName(tripId))
      req.onsuccess = req.onerror = req.onblocked = () => resolve()
    })
  }

  close(): void {
    this.db.close()
  }

  async get(hash: string): Promise<Uint8Array | undefined> {
    const v = await done(this.db.transaction(STORE).objectStore(STORE).get(hash))
    return v ? new Uint8Array(v as ArrayBuffer) : undefined
  }

  async put(hash: string, bytes: Uint8Array): Promise<void> {
    // 存一份自己的拷貝，不跟呼叫的人共用同一塊記憶體
    await done(this.db.transaction(STORE, 'readwrite').objectStore(STORE).put(bytes.slice().buffer, hash))
  }

  async keys(): Promise<string[]> {
    return (await done(this.db.transaction(STORE).objectStore(STORE).getAllKeys())) as string[]
  }

  async pending(): Promise<string[]> {
    return (await done(this.db.transaction(PENDING).objectStore(PENDING).getAllKeys())) as string[]
  }

  async setPending(hash: string, pending: boolean): Promise<void> {
    const store = this.db.transaction(PENDING, 'readwrite').objectStore(PENDING)
    if (pending) await done(store.put(1, hash))
    else await done(store.delete(hash))
  }
}
