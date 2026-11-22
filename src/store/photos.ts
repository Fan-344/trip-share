// 一份行程的照片：把「文件裡的索引」「手機上的檔案」「中繼站上的檔案」三者接起來。
import type { Trip } from '../model/trip'
import type { BlobNet } from '../sync/blobs'
import { sha256Hex } from '../sync/crypto'
import type { BlobStore } from './blobs'

/** 多久檢查一次自己拍的照片還在不在中繼站上。 */
const VERIFY_EVERY = 24 * 3600_000

export type PhotoResult =
  /** 這筆沒有照片。 */
  | { state: 'none' }
  | { state: 'ready'; data: Uint8Array }
  /** 有照片，但現在抓不到（沒網路，或中繼站上還沒有）。之後再試。 */
  | { state: 'missing' }

export class PhotoStore {
  /** 已經讀進記憶體的照片，避免每次重畫都去讀資料庫。 */
  private readonly cache = new Map<string, Uint8Array>()
  private readonly fetching = new Map<string, Promise<Uint8Array | null>>()
  private timers: ReturnType<typeof setTimeout>[] = []
  private stopped = false

  constructor(
    private readonly trip: Trip,
    readonly blobs: BlobStore,
    /** 沒有同步（例如備份時只開本機資料）就是 null。 */
    private readonly net: BlobNet | null,
    private readonly lastVerify: { get(): number; set(t: number): void } = { get: () => 0, set: () => {} },
  ) {}

  /** 行程打開後呼叫：搬舊照片、補送離線時拍的、定期確認中繼站上還有。 */
  start(): void {
    this.timers.push(setTimeout(() => void this.maintain(), 3000))
  }

  stop(): void {
    this.stopped = true
    this.timers.forEach((t) => clearTimeout(t))
  }

  /** 這筆有沒有照片（只看索引，不管檔案在不在手機上）。 */
  has(ref: string): boolean {
    return !!this.trip.photoRecord(ref)
  }

  /** 新增或換掉一筆的照片。先存在手機上、寫進索引，再送到中繼站；沒網路就記著，之後補送。 */
  async add(ref: string, data: Uint8Array): Promise<void> {
    const hash = await sha256Hex(data)
    await this.blobs.put(hash, data)
    this.cache.set(hash, data)
    await this.blobs.setPending(hash, true)
    this.trip.setPhotoRef(ref, { hash, size: data.length })
    void this.upload(hash, data)
  }

  remove(ref: string): void {
    this.trip.setPhotoRef(ref, null)
  }

  async get(ref: string): Promise<PhotoResult> {
    const rec = this.trip.photoRecord(ref)
    if (!rec) return { state: 'none' }
    if (rec.data) return { state: 'ready', data: rec.data } // 舊版：照片就在紀錄裡
    if (!rec.hash) return { state: 'none' }
    const data = await this.load(rec.hash)
    return data ? { state: 'ready', data } : { state: 'missing' }
  }

  /** 手機上有就用手機上的，沒有才向中繼站要；要到了存起來。 */
  private async load(hash: string): Promise<Uint8Array | null> {
    const cached = this.cache.get(hash)
    if (cached) return cached
    const local = await this.blobs.get(hash)
    if (local) {
      this.cache.set(hash, local)
      return local
    }
    if (!this.net) return null
    // 同一張照片同時被好幾個地方要，只發一次請求
    let job = this.fetching.get(hash)
    if (!job) {
      job = this.net.fetch(hash).then(async (data) => {
        this.fetching.delete(hash)
        if (data) {
          await this.blobs.put(hash, data)
          this.cache.set(hash, data)
        }
        return data
      })
      this.fetching.set(hash, job)
    }
    return job
  }

  private async upload(hash: string, data: Uint8Array): Promise<boolean> {
    if (!this.net || this.stopped) return false
    const ok = (await this.net.publish(hash, data)) > 0
    // 至少一台收下就不算「還沒送」；其他台之後的定期檢查會補
    if (ok) await this.blobs.setPending(hash, false)
    return ok
  }

  private async maintain(): Promise<void> {
    if (this.stopped) return
    try {
      await this.migrateLegacy()
      await this.flushPending()
      if (this.net && this.net.connected().length > 0 && Date.now() - this.lastVerify.get() > VERIFY_EVERY) {
        await this.verify()
        this.lastVerify.set(Date.now())
      }
    } catch (e) {
      console.error('照片維護失敗', e)
    }
    // 離線時拍的照片：之後每分鐘再看一次有沒有連上
    if (!this.stopped) this.timers.push(setTimeout(() => void this.maintain(), 60_000))
  }

  /** 把還沒送到中繼站的照片（離線時拍的）送出去。回傳這次送成功幾張。 */
  async flushPending(): Promise<number> {
    let sent = 0
    for (const hash of await this.blobs.pending()) {
      const data = await this.blobs.get(hash)
      if (!data) await this.blobs.setPending(hash, false)
      else if (await this.upload(hash, data)) sent++
    }
    return sent
  }

  /** 舊版放在同步文件裡的照片：我拍的就搬成新的存法，文件才會瘦下來。 */
  async migrateLegacy(): Promise<void> {
    for (const p of this.trip.photos.all()) {
      if (p.data && p.createdBy === this.trip.actor.pubkey) await this.add(p.ref, p.data)
    }
  }

  /** 我拍的照片，逐台中繼站確認還在；不見的補傳。 */
  async verify(): Promise<number> {
    if (!this.net) return 0
    const mine = new Map<string, Uint8Array>()
    for (const p of this.trip.photos.all()) {
      if (!p.hash || p.createdBy !== this.trip.actor.pubkey) continue
      const data = await this.blobs.get(p.hash)
      if (data) mine.set(p.hash, data)
    }
    let resent = 0
    for (const [relay, hashes] of await this.net.missing([...mine.keys()])) {
      for (const hash of hashes) {
        if ((await this.net.publish(hash, mine.get(hash)!, [relay])) > 0) resent++
      }
    }
    return resent
  }
}
