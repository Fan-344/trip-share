// 照片：拍照或選圖後先在手機上縮小，再存進行程。原圖不會離開手機。
import { useEffect, useRef, useState } from 'preact/hooks'
import type { PhotoStore } from '../store/photos'
import { Icon } from './Icons'
import { Overlay, useEscape, useScrollLock } from './kit'

/** 長邊縮到 max 像素、轉成 JPEG。一張大約 40–80 KB，同步起來才不會太重。 */
export async function shrinkImage(file: Blob, max = 720, quality = 0.72): Promise<Uint8Array> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (!blob) throw new Error('這張圖片處理不了')
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** 把存著的照片變成可以顯示的網址；元件消失時釋放。 */
export function usePhotoUrl(data: Uint8Array | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!data) return setUrl(null)
    const u = URL.createObjectURL(new Blob([data as unknown as BlobPart], { type: 'image/jpeg' }))
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [data])
  return url
}

/**
 * 全螢幕看照片。
 * - 點照片：放大／縮回；放大後用手指拖著看。
 * - 點照片以外的地方、右上角的叉叉、或按 Esc：關閉。
 */
export function Lightbox({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  const [zoomed, setZoomed] = useState(false)
  useScrollLock()
  useEscape(onClose)
  return (
    <Overlay>
      <div class={`lightbox ${zoomed ? 'zoomed' : ''}`} role="dialog" aria-label={name} onClick={onClose}>
        <img src={url} alt={name} onClick={(e) => { e.stopPropagation(); setZoomed(!zoomed) }} />
        <button class="lightbox-close" aria-label="關閉" onClick={(e) => { e.stopPropagation(); onClose() }}>
          <Icon id="close" size={22} />
        </button>
        <div class="lightbox-hint">{zoomed ? '點照片縮回' : '點照片放大'}・點旁邊關閉</div>
      </div>
    </Overlay>
  )
}

/** 表單裡的照片欄：沒有照片時是一顆大按鈕；有的話顯示預覽，可以換或拿掉。 */
export function PhotoField({ value, onChange }: { value: Uint8Array | null; onChange: (v: Uint8Array | null) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const url = usePhotoUrl(value)
  const pick = async (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    ;(e.target as HTMLInputElement).value = ''
    if (!file) return
    setBusy(true)
    setError('')
    try {
      onChange(await shrinkImage(file))
    } catch {
      setError('這張圖片處理不了，換一張試試。')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div class="photofield">
      {/* accept="image/*"：手機會讓人選「拍照」或「照片圖庫」 */}
      <input ref={input} type="file" accept="image/*" onChange={pick} hidden />
      {url ? (
        <div>
          <img class="photo" src={url} alt="照片預覽" />
          <div class="row" style="margin-top:6px">
            <button type="button" class="small" onClick={() => input.current?.click()}>換一張</button>
            <button type="button" class="small" onClick={() => onChange(null)}>拿掉照片</button>
          </div>
        </div>
      ) : (
        <button type="button" class="add" style="margin-top:0" disabled={busy} onClick={() => input.current?.click()}>
          <Icon id="camera" size={22} />{busy ? '處理中…' : '加照片'}
        </button>
      )}
      {error && <p class="muted">{error}</p>}
    </div>
  )
}

/**
 * 讀一筆的照片。照片可能要去資料庫或中繼站拿，所以會先經過「載入中」。
 * version：照片換了就給不同的值（例如照片索引的 ID），才會重讀。
 * 抓不到的話每 15 秒再試一次，最多試幾次——可能只是對方還沒上傳完。
 */
export function usePhoto(photos: PhotoStore, ref: string, version: unknown): { state: 'none' | 'loading' | 'ready' | 'missing'; url: string | null } {
  const [data, setData] = useState<Uint8Array | null>(null)
  const [state, setState] = useState<'none' | 'loading' | 'ready' | 'missing'>(photos.has(ref) ? 'loading' : 'none')
  useEffect(() => {
    let gone = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let tries = 0
    setData(null)
    if (!photos.has(ref)) {
      setState('none')
      return
    }
    setState('loading')
    const attempt = () => {
      void photos.get(ref).then((r) => {
        if (gone) return
        if (r.state === 'ready') setData(r.data)
        setState(r.state)
        if (r.state === 'missing' && ++tries < 8) timer = setTimeout(attempt, 15_000)
      })
    }
    attempt()
    return () => {
      gone = true
      clearTimeout(timer)
    }
  }, [ref, version])
  return { state, url: usePhotoUrl(data) }
}
