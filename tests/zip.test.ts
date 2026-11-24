import { describe, expect, it } from 'vitest'
import { canZip, decrypt, encrypt, gunzip, gzip, importKey, newKeyBytes, openZipped, sealZipped } from '../src/sync/crypto'

const text = (s: string) => new TextEncoder().encode(s)
// 像行程資料那樣：同樣的代號和欄位名稱一再出現
const repetitive = text(JSON.stringify(Array.from({ length: 200 }, (_, i) => ({
  id: `item-${i}`, createdBy: 'a'.repeat(64), updatedBy: 'b'.repeat(64), name: `第 ${i} 項`,
}))))

describe('壓縮', () => {
  it('測試環境有內建的壓縮功能', () => {
    expect(canZip()).toBe(true)
  })

  it('壓縮再解開，內容一模一樣；重複多的資料會小很多', async () => {
    const zipped = await gzip(repetitive)
    expect(zipped.length).toBeLessThan(repetitive.length / 5)
    expect(await gunzip(zipped)).toEqual(repetitive)
  })

  it('先壓縮再加密，解得回來', async () => {
    const key = await importKey(newKeyBytes())
    const sealed = await sealZipped(key, repetitive)
    expect(sealed.length).toBeLessThan(repetitive.length / 5)
    expect(await openZipped(key, sealed)).toEqual(repetitive)
  })

  it('還不認得壓縮的舊版 App 解不開壓縮過的內容：直接失敗，不會把壓縮過的位元組當成行程內容', async () => {
    const key = await importKey(newKeyBytes())
    const sealed = await sealZipped(key, repetitive)
    // 舊版的解法：不帶標記
    await expect(decrypt(key, sealed)).rejects.toThrow()
  })

  it('沒壓縮的內容不會被誤當成壓縮過的；金鑰不對也解不開', async () => {
    const key = await importKey(newKeyBytes())
    await expect(openZipped(key, await encrypt(key, repetitive))).rejects.toThrow()
    const other = await importKey(newKeyBytes())
    await expect(openZipped(other, await sealZipped(key, repetitive))).rejects.toThrow()
  })
})
